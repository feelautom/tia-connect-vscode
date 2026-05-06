import * as vscode from 'vscode';
import { getWatchTableDetails } from '../api/tags';
import { WatchTableDetail } from '../api/types';
import { log, logError } from '../views/outputChannel';
import { createWebviewWithHeartbeat } from '../utils/webviewHelper';

const openPanels = new Map<string, vscode.WebviewPanel>();

export async function openWatchTableWebview(
    deviceName: string,
    tableName: string,
): Promise<void> {
    const panelKey = `watch:${deviceName}:${tableName}`;

    const existing = openPanels.get(panelKey);
    if (existing) {
        existing.reveal(vscode.ViewColumn.One);
        return;
    }

    let contentHtml: string;
    try {
        const detail = await getWatchTableDetails(deviceName, tableName);
        contentHtml = renderWatchTableHtml(deviceName, detail);
        log(`Opened watch table '${tableName}' (${detail.Entries?.length ?? 0} entries)`);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logError(`Failed to load watch table '${tableName}'`, err);
        contentHtml = errorHtml(tableName, msg);
    }

    const panel = await createWebviewWithHeartbeat(
        'tiaWatchTable',
        `Watch: ${tableName}`,
        (nonce) => injectHeartbeat(contentHtml, nonce),
        vscode.ViewColumn.One,
    );
    if (!panel) { return; }

    openPanels.set(panelKey, panel);
    panel.onDidDispose(() => openPanels.delete(panelKey));
}

function renderWatchTableHtml(deviceName: string, detail: WatchTableDetail): string {
    const entries = detail.Entries || [];

    if (entries.length === 0) {
        return `<!DOCTYPE html><html><head>${styles()}</head><body>
            <div class="header">
                <h1>${esc(detail.Name)}</h1>
                <span class="badge device">${esc(deviceName)}</span>
                <span class="badge empty">No entries</span>
            </div>
            <p class="muted">This watch table has no entries.</p>
        </body></html>`;
    }

    let rowsHtml = '';
    for (const e of entries) {
        rowsHtml += `
            <tr>
                <td class="col-name">${esc(e.Name)}</td>
                <td class="col-addr"><code>${esc(e.Address || '-')}</code></td>
                <td class="col-format">${esc(e.DisplayFormat || '')}</td>
                <td class="col-trigger">${esc(e.MonitorTrigger || '')}</td>
            </tr>`;
    }

    return `<!DOCTYPE html><html><head>${styles()}</head><body>
        <div class="header">
            <h1>${esc(detail.Name)}</h1>
            <span class="badge device">${esc(deviceName)}</span>
            <span class="badge count">${entries.length} entr${entries.length > 1 ? 'ies' : 'y'}</span>
            ${detail.IsConsistent === false ? '<span class="badge inconsistent">Inconsistent</span>' : ''}
        </div>
        <table>
            <thead>
                <tr>
                    <th>Name</th>
                    <th>Address</th>
                    <th>Display Format</th>
                    <th>Monitor Trigger</th>
                </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
        </table>
    </body></html>`;
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
        .badge.inconsistent { background: #5F1E1E; color: #F48771; }
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
        .col-format { color: var(--vscode-descriptionForeground, #808080); }
        .col-trigger { color: var(--vscode-descriptionForeground, #808080); }
    </style>`;
}

function errorHtml(tableName: string, message: string): string {
    return `<!DOCTYPE html><html><head>
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
        <style>
        body { background: #1E1E1E; color: #C8C8C8; font-family: 'Segoe UI', sans-serif; padding: 24px; }
        .error { color: #EF4444; margin-top: 8px; }
    </style></head><body>
        <h2>Failed to load watch table ${esc(tableName)}</h2>
        <p class="error">${esc(message)}</p>
    </body></html>`;
}

function injectHeartbeat(html: string, nonce: string): string {
    html = html.replace(
        /content="default-src 'none'; style-src 'unsafe-inline';?"/,
        `content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';"`,
    );
    const heartbeat = `<script nonce="${nonce}">const vscode=acquireVsCodeApi();vscode.postMessage({type:'webview-ready'});</script>`;
    return html.replace('</body>', `${heartbeat}</body>`);
}

function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
