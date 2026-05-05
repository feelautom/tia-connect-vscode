import * as vscode from 'vscode';
import { client } from '../api/client';
import { getProjectOverview, listProjectFiles, getProjectHistory, openProject, closeProject } from '../api/project';
import { pollJob } from '../api/jobs';
import { ProjectTreeProvider } from '../providers/projectTreeProvider';
import { TiaSourceControl } from '../providers/scmProvider';
import { TestTreeProvider } from '../providers/testTreeProvider';
import { setConnected, setDisconnected, setError } from '../views/statusBar';
import { log, logError, showOutput } from '../views/outputChannel';
import { CONTEXT_KEYS } from '../utils/constants';
import { getApiKey, setApiKey } from '../utils/config';
import { getSignalRClient } from '../api/signalr';

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
        vscode.commands.registerCommand('tiaConnect.switchProject', () => switchProject(treeProvider)),
        vscode.commands.registerCommand('tiaConnect.openSettings', () =>
            vscode.commands.executeCommand('workbench.action.openSettings', 'tiaConnect')
        ),
        vscode.commands.registerCommand('tiaConnect.launchHeadless', () => launchAndConnect(true, treeProvider, scmProvider, testProvider)),
        vscode.commands.registerCommand('tiaConnect.launchGui', () => launchAndConnect(false, treeProvider, scmProvider, testProvider)),
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
            setError('Server not running');
            vscode.commands.executeCommand('setContext', CONTEXT_KEYS.serverNotRunning, true);
            log('Server unreachable. Launch options shown in sidebar.');
            return;
        }
        vscode.commands.executeCommand('setContext', CONTEXT_KEYS.serverNotRunning, false);

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

async function switchProject(treeProvider: ProjectTreeProvider): Promise<void> {
    try {
        // Fetch available projects and history in parallel
        const [files, history] = await Promise.all([
            listProjectFiles().catch(() => []),
            getProjectHistory().catch(() => []),
        ]);

        if (files.length === 0 && history.length === 0) {
            vscode.window.showInformationMessage('No projects found on the server.');
            return;
        }

        // Build QuickPick items: history first, then all files
        const historyPaths = new Set(history.map(h => h.Path));

        interface ProjectQuickPickItem extends vscode.QuickPickItem {
            projectPath: string;
        }

        const items: ProjectQuickPickItem[] = [];

        if (history.length > 0) {
            items.push({ label: 'Recent Projects', kind: vscode.QuickPickItemKind.Separator, projectPath: '' } as ProjectQuickPickItem);
            for (const h of history) {
                const name = h.Path.replace(/\\/g, '/').split('/').pop()?.replace(/\.ap\d+$/, '') || h.Path;
                items.push({
                    label: `$(history) ${name}`,
                    description: new Date(h.LastAccess).toLocaleDateString(),
                    detail: h.Path,
                    projectPath: h.Path,
                });
            }
        }

        // Add available files not in history
        const nonHistoryFiles = files.filter(f => !historyPaths.has(f.Path));
        if (nonHistoryFiles.length > 0) {
            items.push({ label: 'Available Projects', kind: vscode.QuickPickItemKind.Separator, projectPath: '' } as ProjectQuickPickItem);
            for (const f of nonHistoryFiles) {
                items.push({
                    label: `$(file) ${f.Name}`,
                    description: f.Extension,
                    detail: f.Path,
                    projectPath: f.Path,
                });
            }
        }

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select a project to open',
            matchOnDetail: true,
        });

        if (!selected || !selected.projectPath) { return; }

        showOutput();
        log(`Switching to project: ${selected.projectPath}`);

        await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: 'Switching project...' },
            async (progress) => {
                // Close current project
                try {
                    progress.report({ message: 'Closing current project...' });
                    const closeJobId = await closeProject();
                    await pollJob(closeJobId, (s) => {
                        log(`Close: ${s.Status}${s.Message ? ' - ' + s.Message : ''}`);
                    });
                } catch {
                    // No project open — that's fine
                    log('No project to close (or close failed — continuing).');
                }

                // Open new project
                progress.report({ message: 'Opening project...' });
                const openJobId = await openProject(selected.projectPath);
                const result = await pollJob(openJobId, (s) => {
                    log(`Open: ${s.Status}${s.Message ? ' - ' + s.Message : ''}`);
                    if (s.Message) { progress.report({ message: s.Message }); }
                });

                if (result.Status === 'Failed') {
                    throw new Error(result.Error || result.Message || 'Failed to open project.');
                }
            }
        );

        // Refresh tree — this triggers onProjectLoaded which activates everything
        treeProvider.refresh();
        log('Project switched successfully.');
        vscode.window.showInformationMessage(`Project opened: ${selected.detail}`);

    } catch (err) {
        logError('Switch project failed', err);
        vscode.window.showErrorMessage(`Failed to switch project: ${err instanceof Error ? err.message : err}`);
    }
}

async function disconnect(treeProvider: ProjectTreeProvider, scmProvider: TiaSourceControl): Promise<void> {
    const pick = await vscode.window.showQuickPick(
        [
            { label: '$(debug-disconnect) Disconnect', description: 'Disconnect from the server (keep it running)', action: 'disconnect' },
            { label: '$(stop) Stop Server', description: 'Shut down the T-IA Connect server', action: 'stop' },
        ],
        { placeHolder: 'Disconnect or stop the server?' }
    );

    if (!pick) { return; }

    client.cancelAll();
    getSignalRClient().disconnect();
    vscode.commands.executeCommand('setContext', CONTEXT_KEYS.connected, false);
    setDisconnected();
    scmProvider.stopAutoRefresh();
    treeProvider.refresh();

    if (pick.action === 'stop') {
        try {
            await client.post('/api/health/shutdown');
            log('Server shutdown requested.');
        } catch {
            // Server may already be stopping
        }
        vscode.commands.executeCommand('setContext', CONTEXT_KEYS.serverNotRunning, true);
        log('Disconnected and server stopped.');
    } else {
        log('Disconnected.');
    }
}

async function launchAndConnect(
    headless: boolean,
    treeProvider: ProjectTreeProvider,
    scmProvider: TiaSourceControl,
    testProvider: TestTreeProvider,
): Promise<void> {
    const config = vscode.workspace.getConfiguration('tiaConnect');
    const exePath = config.get<string>('executablePath')
        || 'C:\\Program Files\\FeelAutomCorp\\TiaConnect\\TiaPortalApi.App.exe';

    const args = headless ? ['--headless', '--quiet'] : [];
    const modeLabel = headless ? 'Headless' : 'GUI';

    log(`Launching T-IA Connect (${modeLabel}): ${exePath}`);

    try {
        const { spawn } = require('child_process') as typeof import('child_process');
        const child = spawn(exePath, args, { detached: true, stdio: 'ignore' });
        child.unref();
    } catch (err) {
        vscode.window.showErrorMessage(`Failed to launch T-IA Connect: ${err instanceof Error ? err.message : err}`);
        return;
    }

    // Wait for the server to become reachable, then auto-connect
    const started = await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Starting T-IA Connect...' },
        async () => {
            for (let i = 0; i < 30; i++) {
                await new Promise(r => setTimeout(r, 500));
                if (await client.ping()) {
                    log('T-IA Connect server is now reachable.');
                    return true;
                }
            }
            return false;
        }
    );

    if (started) {
        vscode.commands.executeCommand('setContext', CONTEXT_KEYS.serverNotRunning, false);
        await connect(treeProvider, scmProvider, testProvider);
    } else {
        vscode.window.showErrorMessage('T-IA Connect server did not start in time. Check the executable path in settings.');
    }
}
