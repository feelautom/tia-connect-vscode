import * as vscode from 'vscode';
import { l10n } from 'vscode';
import * as fs from 'fs';
import { BlockEditor } from '../editors/blockEditor';
import { TiaTreeItem } from '../providers/projectTreeProvider';
import { compileDevice, compileBlock, getBlockContent, exportBlockSource, importAndGenerate, generateAndImportBlock } from '../api/blocks';
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
        vscode.commands.registerCommand('tiaConnect.createBlock', (item?: TiaTreeItem) =>
            doCreateBlock(item)
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
                vscode.window.showWarningMessage(l10n.t('No devices found in the project.'));
                return;
            }
            if (devices.length === 1) {
                deviceName = devices[0].Name;
            } else {
                const pick = await vscode.window.showQuickPick(
                    devices.map(d => d.Name),
                    { placeHolder: l10n.t('Select the target device') }
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
            { location: { viewId: 'tiaProjectExplorer' }, title: l10n.t('Compiling {0}...', deviceName!) },
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
        vscode.window.showErrorMessage(l10n.t('Compilation failed: {0}', err instanceof Error ? err.message : String(err)));
    }
}

async function doCompileBlock(item: TiaTreeItem): Promise<void> {
    if (!item.deviceName || !item.blockName) { return; }

    showOutput();
    log(`--- Compiling block ${item.blockName} ---`);

    try {
        const result = await vscode.window.withProgress(
            { location: { viewId: 'tiaProjectExplorer' }, title: l10n.t('Compiling {0}...', item.blockName!) },
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
        vscode.window.showErrorMessage(l10n.t('Compilation failed: {0}', err instanceof Error ? err.message : String(err)));
    }
}

async function doShowCrossReferences(item: TiaTreeItem): Promise<void> {
    if (!item.deviceName || !item.blockName) { return; }
    await vscode.window.withProgress(
        { location: { viewId: 'tiaProjectExplorer' }, title: l10n.t('Loading {0}...', item.blockName!) },
        () => openCrossRefWebview(item.deviceName!, item.blockName!)
    );
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
            { location: { viewId: 'tiaProjectExplorer' }, title: l10n.t('Loading {0}...', item.blockName!) },
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

        vscode.window.showInformationMessage(l10n.t('Block {0} exported to {1}', item.blockName!, uri.fsPath));
        log(`Exported ${item.blockName} to ${uri.fsPath}`);
    } catch (err) {
        logError(`Export block ${item.blockName} failed`, err);
        vscode.window.showErrorMessage(l10n.t('Export failed: {0}', err instanceof Error ? err.message : String(err)));
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
                vscode.window.showWarningMessage(l10n.t('No devices found in the project.'));
                return;
            }
            if (devices.length === 1) {
                deviceName = devices[0].Name;
            } else {
                const pick = await vscode.window.showQuickPick(
                    devices.map(d => d.Name),
                    { placeHolder: l10n.t('Select the target device') }
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
                { location: { viewId: 'tiaProjectExplorer' }, title: l10n.t('Loading {0}...', fileName) },
                () => importAndGenerate(deviceName!, content)
            );

            log(`Imported ${fileName} successfully.`);
            successCount++;
        } catch (err) {
            logError(`Import ${fileName} failed`, err);
            vscode.window.showErrorMessage(l10n.t('Import failed for {0}: {1}', fileName, err instanceof Error ? err.message : String(err)));
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

async function doCreateBlock(item?: TiaTreeItem): Promise<void> {
    let deviceName = item?.deviceName;

    if (!deviceName) {
        try {
            const overview = await getProjectOverview();
            const devices = overview?.Devices;
            if (!devices || devices.length === 0) {
                vscode.window.showWarningMessage(l10n.t('No devices found in the project.'));
                return;
            }
            if (devices.length === 1) {
                deviceName = devices[0].Name;
            } else {
                const pick = await vscode.window.showQuickPick(
                    devices.map(d => d.Name),
                    { placeHolder: l10n.t('Select the target device') }
                );
                if (!pick) { return; }
                deviceName = pick;
            }
        } catch (err) {
            logError('Failed to list devices', err);
            return;
        }
    }

    if (!deviceName) { return; }

    // Pick block type
    const blockType = await vscode.window.showQuickPick(
        [
            { label: 'Function Block (FB)', value: 'FB' },
            { label: 'Function (FC)', value: 'FC' },
            { label: 'Organization Block (OB)', value: 'OB' },
            { label: 'Data Block (DB)', value: 'DB' },
        ],
        { placeHolder: l10n.t('Select block type') }
    );
    if (!blockType) { return; }

    // Pick language — all supported languages
    const languageItems = blockType.value === 'DB'
        ? [{ label: 'SCL', description: l10n.t('Editable in VS Code') }]
        : [
            { label: 'SCL', description: l10n.t('Editable in VS Code') },
            { label: 'STL', description: l10n.t('Editable in VS Code') },
            { label: 'LAD', description: l10n.t('Read-only graphical view') },
            { label: 'FBD', description: l10n.t('Read-only graphical view') },
            { label: 'GRAPH', description: l10n.t('Sequential Function Chart') },
        ];

    const langPick = await vscode.window.showQuickPick(languageItems, {
        placeHolder: l10n.t('Select programming language'),
    });
    if (!langPick) { return; }
    const language = langPick.label;

    // Enter block name
    const blockName = await vscode.window.showInputBox({
        prompt: l10n.t('Enter block name'),
        placeHolder: blockType.value === 'OB' ? 'Main' : `${blockType.value}_MyBlock`,
        validateInput: (v) => v.trim() ? undefined : l10n.t('Block name is required'),
    });
    if (!blockName) { return; }

    showOutput();
    log(`--- Creating ${blockType.value} "${blockName}" (${language}) on ${deviceName} ---`);

    try {
        await vscode.window.withProgress(
            { location: { viewId: 'tiaProjectExplorer' }, title: l10n.t('Creating {0}...', blockName) },
            async () => {
                if (language === 'SCL' || language === 'STL') {
                    // Text-based: use external source import
                    const source = generateBlockTemplate(blockType.value, blockName, language);
                    await importAndGenerate(deviceName!, source, `${blockName}_create`);
                } else {
                    // Graphical: use XML generation endpoint
                    await generateAndImportBlock(deviceName!, blockType.value, blockName, language);
                }
            }
        );

        vscode.window.showInformationMessage(l10n.t('Block {0} created successfully.', blockName));
        log(`Block "${blockName}" created.`);

        // Refresh the tree to show the new block
        vscode.commands.executeCommand('tiaConnect.refreshProject');
    } catch (err) {
        logError(`Create block ${blockName} failed`, err);
        vscode.window.showErrorMessage(l10n.t('Failed to create block: {0}', err instanceof Error ? err.message : String(err)));
    }
}

function generateBlockTemplate(type: string, name: string, language: string): string {
    if (language === 'STL') {
        return generateStlTemplate(type, name);
    }
    return generateSclTemplate(type, name);
}

function generateSclTemplate(type: string, name: string): string {
    switch (type) {
        case 'FB':
            return `FUNCTION_BLOCK "${name}"
{ S7_Optimized_Access := 'TRUE' }
VERSION : 0.1

VAR_INPUT
END_VAR

VAR_OUTPUT
END_VAR

VAR
END_VAR

BEGIN
\t;
END_FUNCTION_BLOCK
`;
        case 'FC':
            return `FUNCTION "${name}" : Void
{ S7_Optimized_Access := 'TRUE' }
VERSION : 0.1

VAR_INPUT
END_VAR

VAR_OUTPUT
END_VAR

VAR_TEMP
END_VAR

BEGIN
\t;
END_FUNCTION
`;
        case 'OB':
            return `ORGANIZATION_BLOCK "${name}"
{ S7_Optimized_Access := 'TRUE' }
VERSION : 0.1

BEGIN
\t;
END_ORGANIZATION_BLOCK
`;
        case 'DB':
            return `DATA_BLOCK "${name}"
{ S7_Optimized_Access := 'TRUE' }
VERSION : 0.1

NON_RETAIN

VAR
\tMyVar : Int;
END_VAR

BEGIN

END_DATA_BLOCK
`;
        default:
            return '';
    }
}

function generateStlTemplate(type: string, name: string): string {
    switch (type) {
        case 'FB':
            return `FUNCTION_BLOCK "${name}"
VERSION : 0.1

VAR_INPUT
END_VAR

VAR_OUTPUT
END_VAR

VAR
END_VAR

BEGIN
NETWORK
TITLE =
\tNOP 0;
END_FUNCTION_BLOCK
`;
        case 'FC':
            return `FUNCTION "${name}" : VOID
VERSION : 0.1

VAR_INPUT
END_VAR

VAR_OUTPUT
END_VAR

VAR_TEMP
END_VAR

BEGIN
NETWORK
TITLE =
\tNOP 0;
END_FUNCTION
`;
        case 'OB':
            return `ORGANIZATION_BLOCK "${name}"
VERSION : 0.1

VAR_TEMP
END_VAR

BEGIN
NETWORK
TITLE =
\tNOP 0;
END_ORGANIZATION_BLOCK
`;
        case 'DB':
            return `DATA_BLOCK "${name}"
VERSION : 0.1

VAR
\tMyVar : INT;
END_VAR

BEGIN

END_DATA_BLOCK
`;
        default:
            return '';
    }
}
