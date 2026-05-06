import * as vscode from 'vscode';
import { l10n } from 'vscode';
import { TiaTreeItem } from '../providers/projectTreeProvider';
import {
    exportTagTableCsv, exportTagTableXlsx, exportTagTableXml,
    importTagsCsv, importTagsXlsx,
    exportUdtXml, importUdtXml,
    exportWatchTableXml,
    getTagTables, getUdts, getWatchTables,
} from '../api/tags';
import { exportBlockSource } from '../api/blocks';
import { getProjectOverview } from '../api/project';
import { log, logError, showOutput } from '../views/outputChannel';

export function registerExportImportCommands(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        // Tag table export
        vscode.commands.registerCommand('tiaConnect.exportTagsCsv', (item: TiaTreeItem) =>
            doExportTagTable(item, 'csv')),
        vscode.commands.registerCommand('tiaConnect.exportTagsXlsx', (item: TiaTreeItem) =>
            doExportTagTable(item, 'xlsx')),
        vscode.commands.registerCommand('tiaConnect.exportTagsXml', (item: TiaTreeItem) =>
            doExportTagTable(item, 'xml')),
        // Tag table import
        vscode.commands.registerCommand('tiaConnect.importTagsCsv', (item: TiaTreeItem) =>
            doImportTags(item, 'csv')),
        vscode.commands.registerCommand('tiaConnect.importTagsXlsx', (item: TiaTreeItem) =>
            doImportTags(item, 'xlsx')),
        // UDT export/import
        vscode.commands.registerCommand('tiaConnect.exportUdt', (item: TiaTreeItem) =>
            doExportUdt(item)),
        vscode.commands.registerCommand('tiaConnect.importUdt', (item: TiaTreeItem) =>
            doImportUdt(item)),
        // Watch table export
        vscode.commands.registerCommand('tiaConnect.exportWatchTable', (item: TiaTreeItem) =>
            doExportWatchTable(item)),
        // Export All
        vscode.commands.registerCommand('tiaConnect.exportAll', (item?: TiaTreeItem) =>
            doExportAll(item)),
    );
}

// ─── Tag Table Export ────────────────────────────────────────────

async function doExportTagTable(item: TiaTreeItem, format: 'csv' | 'xlsx' | 'xml'): Promise<void> {
    if (!item.deviceName || !item.tagTableName) { return; }

    const ext = format === 'csv' ? 'csv' : format === 'xlsx' ? 'xlsx' : 'xml';
    const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(`${item.tagTableName}.${ext}`),
        filters: { [`${format.toUpperCase()} files`]: [ext] },
    });
    if (!uri) { return; }

    try {
        await vscode.window.withProgress(
            { location: { viewId: 'tiaProjectExplorer' }, title: l10n.t('Exporting {0}...', item.tagTableName!) },
            async () => {
                switch (format) {
                    case 'csv': await exportTagTableCsv(item.deviceName!, item.tagTableName!, uri.fsPath); break;
                    case 'xlsx': await exportTagTableXlsx(item.deviceName!, item.tagTableName!, uri.fsPath); break;
                    case 'xml': await exportTagTableXml(item.deviceName!, item.tagTableName!, uri.fsPath); break;
                }
            }
        );
        vscode.window.showInformationMessage(l10n.t('Tag table "{0}" exported to {1}', item.tagTableName!, uri.fsPath));
        log(`Exported tag table "${item.tagTableName}" to ${uri.fsPath}`);
    } catch (err) {
        logError(`Export tag table "${item.tagTableName}" failed`, err);
        vscode.window.showErrorMessage(l10n.t('Export failed: {0}', err instanceof Error ? err.message : String(err)));
    }
}

// ─── Tag Table Import ────────────────────────────────────────────

async function doImportTags(item: TiaTreeItem, format: 'csv' | 'xlsx'): Promise<void> {
    if (!item.deviceName || !item.tagTableName) { return; }

    const ext = format === 'csv' ? 'csv' : 'xlsx';
    const uris = await vscode.window.showOpenDialog({
        filters: { [`${format.toUpperCase()} files`]: [ext] },
        openLabel: l10n.t('Import'),
    });
    if (!uris || uris.length === 0) { return; }

    try {
        await vscode.window.withProgress(
            { location: { viewId: 'tiaProjectExplorer' }, title: l10n.t('Importing tags into {0}...', item.tagTableName!) },
            async () => {
                if (format === 'csv') {
                    await importTagsCsv(item.deviceName!, item.tagTableName!, uris[0].fsPath);
                } else {
                    await importTagsXlsx(item.deviceName!, item.tagTableName!, uris[0].fsPath);
                }
            }
        );
        vscode.window.showInformationMessage(l10n.t('Tags imported into "{0}" successfully.', item.tagTableName!));
        log(`Imported tags into "${item.tagTableName}" from ${uris[0].fsPath}`);
        vscode.commands.executeCommand('tiaConnect.refreshProject');
    } catch (err) {
        logError(`Import tags into "${item.tagTableName}" failed`, err);
        vscode.window.showErrorMessage(l10n.t('Import failed: {0}', err instanceof Error ? err.message : String(err)));
    }
}

// ─── UDT Export ──────────────────────────────────────────────────

async function doExportUdt(item: TiaTreeItem): Promise<void> {
    if (!item.deviceName) { return; }
    const udtName = item.label;

    const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(`${udtName}.xml`),
        filters: { 'XML files': ['xml'] },
    });
    if (!uri) { return; }

    try {
        await vscode.window.withProgress(
            { location: { viewId: 'tiaProjectExplorer' }, title: l10n.t('Exporting {0}...', udtName) },
            () => exportUdtXml(item.deviceName!, udtName, uri.fsPath)
        );
        vscode.window.showInformationMessage(l10n.t('UDT "{0}" exported to {1}', udtName, uri.fsPath));
        log(`Exported UDT "${udtName}" to ${uri.fsPath}`);
    } catch (err) {
        logError(`Export UDT "${udtName}" failed`, err);
        vscode.window.showErrorMessage(l10n.t('Export failed: {0}', err instanceof Error ? err.message : String(err)));
    }
}

// ─── UDT Import ──────────────────────────────────────────────────

async function doImportUdt(item: TiaTreeItem): Promise<void> {
    const deviceName = item.deviceName;
    if (!deviceName) { return; }

    const uris = await vscode.window.showOpenDialog({
        filters: { 'XML files': ['xml'] },
        canSelectMany: true,
        openLabel: l10n.t('Import'),
    });
    if (!uris || uris.length === 0) { return; }

    showOutput();
    let successCount = 0;

    for (const uri of uris) {
        const fileName = uri.fsPath.split(/[\\/]/).pop() || uri.fsPath;
        try {
            await vscode.window.withProgress(
                { location: { viewId: 'tiaProjectExplorer' }, title: l10n.t('Importing {0}...', fileName) },
                () => importUdtXml(deviceName, uri.fsPath)
            );
            log(`Imported UDT from ${fileName}`);
            successCount++;
        } catch (err) {
            logError(`Import UDT from ${fileName} failed`, err);
            vscode.window.showErrorMessage(l10n.t('Import failed for {0}: {1}', fileName, err instanceof Error ? err.message : String(err)));
        }
    }

    if (successCount > 0) {
        vscode.window.showInformationMessage(l10n.t('Imported {0} UDT(s) successfully.', successCount));
        vscode.commands.executeCommand('tiaConnect.refreshProject');
    }
}

// ─── Watch Table Export ──────────────────────────────────────────

async function doExportWatchTable(item: TiaTreeItem): Promise<void> {
    if (!item.deviceName || !item.watchTableName) { return; }

    const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(`${item.watchTableName}.xml`),
        filters: { 'XML files': ['xml'] },
    });
    if (!uri) { return; }

    try {
        await vscode.window.withProgress(
            { location: { viewId: 'tiaProjectExplorer' }, title: l10n.t('Exporting {0}...', item.watchTableName!) },
            () => exportWatchTableXml(item.deviceName!, item.watchTableName!, uri.fsPath)
        );
        vscode.window.showInformationMessage(l10n.t('Watch table "{0}" exported to {1}', item.watchTableName!, uri.fsPath));
        log(`Exported watch table "${item.watchTableName}" to ${uri.fsPath}`);
    } catch (err) {
        logError(`Export watch table "${item.watchTableName}" failed`, err);
        vscode.window.showErrorMessage(l10n.t('Export failed: {0}', err instanceof Error ? err.message : String(err)));
    }
}

// ─── Export All ──────────────────────────────────────────────────

async function doExportAll(item?: TiaTreeItem): Promise<void> {
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
                    { placeHolder: l10n.t('Select the device to export') }
                );
                if (!pick) { return; }
                deviceName = pick;
            }
        } catch (err) {
            logError('Failed to list devices for export', err);
            return;
        }
    }

    if (!deviceName) { return; }

    // Pick target folder
    const folders = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: l10n.t('Export here'),
    });
    if (!folders || folders.length === 0) { return; }

    const targetDir = folders[0].fsPath;
    showOutput();
    log(`--- Export All: ${deviceName} → ${targetDir} ---`);

    let exported = 0;
    let errors = 0;

    await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: l10n.t('Exporting {0}...', deviceName!), cancellable: false },
        async (progress) => {
            // 1. Tag tables → CSV
            progress.report({ message: l10n.t('Tag tables...') });
            try {
                const tables = await getTagTables(deviceName!);
                for (const t of tables) {
                    try {
                        await exportTagTableCsv(deviceName!, t.Name, `${targetDir}/${t.Name}.csv`);
                        log(`  Tag table "${t.Name}" → CSV`);
                        exported++;
                    } catch (err) {
                        logError(`  Tag table "${t.Name}" export failed`, err);
                        errors++;
                    }
                }
            } catch (err) {
                logError('  Failed to list tag tables', err);
            }

            // 2. UDTs → XML
            progress.report({ message: l10n.t('UDTs...') });
            try {
                const udts = await getUdts(deviceName!);
                for (const u of udts) {
                    try {
                        await exportUdtXml(deviceName!, u.Name, `${targetDir}/${u.Name}.xml`);
                        log(`  UDT "${u.Name}" → XML`);
                        exported++;
                    } catch (err) {
                        logError(`  UDT "${u.Name}" export failed`, err);
                        errors++;
                    }
                }
            } catch (err) {
                logError('  Failed to list UDTs', err);
            }

            // 3. Watch tables → XML
            progress.report({ message: l10n.t('Watch tables...') });
            try {
                const watches = await getWatchTables(deviceName!);
                for (const w of watches) {
                    try {
                        await exportWatchTableXml(deviceName!, w.Name, `${targetDir}/${w.Name}_watch.xml`);
                        log(`  Watch table "${w.Name}" → XML`);
                        exported++;
                    } catch (err) {
                        logError(`  Watch table "${w.Name}" export failed`, err);
                        errors++;
                    }
                }
            } catch (err) {
                logError('  Failed to list watch tables', err);
            }
        }
    );

    const msg = errors > 0
        ? l10n.t('Exported {0} item(s) with {1} error(s).', exported, errors)
        : l10n.t('Exported {0} item(s) successfully.', exported);
    log(`--- Export All complete: ${exported} exported, ${errors} errors ---`);
    vscode.window.showInformationMessage(msg);
}
