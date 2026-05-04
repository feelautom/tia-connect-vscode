import * as vscode from 'vscode';
import { client } from '../api/client';
import { getProjectOverview } from '../api/project';
import { ProjectTreeProvider } from '../providers/projectTreeProvider';
import { setConnected, setDisconnected, setError } from '../views/statusBar';
import { log, logError } from '../views/outputChannel';
import { CONTEXT_KEYS } from '../utils/constants';

export function registerProjectCommands(
    context: vscode.ExtensionContext,
    treeProvider: ProjectTreeProvider,
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('tiaConnect.connect', () => connect(treeProvider)),
        vscode.commands.registerCommand('tiaConnect.disconnect', () => disconnect(treeProvider)),
        vscode.commands.registerCommand('tiaConnect.refreshProject', () => treeProvider.refresh()),
    );
}

async function connect(treeProvider: ProjectTreeProvider): Promise<void> {
    try {
        log('Connecting to T-IA Connect server...');
        const reachable = await client.ping();

        if (!reachable) {
            setError('Server unreachable');
            vscode.window.showErrorMessage(
                'Cannot reach T-IA Connect server. Check the URL and ensure the server is running.'
            );
            return;
        }

        vscode.commands.executeCommand('setContext', CONTEXT_KEYS.connected, true);

        // Try to get project name for status bar
        try {
            const overview = await getProjectOverview();
            setConnected(overview.Name);
            log(`Connected. Project: ${overview.Name}`);
        } catch {
            setConnected();
            log('Connected (no project open).');
        }

        treeProvider.refresh();
    } catch (err) {
        logError('Connection failed', err);
        setError('Connection failed');
        vscode.window.showErrorMessage(`Connection failed: ${err instanceof Error ? err.message : err}`);
    }
}

function disconnect(treeProvider: ProjectTreeProvider): void {
    client.cancelAll();
    vscode.commands.executeCommand('setContext', CONTEXT_KEYS.connected, false);
    setDisconnected();
    treeProvider.refresh();
    log('Disconnected.');
}
