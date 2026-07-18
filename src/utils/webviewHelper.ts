import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { log } from '../views/outputChannel';

export function generateNonce(): string {
    return crypto.randomBytes(16).toString('hex');
}

export async function createWebviewWithHeartbeat(
    viewType: string,
    title: string,
    htmlBuilder: (nonce: string) => string,
    column: vscode.ViewColumn = vscode.ViewColumn.One,
): Promise<vscode.WebviewPanel | undefined> {
    for (let attempt = 1; attempt <= 2; attempt++) {
        const nonce = generateNonce();
        const panel = vscode.window.createWebviewPanel(
            viewType, title, column,
            { enableScripts: true, retainContextWhenHidden: false },
        );
        panel.webview.html = htmlBuilder(nonce);

        const ready = await waitForReady(panel, 3000);
        if (ready) {
            return panel;
        }

        log(`Webview '${title}' heartbeat timeout (attempt ${attempt}/2)`);
        panel.dispose();

        if (attempt === 1) {
            log('Retrying webview creation...');
        }
    }

    const reloadWindow = vscode.l10n.t('Reload Window');
    const action = await vscode.window.showErrorMessage(
        vscode.l10n.t('Webview failed to load. This is a known VS Code issue.'),
        reloadWindow,
    );
    if (action === reloadWindow) {
        vscode.commands.executeCommand('workbench.action.reloadWindow');
    }
    return undefined;
}

function waitForReady(panel: vscode.WebviewPanel, timeoutMs: number): Promise<boolean> {
    return new Promise(resolve => {
        const timer = setTimeout(() => {
            listener.dispose();
            resolve(false);
        }, timeoutMs);

        const listener = panel.webview.onDidReceiveMessage(msg => {
            if (msg.type === 'webview-ready') {
                clearTimeout(timer);
                listener.dispose();
                resolve(true);
            }
        });

        panel.onDidDispose(() => {
            clearTimeout(timer);
            listener.dispose();
            resolve(false);
        });
    });
}
