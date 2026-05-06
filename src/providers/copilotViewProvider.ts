import * as vscode from 'vscode';
import { sendCopilotMessage, getCopilotHistory, clearCopilotHistory, stopCopilot, ChatHistoryEntry } from '../api/copilot';
import { getLicenseFeatures } from '../api/project';
import { getSignalRClient } from '../api/signalr';
import { log } from '../views/outputChannel';
import { ProjectTreeProvider } from './projectTreeProvider';

export class CopilotViewProvider implements vscode.WebviewViewProvider {

    public static readonly viewType = 'tiaCopilotChat';
    private view?: vscode.WebviewView;
    private projectPath?: string;
    private signalRDispose?: () => void;
    private isBusy = false;
    private busyTimeout?: ReturnType<typeof setTimeout>;
    private lastSentText = '';
    private treeProvider?: ProjectTreeProvider;
    private chatHistory: ChatHistoryEntry[] = [];

    setTreeProvider(provider: ProjectTreeProvider): void {
        this.treeProvider = provider;
    }

    constructor(private readonly extensionUri: vscode.Uri) {
        this.signalRDispose = getSignalRClient().onMessage((_hub, method, args) => {
            const m = method.toLowerCase();
            log(`[Copilot SignalR] ${method} args=${JSON.stringify(args).substring(0, 200)}`);

            switch (m) {
                case 'onintermediateresponse': {
                    const content = String(args[0] ?? '');
                    if (content) {
                        this.chatHistory.push({ Role: 'assistant', Content: content });
                        this.postMessage({ type: 'addMessage', role: 'assistant', content });
                        this.resetBusyTimeout();
                    }
                    break;
                }
                case 'onusermessage': {
                    const content = String(args[0] ?? '');
                    // Skip echo of our own message (already shown locally and already in chatHistory)
                    if (content && content !== this.lastSentText) {
                        log(`[Copilot SignalR] onUserMessage (external): ${content.substring(0, 80)}`);
                        this.chatHistory.push({ Role: 'user', Content: content });
                        this.postMessage({ type: 'addMessage', role: 'user', content });
                    } else {
                        log('[Copilot SignalR] onUserMessage (echo, skipped)');
                        this.lastSentText = '';
                    }
                    break;
                }
                case 'ontoolexecution': {
                    const toolMsg = String(args[0] ?? '');
                    if (toolMsg) {
                        // Track tool executions as [System] messages in history for LLM context
                        this.chatHistory.push({ Role: 'user', Content: `[System] ${toolMsg}` });
                        this.postMessage({ type: 'toolExecution', message: toolMsg });
                        this.resetBusyTimeout();
                    }
                    break;
                }
                case 'onassistantresponse': {
                    // Final response — copilot is done
                    const data = (args[0] ?? {}) as Record<string, unknown>;
                    const content = String(data.Content ?? data.content ?? '');
                    const success = data.Success ?? data.success;
                    const error = String(data.ErrorMessage ?? data.errorMessage ?? '');

                    log(`[Copilot SignalR] Assistant response: success=${success} content=${content.substring(0, 100)}`);

                    if (content) {
                        this.chatHistory.push({ Role: 'assistant', Content: content });
                        this.postMessage({ type: 'addMessage', role: 'assistant', content });
                    }
                    if (!success && error) {
                        this.postMessage({ type: 'error', message: error });
                    }
                    this.setBusy(false);
                    break;
                }
                case 'ontokenusage': {
                    // Optional — log token usage
                    log(`[Copilot SignalR] Token usage: ${JSON.stringify(args[0])}`);
                    break;
                }
            }
        });
    }

    setProjectPath(path: string): void {
        this.projectPath = path;
    }

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ): void {
        this.view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
        };

        webviewView.webview.html = this.getHtml();

        webviewView.webview.onDidReceiveMessage(async (msg) => {
            switch (msg.type) {
                case 'ready':
                    await this.onReady();
                    break;
                case 'send':
                    await this.onSend(msg.text);
                    break;
                case 'stop':
                    await this.onStop();
                    break;
                case 'clear':
                    await this.onClear();
                    break;
                case 'openBlock':
                    await this.onOpenBlock(msg.blockName);
                    break;
            }
        });
    }

    async clearHistory(): Promise<void> {
        await this.onClear();
    }

    async stop(): Promise<void> {
        await this.onStop();
    }

    private async onReady(): Promise<void> {
        try {
            const license = await getLicenseFeatures();
            const aiFeature = license.Features?.find(f => f.Key === 'ai' || f.Key === 'copilot' || f.Key === 'assistant');
            if (aiFeature && !aiFeature.Enabled) {
                this.postMessage({ type: 'licenseBlocked' });
                return;
            }
        } catch {
            // License check failed — continue anyway
        }

        await this.loadHistory();
    }

    private async loadHistory(): Promise<void> {
        try {
            let history = await getCopilotHistory(this.projectPath);
            if (history.length === 0 && this.projectPath) {
                const unfiltered = await getCopilotHistory();
                if (unfiltered.length > 0) {
                    log('[Copilot] projectKey mismatch — switching to unfiltered');
                    this.projectPath = undefined;
                    history = unfiltered;
                }
            }
            // Pre-fill chatHistory from server history so subsequent messages have context
            this.chatHistory = history.map(m => ({
                Role: m.Role,
                Content: m.Content,
            }));
            this.postMessage({ type: 'history', messages: history });
        } catch {
            // No history or API unavailable
        }
    }

    private async onSend(text: string): Promise<void> {
        if (!text?.trim()) { return; }

        this.postMessage({ type: 'addMessage', role: 'user', content: text });
        this.chatHistory.push({ Role: 'user', Content: text });
        this.lastSentText = text;

        try {
            // Send history (max 20 most recent messages, truncated to avoid huge payloads)
            const maxHistory = 20;
            const historyToSend = this.chatHistory.length > maxHistory + 1
                ? this.chatHistory.slice(-(maxHistory + 1), -1)  // exclude current message
                : this.chatHistory.slice(0, -1);  // exclude current message

            log(`[Copilot] Sending: "${text.substring(0, 60)}" with ${historyToSend.length} history msgs`);
            await sendCopilotMessage(text, historyToSend, vscode.env.language);
            log('[Copilot] Message sent — waiting for SignalR events');
            this.setBusy(true);
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            log(`[Copilot] Send FAILED: ${message}`);
            this.postMessage({ type: 'error', message });
        }
    }

    private async onStop(): Promise<void> {
        try {
            await stopCopilot();
        } catch {
            // Ignore
        }
        this.setBusy(false);
    }

    private async onClear(): Promise<void> {
        this.setBusy(false);
        this.chatHistory = [];
        try {
            await clearCopilotHistory(this.projectPath);
        } catch {
            // Ignore
        }
        this.postMessage({ type: 'clearAll' });
    }

    private async onOpenBlock(blockName: string): Promise<void> {
        if (!blockName || !this.treeProvider) { return; }
        try {
            const item = await this.treeProvider.findBlockByName(blockName);
            if (item) {
                vscode.commands.executeCommand('tiaConnect.openBlock', item);
            } else {
                vscode.window.showWarningMessage(`Block "${blockName}" not found in project.`);
            }
        } catch (err) {
            log(`[Copilot] Failed to open block ${blockName}: ${err}`);
        }
    }

    private setBusy(busy: boolean): void {
        this.isBusy = busy;
        this.postMessage({ type: 'updateStatus', status: busy ? 'busy' : 'idle' });
        if (this.busyTimeout) {
            clearTimeout(this.busyTimeout);
            this.busyTimeout = undefined;
        }
        if (busy) {
            // Safety timeout — 5 min max
            this.busyTimeout = setTimeout(() => {
                log('[Copilot] Timeout (5 min) — stopping busy state');
                this.isBusy = false;
                this.postMessage({ type: 'error', message: 'Response timeout (5 min). Check T-IA Connect app.' });
                this.postMessage({ type: 'updateStatus', status: 'idle' });
            }, 5 * 60 * 1000);
        }
    }

    /** Reset the timeout when we receive activity (tool execution, intermediate message) */
    private resetBusyTimeout(): void {
        if (!this.isBusy) { return; }
        if (this.busyTimeout) {
            clearTimeout(this.busyTimeout);
        }
        this.busyTimeout = setTimeout(() => {
            log('[Copilot] Timeout (5 min) — stopping busy state');
            this.isBusy = false;
            this.postMessage({ type: 'error', message: 'Response timeout (5 min). Check T-IA Connect app.' });
            this.postMessage({ type: 'updateStatus', status: 'idle' });
        }, 5 * 60 * 1000);
    }

    private postMessage(msg: Record<string, unknown>): void {
        this.view?.webview.postMessage(msg);
    }

    dispose(): void {
        this.setBusy(false);
        this.signalRDispose?.();
    }

    private getHtml(): string {
        return /*html*/`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background: var(--vscode-sideBar-background, var(--vscode-editor-background));
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
}
.hidden { display: none !important; }
#messages {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
}
.msg {
    padding: 10px 14px;
    border-radius: 8px;
    word-wrap: break-word;
    overflow-wrap: break-word;
    line-height: 1.5;
}
.msg-user {
    align-self: flex-end;
    max-width: 85%;
    white-space: pre-wrap;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
}
.msg-assistant {
    align-self: flex-start;
    max-width: 100%;
    background: var(--vscode-editorWidget-background, #2a2d32);
    border: 1px solid var(--vscode-editorWidget-border, rgba(255,255,255,0.06));
}
.msg-assistant code {
    background: rgba(255,255,255,0.08);
    padding: 1px 5px;
    border-radius: 3px;
    font-family: var(--vscode-editor-font-family);
    font-size: 0.9em;
}
.msg-assistant pre {
    background: rgba(0,0,0,0.3);
    padding: 10px;
    border-radius: 4px;
    overflow-x: auto;
    margin: 6px 0;
    font-family: var(--vscode-editor-font-family);
    font-size: 0.88em;
    line-height: 1.4;
}
.msg-assistant table {
    border-collapse: collapse;
    margin: 8px 0;
    font-size: 0.88em;
    width: auto;
    max-width: 100%;
    display: block;
    overflow-x: auto;
}
.msg-assistant thead { display: table-header-group; }
.msg-assistant tbody { display: table-row-group; }
.msg-assistant tr { display: table-row; }
.msg-assistant th, .msg-assistant td {
    border: 1px solid rgba(255,255,255,0.12);
    padding: 5px 10px;
    text-align: left;
    white-space: nowrap;
}
.msg-assistant th {
    background: rgba(255,255,255,0.06);
    font-weight: 600;
}
.msg-assistant h1, .msg-assistant h2, .msg-assistant h3, .msg-assistant h4 {
    margin: 10px 0 4px 0;
    font-weight: 600;
    color: var(--vscode-foreground);
}
.msg-assistant h1 { font-size: 1.2em; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 4px; }
.msg-assistant h2 { font-size: 1.1em; }
.msg-assistant h3 { font-size: 1.0em; }
.msg-assistant h4 { font-size: 0.95em; }
.msg-assistant ul, .msg-assistant ol {
    margin: 4px 0;
    padding-left: 20px;
}
.msg-assistant li { margin: 2px 0; }
.msg-assistant p { margin: 4px 0; }
.msg-assistant hr { border: none; border-top: 1px solid rgba(255,255,255,0.1); margin: 8px 0; }
.msg-assistant a {
    color: var(--vscode-textLink-foreground);
    text-decoration: none;
}
.msg-assistant a:hover { text-decoration: underline; }
.block-link {
    color: var(--vscode-textLink-foreground);
    cursor: pointer;
    text-decoration: none;
    border-bottom: 1px dotted var(--vscode-textLink-foreground);
}
.block-link:hover { text-decoration: underline; }
.msg-error {
    align-self: center;
    background: var(--vscode-inputValidation-errorBackground, #5a1d1d);
    color: var(--vscode-inputValidation-errorForeground, #f88);
    border: 1px solid var(--vscode-inputValidation-errorBorder, #be1100);
    font-size: 0.9em;
}
.tool-msg {
    align-self: flex-start;
    font-size: 0.78em;
    font-family: var(--vscode-editor-font-family);
    color: var(--vscode-descriptionForeground);
    padding: 2px 12px;
    opacity: 0.8;
}
#input-status {
    padding: 4px 8px;
    font-size: 0.85em;
    color: var(--vscode-descriptionForeground);
    display: none;
    align-items: center;
    gap: 6px;
}
#input-status.busy { display: flex; }
.spinner {
    display: inline-block;
    width: 12px;
    height: 12px;
    border: 2px solid var(--vscode-descriptionForeground);
    border-top-color: transparent;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
#welcome {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 24px;
    text-align: center;
    color: var(--vscode-descriptionForeground);
}
#welcome.hidden { display: none; }
#welcome .welcome-icon { font-size: 36px; opacity: 0.4; }
#welcome h3 { color: var(--vscode-foreground); font-weight: 600; font-size: 1.05em; }
#welcome p { font-size: 0.88em; line-height: 1.5; max-width: 260px; }
#welcome .suggestions { display: flex; flex-direction: column; gap: 6px; margin-top: 4px; width: 100%; max-width: 260px; }
#welcome .suggestion {
    background: var(--vscode-editor-inactiveSelectionBackground, var(--vscode-editorWidget-background));
    border: 1px solid var(--vscode-panel-border, var(--vscode-editorGroup-border));
    border-radius: 6px; padding: 6px 10px; font-size: 0.85em;
    cursor: pointer; text-align: left; color: var(--vscode-foreground);
}
#welcome .suggestion:hover { background: var(--vscode-list-hoverBackground); }
#input-wrapper {
    border-top: 1px solid var(--vscode-panel-border, var(--vscode-editorGroup-border));
    background: var(--vscode-editor-background);
}
#input-area { display: flex; gap: 4px; padding: 8px; align-items: flex-end; }
#input-area textarea {
    flex: 1; resize: none;
    border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    padding: 6px 8px; border-radius: 4px;
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    max-height: 120px; min-height: 34px; line-height: 1.4;
}
#input-area textarea:focus { outline: 1px solid var(--vscode-focusBorder); }
#input-area button {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none; border-radius: 4px; padding: 6px 10px;
    cursor: pointer; font-size: 14px; height: 34px;
    display: flex; align-items: center;
}
#input-area button:hover { background: var(--vscode-button-hoverBackground); }
#btn-stop { background: var(--vscode-statusBarItem-errorBackground, #c72e2e); display: none; }
#btn-stop.visible { display: flex; }
#btn-send.hidden { display: none; }
#license-overlay {
    position: fixed; inset: 0;
    background: var(--vscode-sideBar-background, var(--vscode-editor-background));
    display: none; flex-direction: column; align-items: center; justify-content: center;
    text-align: center; padding: 24px; gap: 12px; z-index: 100;
}
#license-overlay.visible { display: flex; }
#license-overlay .icon { font-size: 32px; opacity: 0.5; }
#license-overlay p { color: var(--vscode-descriptionForeground); }
</style>
</head>
<body>
<div id="license-overlay">
    <div class="icon">&#128274;</div>
    <p><strong>AI Assistant not available</strong></p>
    <p>This feature requires an AI-enabled license.</p>
</div>
<div id="welcome">
    <div class="welcome-icon">&#129302;</div>
    <h3>T-IA Copilot</h3>
    <p>Ask questions about your TIA Portal project, generate blocks, or get help with PLC programming.</p>
    <div class="suggestions">
        <div class="suggestion" data-text="Summarize my project">&#128196; Summarize my project</div>
        <div class="suggestion" data-text="List all blocks and their status">&#128270; List all blocks and their status</div>
        <div class="suggestion" data-text="Create a motor start/stop FB in SCL">&#9881; Create a motor start/stop FB</div>
    </div>
</div>
<div id="messages" class="hidden"></div>
<div id="input-wrapper">
    <div id="input-status"><span class="spinner"></span><span>Thinking...</span></div>
    <div id="input-area">
        <textarea id="input" rows="1" placeholder="Ask anything about your TIA project..."></textarea>
        <button id="btn-send" title="Send">&#9654;</button>
        <button id="btn-stop" title="Stop">&#9632;</button>
    </div>
</div>
<script>
const vscode = acquireVsCodeApi();
const welcomeEl = document.getElementById('welcome');
const messagesEl = document.getElementById('messages');
const inputEl = document.getElementById('input');
const btnSend = document.getElementById('btn-send');
const btnStop = document.getElementById('btn-stop');
const inputStatus = document.getElementById('input-status');
const licenseOverlay = document.getElementById('license-overlay');
let busy = false;

function showMessages() {
    welcomeEl.className = 'hidden';
    messagesEl.className = '';
}

document.querySelectorAll('.suggestion').forEach(el => {
    el.addEventListener('click', () => {
        const text = el.getAttribute('data-text');
        if (text && !busy) { vscode.postMessage({ type: 'send', text }); }
    });
});

function escapeHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function renderMarkdown(text) {
    const lines = text.split('\\n');
    const blocks = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];

        // Code fence
        if (line.trimStart().startsWith('\x60\x60\x60')) {
            const codeLines = [];
            i++;
            while (i < lines.length && !lines[i].trimStart().startsWith('\x60\x60\x60')) {
                codeLines.push(lines[i]);
                i++;
            }
            i++; // skip closing fence
            blocks.push('<pre>' + escapeHtml(codeLines.join('\\n')) + '</pre>');
            continue;
        }

        // Table: line starts with | and next line is separator |---|
        if (line.trim().startsWith('|') && i + 1 < lines.length && /^\\|?[\\s-:|]+\\|/.test(lines[i + 1])) {
            const tableLines = [];
            while (i < lines.length && lines[i].trim().startsWith('|')) {
                tableLines.push(lines[i]);
                i++;
            }
            blocks.push(renderTable(tableLines));
            continue;
        }

        // Unordered list: collect consecutive lines starting with - or *
        if (/^\\s*[-*]\\s+/.test(line)) {
            const items = [];
            while (i < lines.length && /^\\s*[-*]\\s+/.test(lines[i])) {
                items.push('<li>' + renderInline(lines[i].replace(/^\\s*[-*]\\s+/, '')) + '</li>');
                i++;
            }
            blocks.push('<ul>' + items.join('') + '</ul>');
            continue;
        }

        // Ordered list: collect consecutive lines starting with digits.
        if (/^\\s*\\d+\\.\\s+/.test(line)) {
            const items = [];
            while (i < lines.length && /^\\s*\\d+\\.\\s+/.test(lines[i])) {
                items.push('<li>' + renderInline(lines[i].replace(/^\\s*\\d+\\.\\s+/, '')) + '</li>');
                i++;
            }
            blocks.push('<ol>' + items.join('') + '</ol>');
            continue;
        }

        // Empty line → paragraph break
        if (line.trim() === '') {
            blocks.push('');
            i++;
            continue;
        }

        // Regular line
        blocks.push(renderInline(line));
        i++;
    }

    return blocks.join('\\n');
}

function renderTable(lines) {
    if (lines.length < 2) return lines.map(escapeHtml).join('\\n');

    function parseCells(line) {
        return line.split('|').slice(1, -1).map(c => c.trim());
    }

    const headers = parseCells(lines[0]);
    // Skip separator line (line[1])
    const rows = lines.slice(2).map(parseCells);

    let html = '<table><thead><tr>';
    headers.forEach(h => { html += '<th>' + renderInline(h) + '</th>'; });
    html += '</tr></thead><tbody>';
    rows.forEach(row => {
        html += '<tr>';
        row.forEach(cell => { html += '<td>' + renderInline(cell) + '</td>'; });
        html += '</tr>';
    });
    html += '</tbody></table>';
    return html;
}

function renderInline(line) {
    let html = escapeHtml(line);

    // Headers
    html = html.replace(/^#{4}\\s+(.+)$/, '<h4>$1</h4>');
    html = html.replace(/^#{3}\\s+(.+)$/, '<h3>$1</h3>');
    html = html.replace(/^#{2}\\s+(.+)$/, '<h2>$1</h2>');
    html = html.replace(/^#{1}\\s+(.+)$/, '<h1>$1</h1>');

    // Inline code
    html = html.replace(/\x60([^\x60]+)\x60/g, '<code>$1</code>');

    // Bold + italic
    html = html.replace(/\\*\\*\\*(.+?)\\*\\*\\*/g, '<strong><em>$1</em></strong>');
    html = html.replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>');
    html = html.replace(/\\*(.+?)\\*/g, '<em>$1</em>');

    // Links [text](url)
    html = html.replace(/\\[([^\\]]+)\\]\\(([^)]+)\\)/g, '<a href="$2">$1</a>');

    // Block names: FB_xxx, FC_xxx, OB_xxx, DB_xxx, UDT_xxx (clickable links)
    // Skip if already inside a tag (code, a, etc.)
    html = html.replace(/(?:<[^>]+>)|\\b((?:FB|FC|OB|DB|UDT)_[A-Za-z0-9_]+)\\b/g, function(match, name) {
        if (!name) return match; // HTML tag — pass through
        return '<a class="block-link" href="#" data-block="' + name + '">' + name + '</a>';
    });

    // Horizontal rule
    html = html.replace(/^---+$/, '<hr>');

    return html;
}

function addMessage(role, content) {
    showMessages();
    const div = document.createElement('div');
    div.className = 'msg msg-' + role;
    if (role === 'assistant') {
        div.innerHTML = renderMarkdown(content);
    } else if (role === 'error') {
        div.textContent = content;
    } else {
        div.textContent = content;
    }
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
}

function addToolMsg(text) {
    showMessages();
    const div = document.createElement('div');
    div.className = 'tool-msg';
    div.textContent = text;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
}

function setBusy(isBusy) {
    busy = isBusy;
    inputStatus.className = isBusy ? 'busy' : '';
    btnStop.className = isBusy ? 'visible' : '';
    btnSend.className = isBusy ? 'hidden' : '';
    inputEl.disabled = isBusy;
    if (isBusy) { messagesEl.scrollTop = messagesEl.scrollHeight; }
}

function send() {
    const text = inputEl.value.trim();
    if (!text || busy) return;
    vscode.postMessage({ type: 'send', text });
    inputEl.value = '';
    inputEl.style.height = 'auto';
}

btnSend.addEventListener('click', send);
btnStop.addEventListener('click', () => vscode.postMessage({ type: 'stop' }));

inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
});

inputEl.addEventListener('input', () => {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
});

// Handle clicks on block links (event delegation)
document.addEventListener('click', (e) => {
    const target = e.target;
    if (target && target.classList && target.classList.contains('block-link')) {
        e.preventDefault();
        const blockName = target.getAttribute('data-block');
        if (blockName) {
            vscode.postMessage({ type: 'openBlock', blockName });
        }
    }
});

window.addEventListener('message', (e) => {
    const msg = e.data;
    switch (msg.type) {
        case 'addMessage':
            addMessage(msg.role, msg.content);
            break;
        case 'toolExecution':
            addToolMsg(msg.message);
            break;
        case 'updateStatus':
            setBusy(msg.status === 'busy');
            break;
        case 'history':
            messagesEl.innerHTML = '';
            if (msg.messages && msg.messages.length > 0) {
                showMessages();
                msg.messages.forEach(m => {
                    const role = (m.Role || '').toLowerCase();
                    if (role === 'user' || role === 'assistant') {
                        addMessage(role, m.Content);
                    }
                });
            }
            break;
        case 'clearAll':
            messagesEl.innerHTML = '';
            messagesEl.className = 'hidden';
            welcomeEl.className = '';
            setBusy(false);
            break;
        case 'error':
            addMessage('error', msg.message);
            break;
        case 'licenseBlocked':
            licenseOverlay.className = 'visible';
            break;
    }
});

vscode.postMessage({ type: 'ready' });
</script>
</body>
</html>`;
    }
}
