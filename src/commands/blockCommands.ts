import * as vscode from 'vscode';
import * as fs from 'fs';
import { BlockEditor } from '../editors/blockEditor';
import { TiaTreeItem } from '../providers/projectTreeProvider';
import { compileDevice, compileBlock, getBlockContent } from '../api/blocks';
import { log, logError, showOutput } from '../views/outputChannel';

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

    showOutput();
    log(`--- Compiling device ${item.deviceName} ---`);

    try {
        const result = await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: `Compiling ${item.deviceName}...` },
            () => compileDevice(item.deviceName!)
        );

        const msg = `Compilation: ${result.ErrorCount} error(s), ${result.WarningCount} warning(s)`;
        log(msg);

        for (const m of result.Messages) {
            log(`  [${m.ErrorLevel}] ${m.Path}: ${m.Description}`);
        }

        if (result.ErrorCount === 0) {
            vscode.window.showInformationMessage(msg);
        } else {
            vscode.window.showErrorMessage(msg);
        }
    } catch (err) {
        logError('Compilation failed', err);
        vscode.window.showErrorMessage(`Compilation failed: ${err instanceof Error ? err.message : err}`);
    }
}

async function doCompileBlock(item: TiaTreeItem): Promise<void> {
    if (!item.deviceName || !item.blockName) { return; }

    showOutput();
    log(`--- Compiling block ${item.blockName} ---`);

    try {
        const result = await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: `Compiling ${item.blockName}...` },
            () => compileBlock(item.deviceName!, item.blockName!)
        );

        const msg = `${item.blockName}: ${result.ErrorCount} error(s), ${result.WarningCount} warning(s)`;
        log(msg);

        for (const m of result.Messages) {
            log(`  [${m.ErrorLevel}] ${m.Path}: ${m.Description}`);
        }

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

    const lang = (item.language || '').toUpperCase();
    const ext = lang === 'STL' ? '.stl' : '.scl';

    const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(`${item.blockName}${ext}`),
        filters: { [`${lang} Source`]: [ext.substring(1)], 'All files': ['*'] },
    });

    if (!uri) { return; }

    try {
        const content = await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: `Exporting ${item.blockName}...` },
            async () => {
                const dto = await getBlockContent(item.deviceName!, item.blockName!);
                if (dto.SourceText) {
                    return dto.SourceText;
                }
                throw new Error(`No source code available for ${item.blockName}.`);
            }
        );

        fs.writeFileSync(uri.fsPath, content, 'utf-8');

        vscode.window.showInformationMessage(`Block ${item.blockName} exported to ${uri.fsPath}`);
        log(`Exported ${item.blockName} to ${uri.fsPath}`);
    } catch (err) {
        logError(`Export block ${item.blockName} failed`, err);
        vscode.window.showErrorMessage(`Export failed: ${err instanceof Error ? err.message : err}`);
    }
}
