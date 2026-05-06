import * as vscode from 'vscode';
import { sendCopilotMessage, getCopilotHistory, clearCopilotHistory, stopCopilot } from '../api/copilot';
import { getLicenseFeatures } from '../api/project';
import { log } from '../views/outputChannel';

export class CopilotViewProvider implements vscode.WebviewViewProvider {

    public static readonly viewType = 'tiaCopilotChat';
    private view?: vscode.WebviewView;
    private pollingTimer?: ReturnType<typeof setInterval>;
    private lastKnownCount = 0;
    private stableCount = 0;
    private gotAssistantReply = false;
    private pollAttempts = 0;
    private projectPath?: string;
    private static readonly MAX_POLL_ATTEMPTS = 120;        // 120 * 1.5s = 3 min max
    private static readonly STABLE_AFTER_REPLY = 4;         // 6s stable after assistant replied → done
    private static readonly STABLE_WAITING_REPLY = 40;      // 60s max waiting for first assistant reply

    constructor(private readonly extensionUri: vscode.Uri) {}

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
        // Check license
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

        // Load history
        await this.loadHistory();
    }

    private async loadHistory(): Promise<void> {
        try {
            const history = await getCopilotHistory(this.projectPath);
            this.postMessage({ type: 'history', messages: history });
        } catch {
            // No history or API unavailable
        }
    }

    private async onSend(text: string): Promise<void> {
        if (!text?.trim()) { return; }

        this.postMessage({ type: 'addMessage', role: 'user', content: text });

        try {
            // Snapshot the current history count before sending
            // Try with projectKey first, fallback to unfiltered
            let history = await getCopilotHistory(this.projectPath);
            log(`[Copilot] History with projectKey: ${history.length} messages (key=${this.projectPath})`);
            if (history.length === 0) {
                // Maybe projectKey doesn't match — try unfiltered
                const unfiltered = await getCopilotHistory();
                log(`[Copilot] History unfiltered: ${unfiltered.length} messages`);
                if (unfiltered.length > 0) {
                    log(`[Copilot] projectKey mismatch — switching to unfiltered polling`);
                    this.projectPath = undefined;
                    history = unfiltered;
                }
            }
            this.lastKnownCount = history.length;

            await sendCopilotMessage(text);
            log(`[Copilot] Message sent, starting poll (baseline=${this.lastKnownCount})`);
            this.startPolling();
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : String(err);
            this.postMessage({ type: 'error', message });
        }
    }

    private async onStop(): Promise<void> {
        this.stopPolling();
        try {
            await stopCopilot();
        } catch {
            // Ignore
        }
        this.postMessage({ type: 'updateStatus', status: 'idle' });
    }

    private async onClear(): Promise<void> {
        this.stopPolling();
        try {
            await clearCopilotHistory(this.projectPath);
        } catch {
            // Ignore
        }
        this.postMessage({ type: 'clearAll' });
    }

    private startPolling(): void {
        this.stopPolling();
        this.pollAttempts = 0;
        this.stableCount = 0;
        this.gotAssistantReply = false;
        this.postMessage({ type: 'updateStatus', status: 'busy' });

        this.pollingTimer = setInterval(async () => {
            this.pollAttempts++;

            if (this.pollAttempts > CopilotViewProvider.MAX_POLL_ATTEMPTS) {
                this.stopPolling();
                this.postMessage({ type: 'error', message: 'Response timeout (3 min). The assistant may still be processing.' });
                this.postMessage({ type: 'updateStatus', status: 'idle' });
                return;
            }

            try {
                const history = await getCopilotHistory(this.projectPath);
                const currentCount = history.length;

                if (this.pollAttempts <= 3 || currentCount !== this.lastKnownCount) {
                    log(`[Copilot poll #${this.pollAttempts}] count=${currentCount} baseline=${this.lastKnownCount} stable=${this.stableCount} hasReply=${this.gotAssistantReply}`);
                }

                // Stream new messages as they appear
                if (currentCount > this.lastKnownCount) {
                    for (let i = this.lastKnownCount; i < currentCount; i++) {
                        const msg = history[i];
                        const role = (msg.Role || '').toLowerCase();
                        log(`[Copilot] New msg[${i}]: role=${role} content=${(msg.Content || '').substring(0, 80)}...`);
                        // Skip the user echo (we already showed it locally)
                        if (role === 'user' && i === this.lastKnownCount) { continue; }
                        if (role === 'assistant') {
                            this.gotAssistantReply = true;
                        }
                        if (role === 'user' || role === 'assistant') {
                            this.postMessage({ type: 'addMessage', role, content: msg.Content });
                        }
                    }
                    this.lastKnownCount = currentCount;
                    this.stableCount = 0; // Reset — still receiving messages
                } else {
                    this.stableCount++;
                }

                // Use different thresholds depending on whether we got an assistant reply
                const threshold = this.gotAssistantReply
                    ? CopilotViewProvider.STABLE_AFTER_REPLY    // 6s after last assistant message
                    : CopilotViewProvider.STABLE_WAITING_REPLY;  // 60s waiting for first reply

                if (this.stableCount >= threshold) {
                    log(`[Copilot] Stable for ${this.stableCount} polls (hasReply=${this.gotAssistantReply}) — done.`);
                    this.stopPolling();
                    if (!this.gotAssistantReply) {
                        this.postMessage({ type: 'error', message: 'No response received from assistant. Check the T-IA Connect app for errors.' });
                    }
                    this.postMessage({ type: 'updateStatus', status: 'idle' });
                }
            } catch (err: unknown) {
                // Network error during polling — don't stop, just log
                log(`[Copilot poll error] ${err instanceof Error ? err.message : String(err)}`);
            }
        }, 1500);
    }

    private stopPolling(): void {
        if (this.pollingTimer) {
            clearInterval(this.pollingTimer);
            this.pollingTimer = undefined;
        }
    }

    private postMessage(msg: Record<string, unknown>): void {
        this.view?.webview.postMessage(msg);
    }

    dispose(): void {
        this.stopPolling();
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
    padding: 8px 12px;
    border-radius: 8px;
    max-width: 90%;
    word-wrap: break-word;
    line-height: 1.45;
    white-space: pre-wrap;
}
.msg-user {
    align-self: flex-end;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
}
.msg-assistant {
    align-self: flex-start;
    background: var(--vscode-editor-inactiveSelectionBackground, var(--vscode-editorWidget-background));
}
.msg-assistant code {
    background: var(--vscode-textCodeBlock-background);
    padding: 1px 4px;
    border-radius: 3px;
    font-family: var(--vscode-editor-font-family);
    font-size: 0.92em;
}
.msg-assistant pre {
    background: var(--vscode-textCodeBlock-background);
    padding: 8px;
    border-radius: 4px;
    overflow-x: auto;
    margin: 6px 0;
    font-family: var(--vscode-editor-font-family);
    font-size: 0.92em;
}
.msg-error {
    align-self: center;
    background: var(--vscode-inputValidation-errorBackground, #5a1d1d);
    color: var(--vscode-inputValidation-errorForeground, #f88);
    border: 1px solid var(--vscode-inputValidation-errorBorder, #be1100);
    font-size: 0.9em;
}
#status-bar {
    padding: 4px 8px;
    font-size: 0.85em;
    color: var(--vscode-descriptionForeground);
    display: none;
    align-items: center;
    gap: 6px;
    border-top: 1px solid var(--vscode-panel-border, var(--vscode-editorGroup-border));
}
#status-bar.busy { display: flex; }
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
#welcome .welcome-icon {
    font-size: 36px;
    opacity: 0.4;
}
#welcome h3 {
    color: var(--vscode-foreground);
    font-weight: 600;
    font-size: 1.05em;
}
#welcome p {
    font-size: 0.88em;
    line-height: 1.5;
    max-width: 260px;
}
#welcome .suggestions {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 4px;
    width: 100%;
    max-width: 260px;
}
#welcome .suggestion {
    background: var(--vscode-editor-inactiveSelectionBackground, var(--vscode-editorWidget-background));
    border: 1px solid var(--vscode-panel-border, var(--vscode-editorGroup-border));
    border-radius: 6px;
    padding: 6px 10px;
    font-size: 0.85em;
    cursor: pointer;
    text-align: left;
    color: var(--vscode-foreground);
}
#welcome .suggestion:hover {
    background: var(--vscode-list-hoverBackground);
}
#input-area {
    display: flex;
    gap: 4px;
    padding: 8px;
    border-top: 1px solid var(--vscode-panel-border, var(--vscode-editorGroup-border));
    background: var(--vscode-editor-background);
    align-items: flex-end;
}
#input-area textarea {
    flex: 1;
    resize: none;
    border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    padding: 6px 8px;
    border-radius: 4px;
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    max-height: 120px;
    min-height: 34px;
    line-height: 1.4;
}
#input-area textarea:focus { outline: 1px solid var(--vscode-focusBorder); }
#input-area button {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    border: none;
    border-radius: 4px;
    padding: 6px 10px;
    cursor: pointer;
    font-size: 14px;
    height: 34px;
    display: flex;
    align-items: center;
}
#input-area button:hover { background: var(--vscode-button-hoverBackground); }
#btn-stop {
    background: var(--vscode-statusBarItem-errorBackground, #c72e2e);
    display: none;
}
#btn-stop.visible { display: flex; }
#btn-send.hidden { display: none; }
#license-overlay {
    position: fixed;
    inset: 0;
    background: var(--vscode-sideBar-background, var(--vscode-editor-background));
    display: none;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 24px;
    gap: 12px;
    z-index: 100;
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
<div id="status-bar"><span class="spinner"></span><span id="status-text">Thinking...</span></div>
<div id="input-area">
    <textarea id="input" rows="1" placeholder="Ask anything about your TIA project..."></textarea>
    <button id="btn-send" title="Send">&#9654;</button>
    <button id="btn-stop" title="Stop">&#9632;</button>
</div>
<script>
const vscode = acquireVsCodeApi();
const welcomeEl = document.getElementById('welcome');
const messagesEl = document.getElementById('messages');
const inputEl = document.getElementById('input');
const btnSend = document.getElementById('btn-send');
const btnStop = document.getElementById('btn-stop');
const statusBar = document.getElementById('status-bar');
const statusText = document.getElementById('status-text');
const licenseOverlay = document.getElementById('license-overlay');
let busy = false;

function showMessages() {
    welcomeEl.className = 'hidden';
    messagesEl.className = '';
}

// Suggestion buttons
document.querySelectorAll('.suggestion').forEach(el => {
    el.addEventListener('click', () => {
        const text = el.getAttribute('data-text');
        if (text && !busy) {
            vscode.postMessage({ type: 'send', text });
        }
    });
});

function escapeHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function renderMarkdown(text) {
    let html = escapeHtml(text);
    // Code blocks (triple backtick)
    html = html.replace(/\`\`\`([\\s\\S]*?)\`\`\`/g, (_, code) => '<pre>' + code.trim() + '</pre>');
    // Inline code
    html = html.replace(/\`([^\`]+)\`/g, '<code>$1</code>');
    // Bold
    html = html.replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>');
    // Lists
    html = html.replace(/^- (.+)$/gm, '&#8226; $1');
    html = html.replace(/^\\d+\\. (.+)$/gm, (m, item) => '&#8226; ' + item);
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

function setBusy(isBusy) {
    busy = isBusy;
    statusBar.className = isBusy ? 'busy' : '';
    btnStop.className = isBusy ? 'visible' : '';
    btnSend.className = isBusy ? 'hidden' : '';
    inputEl.disabled = isBusy;
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
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        send();
    }
});

inputEl.addEventListener('input', () => {
    inputEl.style.height = 'auto';
    inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
});

window.addEventListener('message', (e) => {
    const msg = e.data;
    switch (msg.type) {
        case 'addMessage':
            addMessage(msg.role, msg.content);
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
