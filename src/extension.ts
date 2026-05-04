import * as vscode from 'vscode';
import { ProjectTreeProvider } from './providers/projectTreeProvider';
import { BlockEditor } from './editors/blockEditor';
import { registerProjectCommands } from './commands/projectCommands';
import { registerBlockCommands } from './commands/blockCommands';
import { createStatusBar, disposeStatusBar } from './views/statusBar';
import { getOutputChannel, log } from './views/outputChannel';

let blockEditor: BlockEditor;

export function activate(context: vscode.ExtensionContext): void {
    log('T-IA Connect for VS Code activating...');

    // Status bar
    const statusBar = createStatusBar();
    context.subscriptions.push(statusBar);

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

    // Register commands
    registerProjectCommands(context, treeProvider);
    registerBlockCommands(context, blockEditor);

    // Output channel
    context.subscriptions.push(getOutputChannel());

    log('T-IA Connect for VS Code activated.');
}

export function deactivate(): void {
    blockEditor?.dispose();
    disposeStatusBar();
}
