import * as vscode from 'vscode';
import { client } from '../api/client';
import { getProjectOverview } from '../api/project';
import { ProjectTreeProvider } from '../providers/projectTreeProvider';
import { TiaSourceControl } from '../providers/scmProvider';
import { TestTreeProvider } from '../providers/testTreeProvider';
import { setConnected, setDisconnected, setError } from '../views/statusBar';
import { log, logError } from '../views/outputChannel';
import { CONTEXT_KEYS } from '../utils/constants';
import { getApiKey, setApiKey } from '../utils/config';

export function registerProjectCommands(
    context: vscode.ExtensionContext,
    treeProvider: ProjectTreeProvider,
    scmProvider: TiaSourceControl,
    testProvider: TestTreeProvider,
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('tiaConnect.connect', () => connect(treeProvider, scmProvider, testProvider)),
        vscode.commands.registerCommand('tiaConnect.disconnect', () => disconnect(treeProvider, scmProvider)),
        vscode.commands.registerCommand('tiaConnect.refreshProject', () => treeProvider.refresh()),
        vscode.commands.registerCommand('tiaConnect.openSettings', () =>
            vscode.commands.executeCommand('workbench.action.openSettings', 'tiaConnect')
        ),
    );
}

async function promptApiKey(): Promise<string | undefined> {
    return vscode.window.showInputBox({
        prompt: 'Enter your T-IA Connect API Key',
        placeHolder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
        password: true,
        ignoreFocusOut: true,
    });
}

async function validateApiKey(): Promise<{ valid: boolean; projectName?: string; error?: string }> {
    try {
        const overview = await getProjectOverview();
        return { valid: true, projectName: overview.Name };
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('401') || msg.includes('API Key') || msg.includes('Unauthorized') || msg.includes('authentication')) {
            return { valid: false, error: 'invalid_key' };
        }
        // Other errors (no project open, etc.) — the key is still valid
        return { valid: true };
    }
}

async function ensureApiKey(): Promise<boolean> {
    // Check if key already configured
    let key = getApiKey();

    if (!key) {
        const input = await promptApiKey();
        if (!input) {
            return false; // User cancelled
        }
        await setApiKey(input);
        key = input;
    }

    // Validate the key by calling an authenticated endpoint
    const result = await validateApiKey();

    if (result.valid) {
        return true;
    }

    // Key is invalid — ask again
    const retry = await vscode.window.showWarningMessage(
        'The API key is invalid or rejected by the server. Enter a new key?',
        'Enter New Key',
        'Cancel',
    );

    if (retry !== 'Enter New Key') {
        return false;
    }

    const newKey = await promptApiKey();
    if (!newKey) {
        return false;
    }
    await setApiKey(newKey);

    // Validate again
    const result2 = await validateApiKey();
    if (!result2.valid) {
        vscode.window.showErrorMessage('API key still invalid. Check your key in T-IA Connect settings.');
        return false;
    }

    return true;
}

async function connect(
    treeProvider: ProjectTreeProvider,
    scmProvider: TiaSourceControl,
    testProvider: TestTreeProvider,
): Promise<void> {
    try {
        log('Connecting to T-IA Connect server...');

        // Step 1: Check server is reachable (health endpoint, no auth needed)
        const reachable = await client.ping();
        if (!reachable) {
            setError('Server unreachable');
            vscode.window.showErrorMessage(
                'Cannot reach T-IA Connect server. Check the URL and ensure the server is running.'
            );
            return;
        }

        log('Server reachable. Checking API key...');

        // Step 2: Ensure API key is present and valid
        const keyOk = await ensureApiKey();
        if (!keyOk) {
            setError('Not authenticated');
            log('Connection cancelled: no valid API key.');
            return;
        }

        // Step 3: Connected — activate everything
        vscode.commands.executeCommand('setContext', CONTEXT_KEYS.connected, true);

        // Get project name for status bar
        try {
            const overview = await getProjectOverview();
            setConnected(overview.Name);
            log(`Connected. Project: ${overview.Name}`);
        } catch {
            setConnected();
            log('Connected (no project open).');
        }

        // Refresh all providers
        treeProvider.refresh();
        scmProvider.refresh();
        scmProvider.startAutoRefresh();
        testProvider.discoverTests();
    } catch (err) {
        logError('Connection failed', err);
        setError('Connection failed');
        vscode.window.showErrorMessage(`Connection failed: ${err instanceof Error ? err.message : err}`);
    }
}

function disconnect(treeProvider: ProjectTreeProvider, scmProvider: TiaSourceControl): void {
    client.cancelAll();
    vscode.commands.executeCommand('setContext', CONTEXT_KEYS.connected, false);
    setDisconnected();
    scmProvider.stopAutoRefresh();
    treeProvider.refresh();
    log('Disconnected.');
}
