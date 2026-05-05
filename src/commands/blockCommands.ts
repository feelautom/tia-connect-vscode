import * as vscode from 'vscode';
import * as fs from 'fs';
import { BlockEditor } from '../editors/blockEditor';
import { TiaTreeItem } from '../providers/projectTreeProvider';
import { compileDevice, compileBlock, getBlockContent, exportBlockSource, importAndGenerate } from '../api/blocks';
import { getProjectOverview } from '../api/project';
import { openCrossRefWebview } from '../editors/crossRefWebview';
import { openTagTableWebview } from '../editors/tagTableWebview';
import { openUdtWebview } from '../editors/udtWebview';
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
        vscode.commands.registerCommand('tiaConnect.showCrossReferences', (item: TiaTreeItem) =>
            doShowCrossReferences(item)
        ),
        vscode.commands.registerCommand('tiaConnect.openTagTable', (item: TiaTreeItem) =>
            doOpenTagTable(item)
        ),
        vscode.commands.registerCommand('tiaConnect.openUdt', (item: TiaTreeItem) =>
            doOpenUdt(item)
        ),
        vscode.commands.registerCommand('tiaConnect.importSourceFile', (item?: TiaTreeItem) =>
            doImportSourceFile(item)
        ),
    );
}

async function doCompileDevice(item?: TiaTreeItem): Promise<void> {
    let deviceName = item?.deviceName;

    // If invoked via keybinding (no tree item), ask the user to pick a device
    if (!deviceName) {
        try {
            const overview = await getProjectOverview();
            const devices = overview?.Devices;
            if (!devices || devices.length === 0) {
                vscode.window.showWarningMessage('No devices found in the project.');
                return;
            }
            if (devices.length === 1) {
                deviceName = devices[0].Name;
            } else {
                const pick = await vscode.window.showQuickPick(
                    devices.map(d => d.Name),
                    { placeHolder: 'Select a device to compile' }
                );
                if (!pick) { return; }
                deviceName = pick;
            }
        } catch (err) {
            logError('Failed to list devices for compilation', err);
            return;
        }
    }

    if (!deviceName) { return; }

    showOutput();
    log(`--- Compiling device ${deviceName} ---`);

    try {
        const result = await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: `Compiling ${deviceName}...` },
            () => compileDevice(deviceName!)
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

async function doShowCrossReferences(item: TiaTreeItem): Promise<void> {
    if (!item.deviceName || !item.blockName) { return; }
    await openCrossRefWebview(item.deviceName, item.blockName);
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

                // Fallback: try export-source endpoint (works for STL and some SCL blocks)
                try {
                    const source = await exportBlockSource(item.deviceName!, item.blockName!);
                    if (source) {
                        return source;
                    }
                } catch {
                    log(`export-source not available for ${item.blockName}`);
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

async function doOpenTagTable(item: TiaTreeItem): Promise<void> {
    if (!item.deviceName || !item.tagTableName) { return; }
    await openTagTableWebview(item.deviceName, item.tagTableName);
}

async function doOpenUdt(item: TiaTreeItem): Promise<void> {
    if (!item.deviceName) { return; }
    await openUdtWebview(item.deviceName, item.label);
}

async function doImportSourceFile(item?: TiaTreeItem): Promise<void> {
    let deviceName = item?.deviceName;

    // If no device context, ask the user to pick one
    if (!deviceName) {
        try {
            const overview = await getProjectOverview();
            const devices = overview?.Devices;
            if (!devices || devices.length === 0) {
                vscode.window.showWarningMessage('No devices found in the project.');
                return;
            }
            if (devices.length === 1) {
                deviceName = devices[0].Name;
            } else {
                const pick = await vscode.window.showQuickPick(
                    devices.map(d => d.Name),
                    { placeHolder: 'Select target device for import' }
                );
                if (!pick) { return; }
                deviceName = pick;
            }
        } catch (err) {
            logError('Failed to list devices for import', err);
            return;
        }
    }

    if (!deviceName) { return; }

    // Open file picker for SCL/STL files
    const uris = await vscode.window.showOpenDialog({
        canSelectMany: true,
        filters: {
            'SCL/STL Source': ['scl', 'stl'],
            'All files': ['*'],
        },
        openLabel: 'Import',
    });

    if (!uris || uris.length === 0) { return; }

    showOutput();
    let successCount = 0;
    let errorCount = 0;

    for (const uri of uris) {
        const fileName = uri.fsPath.split(/[\\/]/).pop() || uri.fsPath;
        log(`--- Importing ${fileName} into ${deviceName} ---`);

        try {
            const content = fs.readFileSync(uri.fsPath, 'utf-8');

            await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: `Importing ${fileName}...` },
                () => importAndGenerate(deviceName!, content)
            );

            log(`Imported ${fileName} successfully.`);
            successCount++;
        } catch (err) {
            logError(`Import ${fileName} failed`, err);
            vscode.window.showErrorMessage(`Import failed for ${fileName}: ${err instanceof Error ? err.message : err}`);
            errorCount++;
        }
    }

    if (successCount > 0) {
        const msg = errorCount > 0
            ? `Imported ${successCount} file(s) with ${errorCount} error(s).`
            : `Imported ${successCount} file(s) successfully.`;
        vscode.window.showInformationMessage(msg);
    }
}
