import * as vscode from 'vscode';
import { getBlockDetails } from '../api/blocks';
import { renderBlockToHtml } from './ladRenderer';
import { log, logError } from '../views/outputChannel';
import { createWebviewWithHeartbeat } from '../utils/webviewHelper';

const openPanels = new Map<string, vscode.WebviewPanel>();

/**
 * Open a LAD/FBD/GRAPH block in a Webview panel with SVG rendering.
 */
export async function openLadWebview(
    deviceName: string,
    blockName: string,
    language: string,
): Promise<void> {
    const panelKey = `${deviceName}:${blockName}`;

    // Reuse existing panel if open
    const existing = openPanels.get(panelKey);
    if (existing) {
        existing.reveal(vscode.ViewColumn.One);
        return;
    }

    // Load data BEFORE creating the panel to avoid service worker issues
    let contentHtml: string;
    try {
        const details = await getBlockDetails(deviceName, blockName);
        if (!details) {
            contentHtml = errorHtml(blockName, 'No block details returned.');
        } else {
            contentHtml = renderBlockToHtml(details);
            log(`Opened ${blockName} as ${language} Webview`);
        }
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logError(`Failed to load ${blockName} for Webview`, err);
        contentHtml = errorHtml(blockName, msg);
    }

    const panel = await createWebviewWithHeartbeat(
        'tiaLadView',
        `${blockName} [${language}]`,
        (nonce) => injectHeartbeat(contentHtml, nonce),
        vscode.ViewColumn.One,
    );
    if (!panel) { return; }

    openPanels.set(panelKey, panel);
    panel.onDidDispose(() => openPanels.delete(panelKey));
}

function injectHeartbeat(html: string, nonce: string): string {
    // Update CSP to allow our nonce script
    html = html.replace(
        /content="default-src 'none'; style-src 'unsafe-inline'(?:; img-src data:)?;?"/,
        `content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; script-src 'nonce-${nonce}';"`,
    );
    // Inject heartbeat script before </body>
    const heartbeat = `<script nonce="${nonce}">const vscode=acquireVsCodeApi();vscode.postMessage({type:'webview-ready'});</script>`;
    return html.replace('</body>', `${heartbeat}</body>`);
}

function errorHtml(blockName: string, message: string): string {
    return `<!DOCTYPE html><html><head>
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
        <style>
        body { background: #1E1E1E; color: #C8C8C8; font-family: 'Segoe UI', sans-serif; padding: 24px; }
        .error { color: #EF4444; margin-top: 8px; }
    </style></head><body>
        <h2>Failed to load ${blockName}</h2>
        <p class="error">${message}</p>
    </body></html>`;
}
