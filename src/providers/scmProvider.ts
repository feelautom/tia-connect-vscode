import * as vscode from 'vscode';
import { registerWorkspaceCommand } from '../security/workspaceTrust';
import { l10n } from 'vscode';
import {
    vcsGetStatus, vcsCommit, vcsGetLog, vcsGetDiff,
    vcsListBranches, vcsCreateBranch, vcsCheckoutBranch,
    vcsDeleteBranch, vcsMerge, vcsPush, vcsPull, vcsInit,
    vcsListRemotes, vcsAddRemote, vcsRemoveRemote, vcsExportPreview
} from '../api/sourceControl';
import { isJobPollingCancellationError, pollJob } from '../api/jobs';
import { getLicenseFeatures } from '../api/project';
import { VcsFileChange } from '../api/types';
import { log, logError } from '../views/outputChannel';
import { CONTEXT_KEYS } from '../utils/constants';
import { OriginalContentProvider } from './originalContentProvider';
import { VcsContentProvider } from './vcsContentProvider';

export class TiaSourceControl implements vscode.Disposable {
    private scm: vscode.SourceControl;
    private changesGroup: vscode.SourceControlResourceGroup;
    private disposables: vscode.Disposable[] = [];
    private refreshTimer: NodeJS.Timeout | undefined;
    private autoExportTimer: NodeJS.Timeout | undefined;
    private initialAutoExportTimer: NodeJS.Timeout | undefined;
    private exportCancellation: vscode.CancellationTokenSource | undefined;
    private lifecycleGeneration = 0;
    private monitoring = false;
    private isExporting = false;
    private isInitialized = false;
    private hasVcsLicense: boolean | null = null;
    private licenseCheckFailed = false;
    readonly originalContentProvider: OriginalContentProvider;

    constructor() {
        this.scm = vscode.scm.createSourceControl('tiaConnect', 'T-IA Connect VCS');
        this.scm.inputBox.placeholder = l10n.t('Connect to T-IA Connect to use Source Control.');
        this.scm.inputBox.enabled = false;
        this.scm.acceptInputCommand = {
            command: 'tiaConnect.vcsCommit',
            title: l10n.t('Commit'),
        };

        // QuickDiff: provides gutter decorations (green/red/blue bars)
        this.originalContentProvider = new OriginalContentProvider();
        this.scm.quickDiffProvider = {
            provideOriginalResource: (uri: vscode.Uri): vscode.Uri | undefined => {
                if (this.originalContentProvider.hasOriginal(uri.fsPath)) {
                    return OriginalContentProvider.toOriginalUri(uri.fsPath);
                }
                return undefined;
            },
        };

        this.changesGroup = this.scm.createResourceGroup('changes', 'Changes');
        this.changesGroup.hideWhenEmpty = true;

        this.disposables.push(this.scm);
    }

    activate(context: vscode.ExtensionContext): void {
        const commands = [
            registerWorkspaceCommand('tiaConnect.vcsCommit', () => this.commit()),
            registerWorkspaceCommand('tiaConnect.vcsRefresh', () => this.refresh()),
            registerWorkspaceCommand('tiaConnect.vcsInit', () => this.init()),
            registerWorkspaceCommand('tiaConnect.vcsPush', () => this.push()),
            registerWorkspaceCommand('tiaConnect.vcsPull', () => this.pull()),
            registerWorkspaceCommand('tiaConnect.vcsBranch', () => this.branchMenu()),
            registerWorkspaceCommand('tiaConnect.vcsLog', () => this.showLog()),
            registerWorkspaceCommand('tiaConnect.vcsRemote', () => this.remoteMenu()),
            registerWorkspaceCommand('tiaConnect.vcsDiffFile', (change: VcsFileChange) => this.diffFile(change)),
            registerWorkspaceCommand('tiaConnect.vcsExportPreview', () => this.exportPreview()),
            registerWorkspaceCommand('tiaConnect.vcsLicenseInfo', () => this.showLicenseInfo()),
        ];

        context.subscriptions.push(...commands);
        this.disposables.push(...commands);
    }

    async refresh(expectedGeneration = this.lifecycleGeneration): Promise<void> {
        if (!this.monitoring || expectedGeneration !== this.lifecycleGeneration) { return; }
        if (!await this.ensureVcsLicensed(expectedGeneration)) { return; }

        try {
            const status = await vcsGetStatus();
            if (!this.isCurrentGeneration(expectedGeneration)) { return; }

            this.isInitialized = status.IsInitialized;
            log(`VCS status: initialized=${status.IsInitialized}, changes=${status.ChangedFilesCount ?? 0}`);
            void vscode.commands.executeCommand('setContext', CONTEXT_KEYS.vcsInitialized, status.IsInitialized);

            if (!status.IsInitialized) {
                this.applyNotInitializedState();
                return;
            }

            let hasRemote = false;
            try {
                const remotes = await vcsListRemotes();
                if (!this.isCurrentGeneration(expectedGeneration)) { return; }
                hasRemote = remotes.length > 0;
            } catch {
                // Remote discovery is secondary to the main status refresh.
            }
            void vscode.commands.executeCommand('setContext', CONTEXT_KEYS.vcsHasRemote, hasRemote);

            const changes = status.Changes || [];
            this.changesGroup.resourceStates = changes.map(change => this.toResourceState(change));
            this.scm.count = status.ChangedFilesCount ?? changes.length;
            this.scm.inputBox.enabled = true;
            this.scm.inputBox.placeholder = l10n.t('Commit message (exports project and creates a Git commit)');

            const branchLabel = status.LastCommitSha
                ? `$(git-branch) ${status.LastCommitMessage || status.LastCommitSha.substring(0, 7)}`
                : `$(git-branch) ${l10n.t('No commits')}`;

            this.scm.statusBarCommands = [
                { command: 'tiaConnect.vcsBranch', title: branchLabel, tooltip: l10n.t('Branch operations') },
                { command: 'tiaConnect.vcsPush', title: '$(cloud-upload)', tooltip: l10n.t('Push') },
                { command: 'tiaConnect.vcsPull', title: '$(cloud-download)', tooltip: l10n.t('Pull') },
            ];
        } catch (err) {
            if (!this.isCurrentGeneration(expectedGeneration)) { return; }
            const msg = err instanceof Error ? err.message : String(err);
            if (!/not connected|not available|aucun projet|no project/i.test(msg)) {
                logError('VCS refresh failed', err);
            }
            this.applyProjectUnavailableState();
        }
    }

    startMonitoring(refreshIntervalMs = 30000, autoExportIntervalMs = 60000, initialExportDelayMs = 8000): void {
        this.stopMonitoring();
        this.monitoring = true;
        const generation = this.lifecycleGeneration;

        void this.refresh(generation);
        this.refreshTimer = setInterval(() => void this.refresh(generation), refreshIntervalMs);
        this.initialAutoExportTimer = setTimeout(
            () => void this.silentExportPreview(generation),
            initialExportDelayMs,
        );
        this.autoExportTimer = setInterval(
            () => void this.silentExportPreview(generation),
            autoExportIntervalMs,
        );
    }

    stopMonitoring(): void {
        this.monitoring = false;
        this.lifecycleGeneration++;
        this.clearMonitoringTimers();
        this.exportCancellation?.cancel();
        this.exportCancellation?.dispose();
        this.exportCancellation = undefined;
        this.isExporting = false;
        this.hasVcsLicense = null;
        this.licenseCheckFailed = false;
        this.isInitialized = false;
        this.applyDisconnectedState();
    }

    private async ensureVcsLicensed(expectedGeneration = this.lifecycleGeneration): Promise<boolean> {
        if (!this.isCurrentGeneration(expectedGeneration)) { return false; }
        if (this.hasVcsLicense !== null) { return this.hasVcsLicense; }

        try {
            const license = await getLicenseFeatures();
            if (!this.isCurrentGeneration(expectedGeneration)) { return false; }
            this.hasVcsLicense = license.Features?.some(
                feature => feature.Key === 'hasVcs' && feature.Enabled === true,
            ) === true;
            this.licenseCheckFailed = false;
        } catch {
            if (!this.isCurrentGeneration(expectedGeneration)) { return false; }
            this.hasVcsLicense = null;
            this.licenseCheckFailed = true;
        }

        void vscode.commands.executeCommand('setContext', CONTEXT_KEYS.hasVcs, this.hasVcsLicense === true);
        if (this.hasVcsLicense !== true) {
            const message = this.currentLicenseMessage();
            this.applyUnavailableState(message);
            log(message);
        }
        return this.hasVcsLicense === true;
    }

    private async ensureVcsReady(): Promise<boolean> {
        if (!this.monitoring) {
            vscode.window.showWarningMessage(l10n.t('Connect to T-IA Connect to use Source Control.'));
            return false;
        }
        if (!await this.ensureVcsLicensed()) {
            vscode.window.showWarningMessage(this.currentLicenseMessage());
            return false;
        }
        return true;
    }

    private async exportPreview(): Promise<void> {
        if (!await this.ensureVcsReady()) { return; }
        if (!this.isInitialized) {
            vscode.window.showWarningMessage(l10n.t('VCS not initialized. Initialize the repository first.'));
            return;
        }
        if (this.isExporting) {
            vscode.window.showInformationMessage(l10n.t('A VCS export is already in progress.'));
            return;
        }

        const generation = this.lifecycleGeneration;
        this.isExporting = true;
        const cancellation = new vscode.CancellationTokenSource();
        this.exportCancellation = cancellation;
        try {
            const jobId = await vcsExportPreview();
            const result = await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: l10n.t('Exporting project...') },
                () => pollJob(
                    jobId,
                    status => log(`Export preview: ${status.Status}${status.Message ? ` - ${status.Message}` : ''}`),
                    undefined,
                    undefined,
                    cancellation.token,
                ),
            );
            if (result.Status === 'Failed') {
                throw new Error(result.Error || result.Message);
            }
            if (!this.isCurrentGeneration(generation)) { return; }
            await this.refresh(generation);
            const count = this.changesGroup.resourceStates.length;
            vscode.window.showInformationMessage(
                count > 0 ? l10n.t('{0} changed file(s) detected.', String(count)) : l10n.t('No changes detected.'),
            );
        } catch (err) {
            if (!isJobPollingCancellationError(err)) {
                logError('Export preview failed', err);
                vscode.window.showErrorMessage(l10n.t('Export preview failed: {0}', err instanceof Error ? err.message : String(err)));
            }
        } finally {
            cancellation.dispose();
            if (this.exportCancellation === cancellation) {
                this.exportCancellation = undefined;
                this.isExporting = false;
            }
        }
    }

    private async silentExportPreview(expectedGeneration: number): Promise<void> {
        if (!this.isCurrentGeneration(expectedGeneration) || this.isExporting) { return; }
        if (!await this.ensureVcsLicensed(expectedGeneration) || !this.isInitialized) { return; }

        this.isExporting = true;
        const cancellation = new vscode.CancellationTokenSource();
        this.exportCancellation = cancellation;
        try {
            log('Auto export: starting...');
            const jobId = await vcsExportPreview();
            const result = await pollJob(
                jobId,
                status => log(`Auto export: ${status.Status}${status.Message ? ` - ${status.Message}` : ''}`),
                undefined,
                undefined,
                cancellation.token,
            );
            if (result.Status === 'Failed') {
                throw new Error(result.Error || result.Message);
            }
            if (!this.isCurrentGeneration(expectedGeneration)) { return; }
            await this.refresh(expectedGeneration);
            log(`Auto export: done. ${this.changesGroup.resourceStates.length} change(s) detected.`);
        } catch (err) {
            if (!isJobPollingCancellationError(err)) {
                logError('Auto export failed', err);
            }
        } finally {
            cancellation.dispose();
            if (this.exportCancellation === cancellation) {
                this.exportCancellation = undefined;
                this.isExporting = false;
            }
        }
    }

    private showLicenseInfo(): void {
        vscode.window.showWarningMessage(this.currentLicenseMessage());
    }

    private currentLicenseMessage(): string {
        return this.licenseCheckFailed
            ? l10n.t('The Source Control license could not be verified.')
            : l10n.t('Source Control is not included in the current license.');
    }

    private applyDisconnectedState(): void {
        this.changesGroup.resourceStates = [];
        this.scm.count = 0;
        this.scm.inputBox.enabled = false;
        this.scm.inputBox.value = '';
        this.scm.inputBox.placeholder = l10n.t('Connect to T-IA Connect to use Source Control.');
        this.scm.statusBarCommands = [];
        void vscode.commands.executeCommand('setContext', CONTEXT_KEYS.hasVcs, false);
        void vscode.commands.executeCommand('setContext', CONTEXT_KEYS.vcsInitialized, false);
        void vscode.commands.executeCommand('setContext', CONTEXT_KEYS.vcsHasRemote, false);
    }

    private applyUnavailableState(message: string): void {
        this.isInitialized = false;
        this.changesGroup.resourceStates = [];
        this.scm.count = 0;
        this.scm.inputBox.enabled = false;
        this.scm.inputBox.value = '';
        this.scm.inputBox.placeholder = message;
        this.scm.statusBarCommands = [{
            command: 'tiaConnect.vcsLicenseInfo',
            title: '$(lock) T-IA VCS',
            tooltip: message,
        }];
        void vscode.commands.executeCommand('setContext', CONTEXT_KEYS.vcsInitialized, false);
        void vscode.commands.executeCommand('setContext', CONTEXT_KEYS.vcsHasRemote, false);
    }

    private applyProjectUnavailableState(): void {
        this.isInitialized = false;
        this.changesGroup.resourceStates = [];
        this.scm.count = 0;
        this.scm.inputBox.enabled = false;
        this.scm.inputBox.value = '';
        this.scm.inputBox.placeholder = l10n.t('Open a TIA Portal project to use Source Control.');
        this.scm.statusBarCommands = [];
        void vscode.commands.executeCommand('setContext', CONTEXT_KEYS.vcsInitialized, false);
        void vscode.commands.executeCommand('setContext', CONTEXT_KEYS.vcsHasRemote, false);
    }

    private applyNotInitializedState(): void {
        this.changesGroup.resourceStates = [];
        this.scm.count = 0;
        this.scm.inputBox.enabled = false;
        this.scm.inputBox.value = '';
        this.scm.inputBox.placeholder = l10n.t('Initialize the VCS repository before committing.');
        this.scm.statusBarCommands = [{
            command: 'tiaConnect.vcsInit',
            title: `$(repo) ${l10n.t('Initialize VCS')}`,
            tooltip: l10n.t('Initialize source control for this project'),
        }];
        void vscode.commands.executeCommand('setContext', CONTEXT_KEYS.vcsHasRemote, false);
    }

    private isCurrentGeneration(expectedGeneration: number): boolean {
        return this.monitoring && expectedGeneration === this.lifecycleGeneration;
    }

    private clearMonitoringTimers(): void {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = undefined;
        }
        if (this.autoExportTimer) {
            clearInterval(this.autoExportTimer);
            this.autoExportTimer = undefined;
        }
        if (this.initialAutoExportTimer) {
            clearTimeout(this.initialAutoExportTimer);
            this.initialAutoExportTimer = undefined;
        }
    }

    private async init(): Promise<void> {
        if (!await this.ensureVcsReady()) { return; }
        try {
            await vcsInit();
            vscode.window.showInformationMessage(l10n.t('VCS repository initialized.'));
            log('VCS initialized.');
            await this.refresh();
        } catch (err) {
            logError('VCS init failed', err);
            vscode.window.showErrorMessage(l10n.t('VCS init failed: {0}', err instanceof Error ? err.message : String(err)));
        }
    }

    private async commit(): Promise<void> {
        if (!await this.ensureVcsReady() || !this.isInitialized) { return; }
        let message = this.scm.inputBox.value;
        if (!message.trim()) {
            const input = await vscode.window.showInputBox({
                prompt: 'Commit message',
                placeHolder: 'Describe your changes...',
            });
            if (!input) { return; }
            message = input;
        }
        if (!message.trim()) { return; }

        try {
            const jobId = await vcsCommit(message);
            this.scm.inputBox.value = '';

            await vscode.window.withProgress(
                { location: vscode.ProgressLocation.SourceControl, title: 'Committing...' },
                async () => {
                    const result = await pollJob(jobId, (s) => {
                        log(`Commit job: ${s.Status} - ${s.Message}`);
                    });

                    if (result.Status === 'Failed') {
                        throw new Error(result.Error || result.Message);
                    }
                }
            );

            vscode.window.showInformationMessage(l10n.t('Committed: {0}', message));
            log(`Committed: ${message}`);
            await this.refresh();
        } catch (err) {
            logError('VCS commit failed', err);
            vscode.window.showErrorMessage(l10n.t('Commit failed: {0}', err instanceof Error ? err.message : String(err)));
        }
    }

    private async push(): Promise<void> {
        if (!await this.ensureVcsReady() || !this.isInitialized) { return; }
        try {
            const msg = await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: 'Pushing...' },
                () => vcsPush()
            );
            vscode.window.showInformationMessage(msg);
            log(`Push: ${msg}`);
        } catch (err) {
            logError('VCS push failed', err);
            vscode.window.showErrorMessage(l10n.t('Push failed: {0}', err instanceof Error ? err.message : String(err)));
        }
    }

    private async pull(): Promise<void> {
        if (!await this.ensureVcsReady() || !this.isInitialized) { return; }
        try {
            const msg = await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: 'Pulling...' },
                () => vcsPull()
            );
            vscode.window.showInformationMessage(msg);
            log(`Pull: ${msg}`);
            await this.refresh();
        } catch (err) {
            logError('VCS pull failed', err);
            vscode.window.showErrorMessage(l10n.t('Pull failed: {0}', err instanceof Error ? err.message : String(err)));
        }
    }

    private async branchMenu(): Promise<void> {
        if (!await this.ensureVcsReady() || !this.isInitialized) { return; }
        const pick = await vscode.window.showQuickPick(
            [l10n.t('Switch Branch'), l10n.t('Create Branch'), l10n.t('Delete Branch'), l10n.t('Merge Branch')],
            { placeHolder: l10n.t('Select branch operation') }
        );

        if (!pick) { return; }

        try {
            switch (pick) {
                case l10n.t('Switch Branch'): {
                    const branches = await vcsListBranches();
                    const selected = await vscode.window.showQuickPick(
                        branches.map(b => ({
                            label: b.Name,
                            description: b.IsCurrentBranch ? '(current)' : b.LastCommitSha?.substring(0, 7),
                            picked: b.IsCurrentBranch,
                        })),
                        { placeHolder: 'Select branch to switch to' }
                    );
                    if (selected) {
                        await vcsCheckoutBranch(selected.label);
                        vscode.window.showInformationMessage(l10n.t('Switched to {0}', selected.label));
                        await this.refresh();
                    }
                    break;
                }
                case l10n.t('Create Branch'): {
                    const name = await vscode.window.showInputBox({ prompt: 'Branch name' });
                    if (name) {
                        await vcsCreateBranch(name);
                        vscode.window.showInformationMessage(l10n.t("Branch '{0}' created.", name));
                        await this.refresh();
                    }
                    break;
                }
                case l10n.t('Delete Branch'): {
                    const branches = await vcsListBranches();
                    const nonCurrent = branches.filter(b => !b.IsCurrentBranch && !b.IsRemote);
                    const selected = await vscode.window.showQuickPick(
                        nonCurrent.map(b => ({ label: b.Name })),
                        { placeHolder: 'Select branch to delete' }
                    );
                    if (selected) {
                        await vcsDeleteBranch(selected.label);
                        vscode.window.showInformationMessage(l10n.t("Branch '{0}' deleted.", selected.label));
                        await this.refresh();
                    }
                    break;
                }
                case l10n.t('Merge Branch'): {
                    const branches = await vcsListBranches();
                    const nonCurrent = branches.filter(b => !b.IsCurrentBranch);
                    const selected = await vscode.window.showQuickPick(
                        nonCurrent.map(b => ({ label: b.Name })),
                        { placeHolder: 'Select branch to merge into current' }
                    );
                    if (selected) {
                        const msg = await vcsMerge(selected.label);
                        vscode.window.showInformationMessage(msg);
                        await this.refresh();
                    }
                    break;
                }
            }
        } catch (err) {
            logError('Branch operation failed', err);
            vscode.window.showErrorMessage(l10n.t('Branch operation failed: {0}', err instanceof Error ? err.message : String(err)));
        }
    }

    private async showLog(): Promise<void> {
        if (!await this.ensureVcsReady() || !this.isInitialized) { return; }
        try {
            const entries = await vcsGetLog(30);
            const selected = await vscode.window.showQuickPick(
                entries.map(e => ({
                    label: e.ShortSha,
                    description: e.Message,
                    detail: `${e.Author} - ${new Date(e.Timestamp).toLocaleString()} (${e.FilesChanged} files)`,
                    sha: e.Sha,
                })),
                { placeHolder: 'Commit history' }
            );

            if (selected) {
                // Show diff for this commit
                try {
                    const diff = await vcsGetDiff((selected as any).sha + '~1', (selected as any).sha);
                    const doc = await vscode.workspace.openTextDocument({
                        content: diff.Patch || 'No diff available.',
                        language: 'diff',
                    });
                    await vscode.window.showTextDocument(doc, { preview: true });
                } catch {
                    // First commit has no parent
                    vscode.window.showInformationMessage(`${selected.label}: ${selected.description}`);
                }
            }
        } catch (err) {
            logError('VCS log failed', err);
            vscode.window.showErrorMessage(l10n.t('Log failed: {0}', err instanceof Error ? err.message : String(err)));
        }
    }

    private async remoteMenu(): Promise<void> {
        if (!await this.ensureVcsReady() || !this.isInitialized) { return; }
        try {
            const remotes = await vcsListRemotes();

            const items: vscode.QuickPickItem[] = [
                { label: '$(add) Add Remote', description: 'Configure a new remote repository' },
            ];

            for (const r of remotes) {
                items.push({
                    label: `$(trash) Remove "${r.Name}"`,
                    description: r.Url,
                });
            }

            if (remotes.length > 0) {
                items.unshift({
                    label: '$(info) Current Remotes',
                    description: remotes.map(r => `${r.Name}: ${r.Url}`).join(', '),
                    kind: vscode.QuickPickItemKind.Separator,
                } as any);
            }

            const pick = await vscode.window.showQuickPick(items, { placeHolder: 'Remote operations' });
            if (!pick) { return; }

            if (pick.label.startsWith('$(add)')) {
                const name = await vscode.window.showInputBox({
                    prompt: 'Remote name',
                    value: 'origin',
                });
                if (!name) { return; }

                const url = await vscode.window.showInputBox({
                    prompt: 'Remote URL',
                    placeHolder: 'https://github.com/user/repo.git',
                });
                if (!url) { return; }

                await vcsAddRemote(name, url);
                vscode.window.showInformationMessage(l10n.t('Remote "{0}" added: {1}', name, url));
                log(`Remote added: ${name} → ${url}`);
                await this.refresh();
            } else if (pick.label.startsWith('$(trash)')) {
                const remoteName = pick.label.match(/Remove "(.+)"/)?.[1];
                if (remoteName) {
                    await vcsRemoveRemote(remoteName);
                    vscode.window.showInformationMessage(l10n.t('Remote "{0}" removed.', remoteName));
                    log(`Remote removed: ${remoteName}`);
                    await this.refresh();
                }
            }
        } catch (err) {
            logError('Remote operation failed', err);
            vscode.window.showErrorMessage(l10n.t('Remote operation failed: {0}', err instanceof Error ? err.message : String(err)));
        }
    }

    private async diffFile(change: VcsFileChange): Promise<void> {
        if (!await this.ensureVcsReady() || !this.isInitialized) { return; }
        try {
            const filePath = change.FilePath;
            const title = `${change.ItemName} (${change.Status})`;

            if (change.Status === 'Added') {
                // New file — show current working tree content
                const uri = VcsContentProvider.toUri('WORKING', filePath);
                const doc = await vscode.workspace.openTextDocument(uri);
                await vscode.window.showTextDocument(doc, { preview: true });
            } else if (change.Status === 'Removed' || change.Status === 'Deleted') {
                // Deleted file — show last committed content
                const uri = VcsContentProvider.toUri('HEAD', filePath);
                const doc = await vscode.workspace.openTextDocument(uri);
                await vscode.window.showTextDocument(doc, { preview: true });
            } else {
                // Modified/Renamed — side-by-side diff
                const leftUri = VcsContentProvider.toUri('HEAD', filePath);
                const rightUri = VcsContentProvider.toUri('WORKING', filePath);
                await vscode.commands.executeCommand('vscode.diff', leftUri, rightUri, title);
            }
        } catch (err) {
            logError('VCS diff failed', err);
            vscode.window.showErrorMessage(l10n.t('Diff failed: {0}', err instanceof Error ? err.message : String(err)));
        }
    }

    private toResourceState(change: VcsFileChange): vscode.SourceControlResourceState {
        const uri = vscode.Uri.parse(`tia-vcs:/${change.FilePath}`);
        return {
            resourceUri: uri,
            decorations: {
                strikeThrough: change.Status === 'Removed' || change.Status === 'Deleted',
                tooltip: `${change.Status}: ${change.Domain}/${change.ItemName}`,
                iconPath: this.getStatusIcon(change.Status),
            },
            command: {
                command: 'tiaConnect.vcsDiffFile',
                title: 'Show Changes',
                arguments: [change],
            },
        };
    }

    private getStatusIcon(status: string): vscode.ThemeIcon {
        switch (status) {
            case 'Added': return new vscode.ThemeIcon('diff-added');
            case 'Modified': return new vscode.ThemeIcon('diff-modified');
            case 'Removed':
            case 'Deleted': return new vscode.ThemeIcon('diff-removed');
            case 'Renamed': return new vscode.ThemeIcon('diff-renamed');
            default: return new vscode.ThemeIcon('question');
        }
    }

    dispose(): void {
        this.stopMonitoring();
        for (const d of this.disposables) {
            d.dispose();
        }
    }
}
