/**
 * HMI Commands — export/import HMI screens, tags, connections.
 */

import * as vscode from 'vscode';
import { l10n } from 'vscode';
import { TiaTreeItem } from '../providers/projectTreeProvider';
import {
    getHmiScreens, exportHmiScreen, importHmiScreen,
    exportHmiTags, importHmiTags,
    exportHmiConnections, importHmiConnections,
} from '../api/hmi';
import { log, logError, showOutput } from '../views/outputChannel';

export function registerHmiCommands(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('tiaConnect.exportHmiScreen', (item: TiaTreeItem) =>
            doExportHmiScreen(item)),
        vscode.commands.registerCommand('tiaConnect.importHmiScreen', (item: TiaTreeItem) =>
            doImportHmiScreen(item)),
        vscode.commands.registerCommand('tiaConnect.exportHmiAll', (item: TiaTreeItem) =>
            doExportHmiAll(item)),
        vscode.commands.registerCommand('tiaConnect.importHmiAll', (item: TiaTreeItem) =>
            doImportHmiAll(item)),
    );
}

async function doExportHmiScreen(item: TiaTreeItem): Promise<void> {
    const deviceName = item.deviceName;
    if (!deviceName) return;

    const screens = await getHmiScreens(deviceName);
    if (screens.length === 0) {
        vscode.window.showInformationMessage(l10n.t('No HMI screens found.'));
        return;
    }

    const pick = await vscode.window.showQuickPick(
        screens.map(s => s.Name),
        { placeHolder: l10n.t('Select HMI screen to export') }
    );
    if (!pick) return;

    const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(`${pick}.xml`),
        filters: { 'XML files': ['xml'] },
    });
    if (!uri) return;

    try {
        await vscode.window.withProgress(
            { location: { viewId: 'tiaProjectExplorer' }, title: l10n.t('Exporting {0}...', pick) },
            () => exportHmiScreen(deviceName, pick, uri.fsPath)
        );
        vscode.window.showInformationMessage(l10n.t('HMI screen "{0}" exported.', pick));
        log(`Exported HMI screen "${pick}" to ${uri.fsPath}`);
    } catch (err) {
        logError(`Export HMI screen "${pick}" failed`, err);
        vscode.window.showErrorMessage(l10n.t('Export failed: {0}', err instanceof Error ? err.message : String(err)));
    }
}

async function doImportHmiScreen(item: TiaTreeItem): Promise<void> {
    const deviceName = item.deviceName;
    if (!deviceName) return;

    const uris = await vscode.window.showOpenDialog({
        filters: { 'XML files': ['xml'] },
        canSelectMany: true,
        openLabel: l10n.t('Import'),
    });
    if (!uris || uris.length === 0) return;

    showOutput();
    let success = 0;
    for (const uri of uris) {
        const fileName = uri.fsPath.split(/[\\/]/).pop() || uri.fsPath;
        try {
            await importHmiScreen(deviceName, uri.fsPath);
            log(`Imported HMI screen from ${fileName}`);
            success++;
        } catch (err) {
            logError(`Import HMI screen from ${fileName} failed`, err);
            vscode.window.showErrorMessage(l10n.t('Import failed for {0}: {1}', fileName, err instanceof Error ? err.message : String(err)));
        }
    }

    if (success > 0) {
        vscode.window.showInformationMessage(l10n.t('Imported {0} HMI screen(s).', success));
        vscode.commands.executeCommand('tiaConnect.refreshProject');
    }
}

async function doExportHmiAll(item: TiaTreeItem): Promise<void> {
    const deviceName = item.deviceName;
    if (!deviceName) return;

    const folders = await vscode.window.showOpenDialog({
        canSelectFiles: false,
        canSelectFolders: true,
        canSelectMany: false,
        openLabel: l10n.t('Export here'),
    });
    if (!folders || folders.length === 0) return;

    const targetDir = folders[0].fsPath;
    showOutput();
    log(`--- Export HMI All: ${deviceName} → ${targetDir} ---`);

    let exported = 0;
    let errors = 0;

    await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: l10n.t('Exporting HMI...'), cancellable: false },
        async (progress) => {
            // Screens
            progress.report({ message: l10n.t('Screens...') });
            try {
                const screens = await getHmiScreens(deviceName);
                for (const s of screens) {
                    try {
                        await exportHmiScreen(deviceName, s.Name, `${targetDir}/${s.Name}.xml`);
                        log(`  Screen "${s.Name}" → XML`);
                        exported++;
                    } catch (err) {
                        logError(`  Screen "${s.Name}" export failed`, err);
                        errors++;
                    }
                }
            } catch (err) {
                logError('  Failed to list HMI screens', err);
            }

            // Tags
            progress.report({ message: l10n.t('HMI Tags...') });
            try {
                await exportHmiTags(deviceName, `${targetDir}/hmi_tags.xml`);
                log('  HMI tags → XML');
                exported++;
            } catch (err) {
                logError('  HMI tags export failed', err);
                errors++;
            }

            // Connections
            progress.report({ message: l10n.t('HMI Connections...') });
            try {
                await exportHmiConnections(deviceName, `${targetDir}/hmi_connections.xml`);
                log('  HMI connections → XML');
                exported++;
            } catch (err) {
                logError('  HMI connections export failed', err);
                errors++;
            }
        }
    );

    const msg = errors > 0
        ? l10n.t('Exported {0} HMI item(s) with {1} error(s).', exported, errors)
        : l10n.t('Exported {0} HMI item(s) successfully.', exported);
    log(`--- Export HMI All complete: ${exported} exported, ${errors} errors ---`);
    vscode.window.showInformationMessage(msg);
}

async function doImportHmiAll(item: TiaTreeItem): Promise<void> {
    const deviceName = item.deviceName;
    if (!deviceName) return;

    const uris = await vscode.window.showOpenDialog({
        filters: { 'XML files': ['xml'] },
        canSelectMany: true,
        openLabel: l10n.t('Import HMI files'),
    });
    if (!uris || uris.length === 0) return;

    showOutput();
    let success = 0;
    for (const uri of uris) {
        const fileName = uri.fsPath.split(/[\\/]/).pop() || uri.fsPath;
        try {
            await importHmiScreen(deviceName, uri.fsPath);
            log(`Imported HMI file: ${fileName}`);
            success++;
        } catch (err) {
            logError(`Import HMI file "${fileName}" failed`, err);
        }
    }

    if (success > 0) {
        vscode.window.showInformationMessage(l10n.t('Imported {0} HMI file(s).', success));
        vscode.commands.executeCommand('tiaConnect.refreshProject');
    }
}
