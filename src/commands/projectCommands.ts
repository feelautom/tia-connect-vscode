import * as vscode from 'vscode';
import { l10n } from 'vscode';
import { client } from '../api/client';
import { getProjectOverview, listProjectFiles, getProjectHistory, openProject, closeProject, retrieveProject } from '../api/project';
import { pollJob } from '../api/jobs';
import { ProjectTreeProvider } from '../providers/projectTreeProvider';
import { TiaSourceControl } from '../providers/scmProvider';
import { TestTreeProvider } from '../providers/testTreeProvider';
import { setConnected, setDisconnected, setError } from '../views/statusBar';
import { log, logError, showOutput } from '../views/outputChannel';
import { CONTEXT_KEYS } from '../utils/constants';
import { getApiKey, setApiKey, getServerUrl } from '../utils/config';
import { getSignalRClient } from '../api/signalr';
import { CopilotViewProvider } from '../providers/copilotViewProvider';
import { discoverRunningInstance } from '../install/serverDetector';

let copilotProviderRef: CopilotViewProvider | undefined;

export function registerProjectCommands(
    context: vscode.ExtensionContext,
    treeProvider: ProjectTreeProvider,
    scmProvider: TiaSourceControl,
    testProvider: TestTreeProvider,
    copilotProvider?: CopilotViewProvider,
): void {
    copilotProviderRef = copilotProvider;
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
        prompt: l10n.t('Enter your T-IA Connect API Key'),
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
        l10n.t('The API key is invalid or rejected by the server. Enter a new key?'),
        l10n.t('Enter New Key'),
        l10n.t('Cancel'),
    );

    if (retry !== l10n.t('Enter New Key')) {
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
        vscode.window.showErrorMessage(l10n.t('API key still invalid. Check your key in T-IA Connect settings.'));
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
        let reachable = await client.ping();
        if (!reachable) {
            // Try to discover the actual running port from the instance registry
            const instance = discoverRunningInstance();
            if (instance) {
                const discoveredUrl = instance.Url.replace(/\/+$/, '');
                log(`Server not at configured URL — found instance at ${discoveredUrl} via registry.`);
                const action = await vscode.window.showWarningMessage(
                    l10n.t(
                        'T-IA Connect is running on port {0}, but the extension is configured for {1}. Update the server URL?',
                        String(instance.Port),
                        getServerUrl(),
                    ),
                    l10n.t('Update URL'),
                    l10n.t('Cancel'),
                );
                if (action === l10n.t('Update URL')) {
                    await vscode.workspace.getConfiguration('tiaConnect').update(
                        'serverUrl',
                        discoveredUrl,
                        vscode.ConfigurationTarget.Global,
                    );
                    reachable = await client.ping();
                }
            }

            if (!reachable) {
                setError('Server not running');
                vscode.commands.executeCommand('setContext', CONTEXT_KEYS.serverNotRunning, true);
                const url = getServerUrl();
                vscode.window.showErrorMessage(
                    l10n.t('Cannot reach T-IA Connect server at {0}. Launch the server first or check the URL in settings.', url),
                    l10n.t('Launch Server'),
                    l10n.t('Open Settings'),
                ).then(action => {
                    if (action === l10n.t('Launch Server')) {
                        vscode.commands.executeCommand('tiaConnect.launchHeadless');
                    } else if (action === l10n.t('Open Settings')) {
                        vscode.commands.executeCommand('workbench.action.openSettings', 'tiaConnect.serverUrl');
                    }
                });
                return;
            }
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

        // Connect SignalR for real-time job notifications
        getSignalRClient().connect();

        // Get project name for status bar — pre-load into tree to avoid a double API call
        try {
            const overview = await getProjectOverview();
            setConnected(overview.Name);
            log(`Connected. Project: ${overview.Name}`);
            treeProvider.preloadProjectData(overview); // Tree uses this directly, no second fetch needed
            copilotProviderRef?.setConnected(true);
        } catch {
            setConnected();
            log('Connected (no project open).');
            copilotProviderRef?.setNoProject();
        }

        // Refresh all providers
        treeProvider.setConnected(true);
        scmProvider.refresh();
        scmProvider.startAutoRefresh();
        testProvider.discoverTests();
    } catch (err) {
        logError('Connection failed', err);
        setError('Connection failed');
        vscode.window.showErrorMessage(l10n.t('Connection failed: {0}', err instanceof Error ? err.message : String(err)));
    }
}

async function switchProject(treeProvider: ProjectTreeProvider): Promise<void> {
    try {
        // Fetch available projects and history in parallel
        const [files, history] = await Promise.all([
            listProjectFiles().catch(() => []),
            getProjectHistory().catch(() => []),
        ]);

        // Build QuickPick items: browse option + history + files
        interface ProjectQuickPickItem extends vscode.QuickPickItem {
            projectPath: string;
        }

        const items: ProjectQuickPickItem[] = [];

        // Always show browse option first
        items.push({
            label: `$(folder-opened) ${l10n.t('Browse...')}`,
            description: l10n.t('Select a TIA Portal project file'),
            projectPath: '__browse__',
        });

        const historyPaths = new Set(history.map(h => h.Path));

        if (history.length > 0) {
            items.push({ label: l10n.t('Recent Projects'), kind: vscode.QuickPickItemKind.Separator, projectPath: '' } as ProjectQuickPickItem);
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
            items.push({ label: l10n.t('Available Projects'), kind: vscode.QuickPickItemKind.Separator, projectPath: '' } as ProjectQuickPickItem);
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
            placeHolder: l10n.t('Select a project to open'),
            matchOnDetail: true,
        });

        if (!selected || !selected.projectPath) { return; }

        // Handle browse option
        if (selected.projectPath === '__browse__') {
            const defaultPath = process.env.USERPROFILE
                ? vscode.Uri.file(require('path').join(process.env.USERPROFILE, 'Documents', 'Automation'))
                : undefined;
            const fileUri = await vscode.window.showOpenDialog({
                canSelectFiles: true,
                canSelectFolders: false,
                canSelectMany: false,
                defaultUri: defaultPath,
                filters: {
                    'TIA Portal Projects': ['ap17', 'ap18', 'ap19', 'ap20', 'ap21'],
                    'TIA Portal Archives': ['zap17', 'zap18', 'zap19', 'zap20', 'zap21'],
                },
                title: l10n.t('Select a TIA Portal project'),
            });
            if (!fileUri || fileUri.length === 0) { return; }
            selected.projectPath = fileUri[0].fsPath;
            selected.detail = selected.projectPath;
        }

        showOutput();
        log(`Switching to project: ${selected.projectPath}`);

        const projectName = selected.label.replace(/^\$\([^)]+\)\s*/, '');
        treeProvider.setBusy(l10n.t('Opening {0}...', projectName));

        try {
            // Close current project
            try {
                const closeJobId = await closeProject();
                await pollJob(closeJobId, (s) => {
                    log(`Close: ${s.Status}${s.Message ? ' - ' + s.Message : ''}`);
                });
            } catch {
                log('No project to close (or close failed — continuing).');
            }

            // Open or retrieve project
            const isArchive = /\.zap\d+$/i.test(selected.projectPath);
            treeProvider.setBusy(l10n.t(isArchive ? 'Extracting project...' : 'Connecting to TIA Portal...'));

            let openJobId: string;
            if (isArchive) {
                // Ask for target directory to extract the archive
                const targetUri = await vscode.window.showOpenDialog({
                    canSelectFiles: false,
                    canSelectFolders: true,
                    canSelectMany: false,
                    title: l10n.t('Select folder to extract the project into'),
                    defaultUri: process.env.USERPROFILE
                        ? vscode.Uri.file(require('path').join(process.env.USERPROFILE, 'Documents', 'Automation'))
                        : undefined,
                });
                if (!targetUri || targetUri.length === 0) {
                    treeProvider.clearBusy();
                    return;
                }
                openJobId = await retrieveProject(selected.projectPath, targetUri[0].fsPath);
            } else {
                openJobId = await openProject(selected.projectPath);
            }

            await pollJob(openJobId, (s) => {
                log(`Open: ${s.Status}${s.Message ? ' - ' + s.Message : ''}`);
                if (s.Message) { treeProvider.setBusy(s.Message); }
            });
        } finally {
            treeProvider.clearBusy();
        }

        // Refresh tree — this triggers onProjectLoaded which activates everything
        treeProvider.refresh();
        log('Project switched successfully.');
        vscode.window.showInformationMessage(l10n.t('Project opened: {0}', selected.detail!));

    } catch (err) {
        logError('Switch project failed', err);
        vscode.window.showErrorMessage(l10n.t('Failed to switch project: {0}', err instanceof Error ? err.message : String(err)));
    }
}

async function disconnect(treeProvider: ProjectTreeProvider, scmProvider: TiaSourceControl): Promise<void> {
    const pick = await vscode.window.showQuickPick(
        [
            { label: `$(debug-disconnect) ${l10n.t('Disconnect')}`, description: l10n.t('Disconnect from the server (keep it running)'), action: 'disconnect' },
            { label: `$(stop) ${l10n.t('Stop Server')}`, description: l10n.t('Shut down the T-IA Connect server'), action: 'stop' },
        ],
        { placeHolder: l10n.t('Disconnect or stop the server?') }
    );

    if (!pick) { return; }

    client.cancelAll();
    getSignalRClient().disconnect();
    vscode.commands.executeCommand('setContext', CONTEXT_KEYS.connected, false);
    setDisconnected();
    scmProvider.stopAutoRefresh();
    treeProvider.setConnected(false);
    copilotProviderRef?.setConnected(false);

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
    // Check instance registry first — server may already be running on a different port
    const existingInstance = discoverRunningInstance();
    if (existingInstance) {
        const discoveredUrl = existingInstance.Url.replace(/\/+$/, '');
        log(`Instance registry: server already running on port ${existingInstance.Port} — connecting directly.`);
        const currentUrl = getServerUrl().replace(/\/+$/, '');
        if (discoveredUrl !== currentUrl) {
            await vscode.workspace.getConfiguration('tiaConnect').update(
                'serverUrl',
                discoveredUrl,
                vscode.ConfigurationTarget.Global,
            );
            log(`Server URL updated to ${discoveredUrl}`);
        }
        const { fetchLocalApiKey } = require('../install/serverDetector');
        await fetchLocalApiKey();
        await connect(treeProvider, scmProvider, testProvider);
        return;
    }

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
        vscode.window.showErrorMessage(l10n.t('Failed to launch T-IA Connect: {0}', err instanceof Error ? err.message : String(err)));
        return;
    }

    // Show loading in sidebar while waiting for server
    treeProvider.setBusy(l10n.t('Starting T-IA Connect...'));
    vscode.commands.executeCommand('setContext', CONTEXT_KEYS.serverNotRunning, false);

    let started = false;
    for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 500));
        if (await client.ping()) {
            log('T-IA Connect server is now reachable.');
            started = true;
            break;
        }
    }

    treeProvider.clearBusy();

    if (started) {
        // Auto-fetch API key before connecting
        const { fetchLocalApiKey } = require('../install/serverDetector');
        await fetchLocalApiKey();
        await connect(treeProvider, scmProvider, testProvider);
    } else {
        vscode.commands.executeCommand('setContext', CONTEXT_KEYS.serverNotRunning, true);
        vscode.window.showErrorMessage(l10n.t('T-IA Connect server did not start in time. Check the executable path in settings.'));
    }
}
