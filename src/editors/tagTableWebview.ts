import * as vscode from 'vscode';
import { getTagsInTable } from '../api/tags';
import { TagInfo } from '../api/types';
import { log, logError } from '../views/outputChannel';
import { createWebviewWithHeartbeat } from '../utils/webviewHelper';

const openPanels = new Map<string, vscode.WebviewPanel>();

export async function openTagTableWebview(
    deviceName: string,
    tableName: string,
): Promise<void> {
    const panelKey = `tags:${deviceName}:${tableName}`;

    const existing = openPanels.get(panelKey);
    if (existing) {
        existing.reveal(vscode.ViewColumn.One);
        return;
    }

    // Load data BEFORE creating the panel to avoid service worker issues
    let contentHtml: string;
    try {
        const tags = await getTagsInTable(deviceName, tableName);
        contentHtml = renderTagTableHtml(deviceName, tableName, tags);
        log(`Opened tag table '${tableName}' (${tags.length} tags)`);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logError(`Failed to load tags from '${tableName}'`, err);
        contentHtml = errorHtml(tableName, msg);
    }

    const panel = await createWebviewWithHeartbeat(
        'tiaTagTable',
        `Tags: ${tableName}`,
        (nonce) => injectHeartbeat(contentHtml, nonce),
        vscode.ViewColumn.One,
    );
    if (!panel) { return; }

    openPanels.set(panelKey, panel);
    panel.onDidDispose(() => openPanels.delete(panelKey));
}

function renderTagTableHtml(deviceName: string, tableName: string, tags: TagInfo[]): string {
    if (!tags || tags.length === 0) {
        return `<!DOCTYPE html><html><head>${styles()}</head><body>
            <div class="header">
                <h1>${esc(tableName)}</h1>
                <span class="badge device">${esc(deviceName)}</span>
                <span class="badge empty">No tags</span>
            </div>
            <p class="muted">This tag table is empty.</p>
        </body></html>`;
    }

    let rowsHtml = '';
    for (const tag of tags) {
        const typeClass = getTypeClass(tag.DataType);
        rowsHtml += `
            <tr>
                <td class="col-name">${esc(tag.Name)}</td>
                <td class="col-type"><span class="type-chip ${typeClass}">${esc(tag.DataType)}</span></td>
                <td class="col-addr"><code>${esc(tag.LogicalAddress || '-')}</code></td>
                <td class="col-comment">${esc(tag.Comment || '')}</td>
            </tr>`;
    }

    return `<!DOCTYPE html><html><head>${styles()}</head><body>
        <div class="header">
            <h1>${esc(tableName)}</h1>
            <span class="badge device">${esc(deviceName)}</span>
            <span class="badge count">${tags.length} tag${tags.length > 1 ? 's' : ''}</span>
        </div>
        <table>
            <thead>
                <tr>
                    <th>Name</th>
                    <th>Data Type</th>
                    <th>Address</th>
                    <th>Comment</th>
                </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
        </table>
    </body></html>`;
}

function getTypeClass(dataType: string): string {
    if (!dataType) { return ''; }
    const dt = dataType.toUpperCase();
    if (dt === 'BOOL') { return 'type-bool'; }
    if (dt === 'INT' || dt === 'DINT' || dt === 'SINT' || dt === 'UINT' || dt === 'UDINT' || dt === 'USINT' || dt === 'LINT' || dt === 'ULINT') { return 'type-int'; }
    if (dt === 'REAL' || dt === 'LREAL') { return 'type-real'; }
    if (dt === 'WORD' || dt === 'DWORD' || dt === 'BYTE' || dt === 'LWORD') { return 'type-word'; }
    if (dt === 'STRING' || dt === 'WSTRING') { return 'type-string'; }
    if (dt === 'TIME' || dt === 'LTIME' || dt === 'DATE' || dt === 'TOD' || dt === 'DT' || dt === 'DTL') { return 'type-time'; }
    return 'type-other';
}

function styles(): string {
    return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            background: var(--vscode-editor-background, #1E1E1E);
            color: var(--vscode-editor-foreground, #C8C8C8);
            font-family: var(--vscode-font-family, 'Segoe UI', -apple-system, sans-serif);
            font-size: 13px; padding: 16px; line-height: 1.5;
        }
        .header {
            display: flex; align-items: center; gap: 10px;
            margin-bottom: 16px; padding-bottom: 12px;
            border-bottom: 1px solid var(--vscode-panel-border, #3E3E42);
        }
        h1 { font-size: 16px; font-weight: 600; color: var(--vscode-foreground, #E0E0E0); }
        .badge {
            padding: 2px 8px; border-radius: 10px; font-size: 11px;
        }
        .badge.device { background: #1E3A5F; color: #569CD6; }
        .badge.count { background: #264F78; color: #9CDCFE; }
        .badge.empty { background: #3E3E42; color: #808080; }
        .muted { color: #808080; font-style: italic; padding: 20px 0; }

        table {
            width: 100%; border-collapse: collapse;
            background: var(--vscode-editor-background, #252526);
            border: 1px solid var(--vscode-panel-border, #3E3E42);
            border-radius: 6px; overflow: hidden;
        }
        thead {
            background: var(--vscode-editorGroupHeader-tabsBackground, #2D2D30);
        }
        th {
            text-align: left; padding: 10px 14px;
            font-weight: 600; font-size: 11px;
            text-transform: uppercase; letter-spacing: 0.5px;
            color: var(--vscode-descriptionForeground, #808080);
            border-bottom: 1px solid var(--vscode-panel-border, #3E3E42);
        }
        td {
            padding: 8px 14px;
            border-bottom: 1px solid var(--vscode-panel-border, #2A2A2E);
        }
        tr:last-child td { border-bottom: none; }
        tr:hover td {
            background: var(--vscode-list-hoverBackground, #2A2D2E);
        }

        .col-name { font-weight: 500; color: var(--vscode-foreground, #DCDCAA); }
        .col-addr code {
            font-family: var(--vscode-editor-font-family, 'Consolas', monospace);
            font-size: 12px; color: #CE9178;
        }
        .col-comment { color: var(--vscode-descriptionForeground, #6A9955); font-style: italic; }

        .type-chip {
            display: inline-block;
            padding: 1px 8px; border-radius: 3px;
            font-family: var(--vscode-editor-font-family, 'Consolas', monospace);
            font-size: 11px; font-weight: 500;
        }
        .type-bool { background: #1A3A1A; color: #4EC9B0; }
        .type-int { background: #1E3A5F; color: #569CD6; }
        .type-real { background: #3B2F1F; color: #CE9178; }
        .type-word { background: #2B2040; color: #B48EAD; }
        .type-string { background: #2F3B1F; color: #D7BA7D; }
        .type-time { background: #1F2F3B; color: #9CDCFE; }
        .type-other { background: #2D2D30; color: #C8C8C8; }
    </style>`;
}

function loadingHtml(tableName: string): string {
    return `<!DOCTYPE html><html><head>
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
        <style>
        body { background: #1E1E1E; color: #C8C8C8; font-family: 'Segoe UI', sans-serif;
               display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
        .spinner { border: 3px solid #3E3E42; border-top: 3px solid #569CD6; border-radius: 50%;
                   width: 32px; height: 32px; animation: spin 1s linear infinite; margin: 0 auto 12px; }
        @keyframes spin { to { transform: rotate(360deg); } }
    </style></head><body><div style="text-align:center"><div class="spinner"></div>Loading tags from ${esc(tableName)}...</div></body></html>`;
}

function errorHtml(tableName: string, message: string): string {
    return `<!DOCTYPE html><html><head>
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
        <style>
        body { background: #1E1E1E; color: #C8C8C8; font-family: 'Segoe UI', sans-serif; padding: 24px; }
        .error { color: #EF4444; margin-top: 8px; }
    </style></head><body>
        <h2>Failed to load tags from ${esc(tableName)}</h2>
        <p class="error">${esc(message)}</p>
    </body></html>`;
}

function injectHeartbeat(html: string, nonce: string): string {
    // Update CSP to allow our nonce script
    html = html.replace(
        /content="default-src 'none'; style-src 'unsafe-inline';?"/,
        `content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';"`,
    );
    // Inject heartbeat script before </body>
    const heartbeat = `<script nonce="${nonce}">const vscode=acquireVsCodeApi();vscode.postMessage({type:'webview-ready'});</script>`;
    return html.replace('</body>', `${heartbeat}</body>`);
}

function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
