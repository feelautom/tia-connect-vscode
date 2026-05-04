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
import { registerLanguageProviders } from './language';

let blockEditor: BlockEditor;
let scmProvider: TiaSourceControl;
let testProvider: TestTreeProvider;

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

    // Connect block editor to QuickDiff provider
    blockEditor.setOriginalContentProvider(scmProvider.originalContentProvider);

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
        testProvider.discoverTests();
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
    blockEditor?.dispose();
    scmProvider?.dispose();
    testProvider?.dispose();
    disposeDiagnostics();
    disposeStatusBar();
}
