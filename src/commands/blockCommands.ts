import * as vscode from 'vscode';
import { BlockEditor } from '../editors/blockEditor';
import { TiaTreeItem } from '../providers/projectTreeProvider';
import { compileDevice, compileBlock, exportBlockToFile } from '../api/blocks';
import { log, logError } from '../views/outputChannel';

export function registerBlockCommands(
    context: vscode.ExtensionContext,
    blockEditor: BlockEditor,
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('tiaConnect.openBlock', (item: TiaTreeItem) =>
            blockEditor.openBlock(item)
        ),
        vscode.commands.registerCommand('tiaConnect.compileDevice', (item: TiaTreeItem) =>
            doCompileDevice(item)
        ),
        vscode.commands.registerCommand('tiaConnect.compileBlock', (item: TiaTreeItem) =>
            doCompileBlock(item)
        ),
        vscode.commands.registerCommand('tiaConnect.exportBlock', (item: TiaTreeItem) =>
            doExportBlock(item)
        ),
    );
}

async function doCompileDevice(item: TiaTreeItem): Promise<void> {
    if (!item.deviceName) { return; }

    try {
        const result = await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: `Compiling ${item.deviceName}...` },
            () => compileDevice(item.deviceName!)
        );

        const msg = `Compilation: ${result.ErrorCount} error(s), ${result.WarningCount} warning(s)`;
        log(msg);

        if (result.ErrorCount === 0) {
            vscode.window.showInformationMessage(msg);
        } else {
            vscode.window.showErrorMessage(msg);
            // Show details in output
            for (const m of result.Messages) {
                log(`  [${m.ErrorLevel}] ${m.Path}: ${m.Description}`);
            }
        }
    } catch (err) {
        logError('Compilation failed', err);
        vscode.window.showErrorMessage(`Compilation failed: ${err instanceof Error ? err.message : err}`);
    }
}

async function doCompileBlock(item: TiaTreeItem): Promise<void> {
    if (!item.deviceName || !item.blockName) { return; }

    try {
        const result = await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: `Compiling ${item.blockName}...` },
            () => compileBlock(item.deviceName!, item.blockName!)
        );

        const msg = `${item.blockName}: ${result.ErrorCount} error(s), ${result.WarningCount} warning(s)`;
        log(msg);

        if (result.ErrorCount === 0) {
            vscode.window.showInformationMessage(msg);
        } else {
            vscode.window.showErrorMessage(msg);
        }
    } catch (err) {
        logError(`Compile block ${item.blockName} failed`, err);
        vscode.window.showErrorMessage(`Compilation failed: ${err instanceof Error ? err.message : err}`);
    }
}

async function doExportBlock(item: TiaTreeItem): Promise<void> {
    if (!item.deviceName || !item.blockName) { return; }

    const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(`${item.blockName}.xml`),
        filters: { 'SimaticML XML': ['xml'], 'All files': ['*'] },
    });

    if (!uri) { return; }

    try {
        await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: `Exporting ${item.blockName}...` },
            () => exportBlockToFile(item.deviceName!, item.blockName!, uri.fsPath)
        );

        vscode.window.showInformationMessage(`Block ${item.blockName} exported.`);
        log(`Exported ${item.blockName} to ${uri.fsPath}`);
    } catch (err) {
        logError(`Export block ${item.blockName} failed`, err);
        vscode.window.showErrorMessage(`Export failed: ${err instanceof Error ? err.message : err}`);
    }
}
