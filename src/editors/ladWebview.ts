import * as vscode from 'vscode';
import { getBlockDetails } from '../api/blocks';
import { renderBlockToHtml } from './ladRenderer';
import { log, logError } from '../views/outputChannel';

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
    let html: string;
    try {
        const details = await getBlockDetails(deviceName, blockName);
        if (!details) {
            html = errorHtml(blockName, 'No block details returned.');
        } else {
            html = renderBlockToHtml(details);
            log(`Opened ${blockName} as ${language} Webview`);
        }
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logError(`Failed to load ${blockName} for Webview`, err);
        html = errorHtml(blockName, msg);
    }

    const panel = vscode.window.createWebviewPanel(
        'tiaLadView',
        `${blockName} [${language}]`,
        vscode.ViewColumn.One,
        { enableScripts: false, retainContextWhenHidden: false },
    );

    openPanels.set(panelKey, panel);
    panel.onDidDispose(() => openPanels.delete(panelKey));
    panel.webview.html = html;
}

function loadingHtml(blockName: string): string {
    return `<!DOCTYPE html><html><head>
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
        <style>
        body { background: #1E1E1E; color: #C8C8C8; font-family: 'Segoe UI', sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; }
        .loader { text-align: center; }
        .spinner { border: 3px solid #3E3E42; border-top: 3px solid #569CD6; border-radius: 50%; width: 32px; height: 32px; animation: spin 1s linear infinite; margin: 0 auto 12px; }
        @keyframes spin { to { transform: rotate(360deg); } }
    </style></head><body><div class="loader"><div class="spinner"></div>Loading ${blockName}...</div></body></html>`;
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
