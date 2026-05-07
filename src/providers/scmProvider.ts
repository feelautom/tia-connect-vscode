import * as vscode from 'vscode';
import { l10n } from 'vscode';
import {
    vcsGetStatus, vcsCommit, vcsGetLog, vcsGetDiff,
    vcsListBranches, vcsCreateBranch, vcsCheckoutBranch,
    vcsDeleteBranch, vcsMerge, vcsPush, vcsPull, vcsInit,
    vcsListRemotes, vcsAddRemote, vcsRemoveRemote
} from '../api/sourceControl';
import { pollJob } from '../api/jobs';
import { VcsFileChange } from '../api/types';
import { log, logError } from '../views/outputChannel';
import { CONTEXT_KEYS, ORIGINAL_SCHEME } from '../utils/constants';
import { OriginalContentProvider } from './originalContentProvider';
import { VcsContentProvider, VCS_SCHEME } from './vcsContentProvider';

export class TiaSourceControl implements vscode.Disposable {
    private scm: vscode.SourceControl;
    private changesGroup: vscode.SourceControlResourceGroup;
    private disposables: vscode.Disposable[] = [];
    private refreshTimer: NodeJS.Timeout | undefined;
    readonly originalContentProvider: OriginalContentProvider;

    constructor() {
        this.scm = vscode.scm.createSourceControl('tiaConnect', 'T-IA Connect VCS');
        this.scm.inputBox.placeholder = 'Commit message (exports project + git commit)';
        this.scm.acceptInputCommand = {
            command: 'tiaConnect.vcsCommit',
            title: 'Commit',
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
            vscode.commands.registerCommand('tiaConnect.vcsCommit', () => this.commit()),
            vscode.commands.registerCommand('tiaConnect.vcsRefresh', () => this.refresh()),
            vscode.commands.registerCommand('tiaConnect.vcsInit', () => this.init()),
            vscode.commands.registerCommand('tiaConnect.vcsPush', () => this.push()),
            vscode.commands.registerCommand('tiaConnect.vcsPull', () => this.pull()),
            vscode.commands.registerCommand('tiaConnect.vcsBranch', () => this.branchMenu()),
            vscode.commands.registerCommand('tiaConnect.vcsLog', () => this.showLog()),
            vscode.commands.registerCommand('tiaConnect.vcsRemote', () => this.remoteMenu()),
            vscode.commands.registerCommand('tiaConnect.vcsDiffFile', (change: VcsFileChange) => this.diffFile(change)),
        ];

        context.subscriptions.push(...commands);
        this.disposables.push(...commands);
    }

    async refresh(): Promise<void> {
        try {
            const status = await vcsGetStatus();
            log(`VCS status: initialized=${status.IsInitialized}, changes=${status.ChangedFilesCount ?? 0}`);

            vscode.commands.executeCommand('setContext', CONTEXT_KEYS.vcsInitialized, status.IsInitialized);

            if (!status.IsInitialized) {
                this.changesGroup.resourceStates = [];
                this.scm.count = 0;
                vscode.commands.executeCommand('setContext', CONTEXT_KEYS.vcsHasRemote, false);
                this.scm.statusBarCommands = [{
                    command: 'tiaConnect.vcsInit',
                    title: '$(repo) Initialize VCS',
                    tooltip: 'Initialize source control for this project',
                }];
                return;
            }

            // Check if remotes are configured
            try {
                const remotes = await vcsListRemotes();
                vscode.commands.executeCommand('setContext', CONTEXT_KEYS.vcsHasRemote, remotes.length > 0);
            } catch {
                vscode.commands.executeCommand('setContext', CONTEXT_KEYS.vcsHasRemote, false);
            }

            this.changesGroup.resourceStates = (status.Changes || []).map(c => this.toResourceState(c));
            this.scm.count = status.ChangedFilesCount;

            const branchLabel = status.LastCommitSha
                ? `$(git-branch) ${status.LastCommitMessage || status.LastCommitSha.substring(0, 7)}`
                : '$(git-branch) No commits';

            this.scm.statusBarCommands = [
                { command: 'tiaConnect.vcsBranch', title: branchLabel, tooltip: 'Branch operations' },
                { command: 'tiaConnect.vcsPush', title: '$(cloud-upload)', tooltip: 'Push' },
                { command: 'tiaConnect.vcsPull', title: '$(cloud-download)', tooltip: 'Pull' },
            ];
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (/not connected|not available|aucun projet|no project/i.test(msg)) {
                // Silent — no project open
            } else {
                logError('VCS refresh failed', err);
            }
            vscode.commands.executeCommand('setContext', CONTEXT_KEYS.vcsInitialized, false);
            vscode.commands.executeCommand('setContext', CONTEXT_KEYS.vcsHasRemote, false);
        }
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
    }

    private async init(): Promise<void> {
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
        let message = this.scm.inputBox.value.trim();
        if (!message) {
            const input = await vscode.window.showInputBox({
                prompt: 'Commit message',
                placeHolder: 'Describe your changes...',
            });
            if (!input) { return; }
            message = input.trim();
        }
        if (!message) { return; }

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
                strikeThrough: change.Status === 'Removed',
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
            case 'Removed': return new vscode.ThemeIcon('diff-removed');
            case 'Renamed': return new vscode.ThemeIcon('diff-renamed');
            default: return new vscode.ThemeIcon('question');
        }
    }

    dispose(): void {
        this.stopAutoRefresh();
        for (const d of this.disposables) {
            d.dispose();
        }
    }
}
