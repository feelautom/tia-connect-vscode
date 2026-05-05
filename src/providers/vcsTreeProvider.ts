import * as vscode from 'vscode';
import { l10n } from 'vscode';
import { vcsGetStatus, vcsExportPreview, vcsInit, vcsCommit } from '../api/sourceControl';
import { getLicenseFeatures } from '../api/project';
import { pollJob } from '../api/jobs';
import { VcsFileChange } from '../api/types';
import { VcsContentProvider, VCS_SCHEME } from './vcsContentProvider';
import { log, logError } from '../views/outputChannel';

type VcsTreeItem = VcsBranchItem | VcsFileItem | VcsActionItem;

class VcsBranchItem extends vscode.TreeItem {
    constructor(label: string, description?: string) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.description = description;
        this.iconPath = new vscode.ThemeIcon('git-branch');
        this.contextValue = 'vcsBranch';
    }
}

class VcsActionItem extends vscode.TreeItem {
    constructor(label: string, command: string, icon: string) {
        super(label, vscode.TreeItemCollapsibleState.None);
        this.iconPath = new vscode.ThemeIcon(icon);
        this.command = { command, title: label };
    }
}

class VcsFileItem extends vscode.TreeItem {
    constructor(public readonly change: VcsFileChange) {
        super(change.ItemName || change.FilePath, vscode.TreeItemCollapsibleState.None);
        this.description = change.Domain;
        this.tooltip = `${change.Status}: ${change.FilePath}`;
        this.contextValue = 'vcsFile';

        switch (change.Status) {
            case 'Added':
                this.iconPath = new vscode.ThemeIcon('diff-added');
                break;
            case 'Removed':
            case 'Deleted':
                this.iconPath = new vscode.ThemeIcon('diff-removed');
                break;
            default:
                this.iconPath = new vscode.ThemeIcon('diff-modified');
        }

        this.command = {
            command: 'tiaConnect.vcsDiffFile',
            title: 'Show Changes',
            arguments: [change],
        };
    }
}

export class VcsTreeProvider implements vscode.TreeDataProvider<VcsTreeItem>, vscode.Disposable {
    private _onDidChangeTreeData = new vscode.EventEmitter<VcsTreeItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private disposables: vscode.Disposable[] = [];
    private hasVcsLicense: boolean | null = null;
    private isInitialized = false;
    private changes: VcsFileChange[] = [];
    private lastCommitMessage = '';
    private lastCommitSha = '';
    private refreshTimer: NodeJS.Timeout | undefined;
    private autoExportTimer: NodeJS.Timeout | undefined;
    private isExporting = false;

    activate(context: vscode.ExtensionContext): void {
        const commands = [
            vscode.commands.registerCommand('tiaConnect.vcsTreeRefresh', () => this.refresh()),
            vscode.commands.registerCommand('tiaConnect.vcsExportPreview', () => this.exportPreview()),
            vscode.commands.registerCommand('tiaConnect.vcsTreeInit', () => this.init()),
            vscode.commands.registerCommand('tiaConnect.vcsTreeCommit', () => this.commit()),
        ];
        context.subscriptions.push(...commands);
        this.disposables.push(...commands);
    }

    getTreeItem(element: VcsTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: VcsTreeItem): VcsTreeItem[] {
        if (element) { return []; }

        if (this.hasVcsLicense === false) {
            const item = new VcsActionItem('Source Control not included in your license.', '', 'lock');
            item.command = undefined;
            return [item];
        }

        if (!this.isInitialized) {
            return [new VcsActionItem('Initialize VCS', 'tiaConnect.vcsTreeInit', 'repo')];
        }

        const items: VcsTreeItem[] = [];

        // Branch info
        if (this.lastCommitSha) {
            items.push(new VcsBranchItem(
                this.lastCommitSha.substring(0, 7),
                this.lastCommitMessage || 'No message'
            ));
        }

        // Export preview button
        items.push(new VcsActionItem('Export Preview (detect changes)', 'tiaConnect.vcsExportPreview', 'eye'));

        // Changed files
        if (this.changes.length > 0) {
            for (const change of this.changes) {
                items.push(new VcsFileItem(change));
            }
        }

        return items;
    }

    async refresh(): Promise<void> {
        // Check license on first refresh
        if (this.hasVcsLicense === null) {
            try {
                const license = await getLicenseFeatures();
                const features = (license as any).Features ?? [];
                this.hasVcsLicense = features.some((f: any) => f.Key === 'hasVcs' && f.Enabled);
            } catch {
                this.hasVcsLicense = false;
            }
        }

        if (!this.hasVcsLicense) {
            log('VCS feature not available in current license.');
            this._onDidChangeTreeData.fire(undefined);
            return;
        }

        try {
            const status = await vcsGetStatus();
            this.isInitialized = status.IsInitialized;
            this.changes = status.Changes || [];
            this.lastCommitSha = status.LastCommitSha || '';
            this.lastCommitMessage = status.LastCommitMessage || '';
        } catch (err) {
            logError('VCS tree refresh failed', err);
            this.isInitialized = false;
            this.changes = [];
        }
        this._onDidChangeTreeData.fire(undefined);
    }

    startAutoRefresh(intervalMs = 30000): void {
        this.stopAutoRefresh();
        this.refreshTimer = setInterval(() => this.refresh(), intervalMs);
    }

    stopAutoRefresh(): void {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = undefined;
        }
        if (this.autoExportTimer) {
            clearInterval(this.autoExportTimer);
            this.autoExportTimer = undefined;
        }
    }

    /** Starts periodic silent export (default: every 1 minute) */
    startAutoExport(intervalMs = 60000): void {
        // Initial export after a short delay (wait for refresh to load state)
        setTimeout(() => this.silentExportPreview(), 8000);
        // Then every minute
        this.autoExportTimer = setInterval(() => this.silentExportPreview(), intervalMs);
    }

    /** Export without notifications — just updates the tree silently */
    private async silentExportPreview(): Promise<void> {
        if (this.isExporting) { return; }

        // Ensure state is loaded
        if (this.hasVcsLicense === null) {
            await this.refresh();
        }
        if (!this.isInitialized || this.hasVcsLicense === false) {
            log('Auto export skipped: VCS not initialized or not licensed.');
            return;
        }

        this.isExporting = true;
        try {
            log('Auto export: starting...');
            const jobId = await vcsExportPreview();
            await pollJob(jobId, (s) => {
                log(`Auto export: ${s.Status}${s.Message ? ' - ' + s.Message : ''}`);
            });
            await this.refresh();
            log(`Auto export: done. ${this.changes.length} change(s) detected.`);
        } catch (err) {
            logError('Auto export failed', err);
        } finally {
            this.isExporting = false;
        }
    }

    private async init(): Promise<void> {
        try {
            await vcsInit();
            vscode.window.showInformationMessage(l10n.t('VCS repository initialized.'));
            await this.refresh();
        } catch (err) {
            logError('VCS init failed', err);
            vscode.window.showErrorMessage(l10n.t('VCS init failed: {0}', err instanceof Error ? err.message : String(err)));
        }
    }

    private async exportPreview(): Promise<void> {
        try {
            const jobId = await vcsExportPreview();

            await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: 'Exporting project...' },
                async () => {
                    const result = await pollJob(jobId, (s) => {
                        log(`Export preview: ${s.Status} - ${s.Message}`);
                    });
                    if (result.Status === 'Failed') {
                        throw new Error(result.Error || result.Message);
                    }
                }
            );

            await this.refresh();
            const count = this.changes.length;
            vscode.window.showInformationMessage(
                count > 0 ? l10n.t('{0} changed file(s) detected.', String(count)) : l10n.t('No changes detected.')
            );
        } catch (err) {
            logError('Export preview failed', err);
            vscode.window.showErrorMessage(l10n.t('Export preview failed: {0}', err instanceof Error ? err.message : String(err)));
        }
    }

    private async commit(): Promise<void> {
        const message = await vscode.window.showInputBox({
            prompt: 'Commit message',
            placeHolder: 'Describe your changes...',
        });
        if (!message) { return; }

        try {
            const jobId = await vcsCommit(message);

            await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: 'Committing...' },
                async () => {
                    const result = await pollJob(jobId, (s) => {
                        log(`Commit: ${s.Status} - ${s.Message}`);
                    });
                    if (result.Status === 'Failed') {
                        throw new Error(result.Error || result.Message);
                    }
                }
            );

            vscode.window.showInformationMessage(l10n.t('Committed: {0}', message));
            await this.refresh();
        } catch (err) {
            logError('VCS commit failed', err);
            vscode.window.showErrorMessage(l10n.t('Commit failed: {0}', err instanceof Error ? err.message : String(err)));
        }
    }

    dispose(): void {
        this.stopAutoRefresh();
        for (const d of this.disposables) { d.dispose(); }
        this._onDidChangeTreeData.dispose();
    }
}
