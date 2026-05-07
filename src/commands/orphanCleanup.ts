/**
 * Orphan Cleanup — detect elements in TIA Portal that don't exist locally
 * (in the VCS export) and offer to delete them.
 */

import * as vscode from 'vscode';
import { vcsGetStatus } from '../api/sourceControl';
import { getProjectOverview } from '../api/project';
import { VcsFileChange } from '../api/types';
import { log } from '../views/outputChannel';

export interface OrphanItem {
    name: string;
    type: string;
    domain: string;
    deviceName: string;
}

/**
 * Detect orphaned items: elements in TIA Portal that exist in the project
 * but were NOT exported to the VCS repository.
 *
 * After a VCS export, items with status "Removed" or "Deleted" in the VCS
 * status indicate they exist locally but not in TIA Portal.
 * Conversely, items that exist in TIA Portal but not in the VCS export
 * are "orphans" — they may have been deleted from source control
 * but still linger in TIA Portal.
 */
export function findOrphans(
    tiaBlocks: string[],
    vcsExportedBlocks: string[],
): OrphanItem[] {
    const exportedSet = new Set(vcsExportedBlocks.map(n => n.toLowerCase()));
    const orphans: OrphanItem[] = [];

    for (const block of tiaBlocks) {
        if (!exportedSet.has(block.toLowerCase())) {
            orphans.push({
                name: block,
                type: 'Block',
                domain: 'Blocks',
                deviceName: '',
            });
        }
    }

    return orphans;
}

/**
 * Find items that exist in VCS but not in TIA Portal.
 * These are "stale" entries — deleted from TIA Portal but still tracked.
 */
export function findStaleVcsEntries(
    vcsChanges: VcsFileChange[],
): OrphanItem[] {
    return vcsChanges
        .filter(c => c.Status === 'Removed' || c.Status === 'Deleted')
        .map(c => ({
            name: c.ItemName || c.FilePath,
            type: c.Domain,
            domain: c.Domain,
            deviceName: c.DeviceName,
        }));
}

/**
 * Register orphan cleanup commands.
 */
export function registerOrphanCleanupCommands(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('tiaConnect.detectOrphans', async () => {
            await detectOrphansCommand();
        })
    );
}

async function detectOrphansCommand(): Promise<void> {
    try {
        const overview = await getProjectOverview();
        if (!overview?.Devices?.length) {
            vscode.window.showWarningMessage(
                vscode.l10n.t('No devices found in the project.')
            );
            return;
        }

        const status = await vcsGetStatus();
        if (!status.IsInitialized) {
            vscode.window.showWarningMessage(
                vscode.l10n.t('VCS not initialized. Initialize the repository first.')
            );
            return;
        }

        // Find stale VCS entries (removed from TIA, still tracked in VCS)
        const stale = findStaleVcsEntries(status.Changes);

        if (stale.length === 0) {
            vscode.window.showInformationMessage(
                vscode.l10n.t('No orphaned elements detected.')
            );
            return;
        }

        // Show QuickPick with orphan items
        const items = stale.map(o => ({
            label: `$(warning) ${o.name}`,
            description: `${o.domain} — ${o.deviceName}`,
            detail: vscode.l10n.t('This element was removed from TIA Portal but still exists in source control.'),
            orphan: o,
            picked: true,
        }));

        const selected = await vscode.window.showQuickPick(items, {
            title: vscode.l10n.t('Orphaned Elements'),
            placeHolder: vscode.l10n.t('Select elements to acknowledge (they will be cleaned up on next commit)'),
            canPickMany: true,
        });

        if (!selected || selected.length === 0) return;

        log(`[Orphan Cleanup] ${selected.length} orphaned element(s) acknowledged by user.`);
        vscode.window.showInformationMessage(
            vscode.l10n.t('{0} orphaned element(s) will be cleaned up on next VCS commit.', selected.length)
        );
    } catch (err: any) {
        log(`[Orphan Cleanup] Error: ${err.message}`);
        vscode.window.showErrorMessage(
            vscode.l10n.t('Orphan detection failed: {0}', err.message)
        );
    }
}
