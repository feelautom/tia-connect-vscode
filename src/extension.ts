import * as vscode from 'vscode';
import { ProjectTreeProvider } from './providers/projectTreeProvider';
import { TiaSourceControl } from './providers/scmProvider';
import { TestTreeProvider } from './providers/testTreeProvider';
import { BlockEditor } from './editors/blockEditor';
import { registerProjectCommands } from './commands/projectCommands';
import { registerBlockCommands } from './commands/blockCommands';
import { registerPipelineCommands } from './commands/pipelineCommands';
import { createStatusBar, setConnected, disposeStatusBar } from './views/statusBar';
import { createDiagnostics, disposeDiagnostics } from './views/diagnostics';
import { getOutputChannel, log } from './views/outputChannel';
import { CONTEXT_KEYS, ORIGINAL_SCHEME } from './utils/constants';
import { VcsContentProvider, VCS_SCHEME } from './providers/vcsContentProvider';
import { VcsTreeProvider } from './providers/vcsTreeProvider';
import { registerLanguageProviders } from './language';
import { getSignalRClient, disposeSignalR } from './api/signalr';
import { AuthService } from './auth/authService';
import { TiaUriHandler } from './auth/uriHandler';
import { detectServer } from './install/serverDetector';

let blockEditor: BlockEditor;
let scmProvider: TiaSourceControl;
let testProvider: TestTreeProvider;
let vcsTreeProvider: VcsTreeProvider;
let authService: AuthService;

export function activate(context: vscode.ExtensionContext): void {
    log('T-IA Connect for VS Code activating...');

    // Auth service + URI handler
    authService = new AuthService(context);
    context.subscriptions.push(authService);

    const uriHandler = new TiaUriHandler(authService);
    context.subscriptions.push(vscode.window.registerUriHandler(uriHandler));

    // Auth commands
    context.subscriptions.push(
        vscode.commands.registerCommand('tiaConnect.login', async () => {
            const state = await authService.login();
            uriHandler.setPendingState(state);
        }),
        vscode.commands.registerCommand('tiaConnect.register', () => authService.register()),
        vscode.commands.registerCommand('tiaConnect.logout', async () => {
            await authService.logout();
            vscode.window.showInformationMessage('T-IA Connect: Logged out.');
        }),
    );

    // Validate session and detect server on startup
    initAuthAndServer(context);

    // Status bar
    const statusBar = createStatusBar();
    context.subscriptions.push(statusBar);

    // Diagnostics (compilation errors in editor)
    const diagnostics = createDiagnostics();
    context.subscriptions.push(diagnostics);

    // Tree view provider
    const treeProvider = new ProjectTreeProvider();
    treeProvider.setExtensionPath(context.extensionPath);
    const treeView = vscode.window.createTreeView('tiaProjectExplorer', {
        treeDataProvider: treeProvider,
        showCollapseAll: true,
    });
    context.subscriptions.push(treeView);

    // Block editor (handles open/save/reimport)
    blockEditor = new BlockEditor();
    blockEditor.activate(context);
    // QuickDiff will be connected after scmProvider is created (below)

    // Source Control (VCS)
    scmProvider = new TiaSourceControl();
    scmProvider.activate(context);
    context.subscriptions.push(scmProvider);

    // Register QuickDiff content provider for original block content
    context.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider(
            ORIGINAL_SCHEME,
            scmProvider.originalContentProvider
        )
    );

    // Register VCS content provider for SCM diff (file content at commit)
    context.subscriptions.push(
        vscode.workspace.registerTextDocumentContentProvider(
            VCS_SCHEME,
            new VcsContentProvider()
        )
    );

    // Connect block editor to QuickDiff provider
    blockEditor.setOriginalContentProvider(scmProvider.originalContentProvider);

    // VCS Tree View (our own Source Control panel)
    vcsTreeProvider = new VcsTreeProvider();
    vcsTreeProvider.activate(context);
    const vcsTreeView = vscode.window.createTreeView('tiaVcsExplorer', {
        treeDataProvider: vcsTreeProvider,
    });
    context.subscriptions.push(vcsTreeView, vcsTreeProvider);

    // Test Explorer (integrated in sidebar)
    testProvider = new TestTreeProvider();
    testProvider.activate(context);
    context.subscriptions.push(testProvider);

    // Refresh tree after successful reimport
    blockEditor.onBlockReimported(() => {
        treeProvider.refresh();
    });

    // When the tree loads a project, activate VCS + tests + status bar
    treeProvider.onProjectLoaded((projectName) => {
        vscode.commands.executeCommand('setContext', CONTEXT_KEYS.connected, true);
        setConnected(projectName);
        scmProvider.refresh();
        scmProvider.startAutoRefresh();
        vcsTreeProvider.refresh();
        vcsTreeProvider.startAutoRefresh();
        vcsTreeProvider.startAutoExport();
        testProvider.discoverTests();
        // Connect SignalR for real-time job notifications
        getSignalRClient().connect();
    });

    // Register commands
    registerProjectCommands(context, treeProvider, scmProvider, testProvider);
    registerBlockCommands(context, blockEditor);
    registerPipelineCommands(context);

    // Language features (SCL/STL: completion, symbols, go-to-def, hover)
    registerLanguageProviders(context);

    // Output channel
    context.subscriptions.push(getOutputChannel());

    log('T-IA Connect for VS Code activated.');
}

export function deactivate(): void {
    disposeSignalR();
    blockEditor?.dispose();
    scmProvider?.dispose();
    vcsTreeProvider?.dispose();
    testProvider?.dispose();
    disposeDiagnostics();
    disposeStatusBar();
}

/** Validate stored auth session and detect server status on startup */
async function initAuthAndServer(_context: vscode.ExtensionContext): Promise<void> {
    // 1. Validate auth session (non-blocking for the rest of activation)
    const isAuthenticated = await authService.validateSession();
    log(`Auth session: ${isAuthenticated ? 'valid' : 'none'}`);

    // 2. Detect server installation and running status
    const server = await detectServer();

    if (!server.installed) {
        vscode.commands.executeCommand('setContext', CONTEXT_KEYS.serverNotInstalled, true);
        vscode.commands.executeCommand('setContext', CONTEXT_KEYS.serverNotRunning, true);
    } else if (!server.running) {
        vscode.commands.executeCommand('setContext', CONTEXT_KEYS.serverNotInstalled, false);
        vscode.commands.executeCommand('setContext', CONTEXT_KEYS.serverNotRunning, true);
    } else {
        vscode.commands.executeCommand('setContext', CONTEXT_KEYS.serverNotInstalled, false);
        vscode.commands.executeCommand('setContext', CONTEXT_KEYS.serverNotRunning, false);
    }
}
