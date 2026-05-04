import * as vscode from 'vscode';
import { ProjectTreeProvider } from './providers/projectTreeProvider';
import { TiaSourceControl } from './providers/scmProvider';
import { TiaTestProvider } from './providers/testProvider';
import { BlockEditor } from './editors/blockEditor';
import { registerProjectCommands } from './commands/projectCommands';
import { registerBlockCommands } from './commands/blockCommands';
import { registerPipelineCommands } from './commands/pipelineCommands';
import { createStatusBar, setConnected, disposeStatusBar } from './views/statusBar';
import { createDiagnostics, disposeDiagnostics } from './views/diagnostics';
import { getOutputChannel, log } from './views/outputChannel';
import { CONTEXT_KEYS } from './utils/constants';

let blockEditor: BlockEditor;
let scmProvider: TiaSourceControl;
let testProvider: TiaTestProvider;

export function activate(context: vscode.ExtensionContext): void {
    log('T-IA Connect for VS Code activating...');

    // Status bar
    const statusBar = createStatusBar();
    context.subscriptions.push(statusBar);

    // Diagnostics (compilation errors in editor)
    const diagnostics = createDiagnostics();
    context.subscriptions.push(diagnostics);

    // Tree view provider
    const treeProvider = new ProjectTreeProvider();
    const treeView = vscode.window.createTreeView('tiaProjectExplorer', {
        treeDataProvider: treeProvider,
        showCollapseAll: true,
    });
    context.subscriptions.push(treeView);

    // Block editor (handles open/save/reimport)
    blockEditor = new BlockEditor();
    blockEditor.activate(context);

    // Source Control (VCS)
    scmProvider = new TiaSourceControl();
    scmProvider.activate(context);
    context.subscriptions.push(scmProvider);

    // Test Explorer
    testProvider = new TiaTestProvider();
    testProvider.activate(context);
    context.subscriptions.push(testProvider);

    // When the tree loads a project, activate VCS + tests + status bar
    treeProvider.onProjectLoaded((projectName) => {
        vscode.commands.executeCommand('setContext', CONTEXT_KEYS.connected, true);
        setConnected(projectName);
        scmProvider.refresh();
        scmProvider.startAutoRefresh();
        testProvider.discoverTests();
    });

    // Register commands
    registerProjectCommands(context, treeProvider, scmProvider, testProvider);
    registerBlockCommands(context, blockEditor);
    registerPipelineCommands(context);

    // Output channel
    context.subscriptions.push(getOutputChannel());

    log('T-IA Connect for VS Code activated.');
}

export function deactivate(): void {
    blockEditor?.dispose();
    scmProvider?.dispose();
    testProvider?.dispose();
    disposeDiagnostics();
    disposeStatusBar();
}
