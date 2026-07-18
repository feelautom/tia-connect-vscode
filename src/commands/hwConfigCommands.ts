/**
 * Hardware Configuration Commands — export/import HW config.
 */

import * as vscode from 'vscode';
import { l10n } from 'vscode';
import { TiaTreeItem } from '../providers/projectTreeProvider';
import { registerWorkspaceCommand } from '../security/workspaceTrust';
import { exportHardwareConfig, importHardwareConfig } from '../api/hardware';
import { log, logError } from '../views/outputChannel';

export function registerHwConfigCommands(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        registerWorkspaceCommand('tiaConnect.exportHwConfig', (item: TiaTreeItem) =>
            doExportHwConfig(item)),
        registerWorkspaceCommand('tiaConnect.importHwConfig', (item: TiaTreeItem) =>
            doImportHwConfig(item)),
    );
}

async function doExportHwConfig(item: TiaTreeItem): Promise<void> {
    const deviceName = item.deviceName;
    if (!deviceName) return;

    const uri = await vscode.window.showSaveDialog({
        defaultUri: vscode.Uri.file(`${deviceName}_hardware.xml`),
        filters: { 'XML files': ['xml'] },
    });
    if (!uri) return;

    try {
        await vscode.window.withProgress(
            { location: { viewId: 'tiaProjectExplorer' }, title: l10n.t('Exporting hardware config...') },
            () => exportHardwareConfig(deviceName, uri.fsPath)
        );
        vscode.window.showInformationMessage(l10n.t('Hardware config exported to {0}', uri.fsPath));
        log(`Exported HW config for "${deviceName}" to ${uri.fsPath}`);
    } catch (err) {
        logError(`Export HW config for "${deviceName}" failed`, err);
        vscode.window.showErrorMessage(l10n.t('Export failed: {0}', err instanceof Error ? err.message : String(err)));
    }
}

async function doImportHwConfig(item: TiaTreeItem): Promise<void> {
    const deviceName = item.deviceName;
    if (!deviceName) return;

    const uris = await vscode.window.showOpenDialog({
        filters: { 'XML files': ['xml'] },
        openLabel: l10n.t('Import'),
    });
    if (!uris || uris.length === 0) return;

    try {
        await vscode.window.withProgress(
            { location: { viewId: 'tiaProjectExplorer' }, title: l10n.t('Importing hardware config...') },
            () => importHardwareConfig(deviceName, uris[0].fsPath)
        );
        vscode.window.showInformationMessage(l10n.t('Hardware config imported successfully.'));
        log(`Imported HW config for "${deviceName}" from ${uris[0].fsPath}`);
        vscode.commands.executeCommand('tiaConnect.refreshProject');
    } catch (err) {
        logError(`Import HW config for "${deviceName}" failed`, err);
        vscode.window.showErrorMessage(l10n.t('Import failed: {0}', err instanceof Error ? err.message : String(err)));
    }
}
