import * as vscode from 'vscode';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    getLicenseFeatures: vi.fn(),
    vcsGetStatus: vi.fn(),
    vcsCommit: vi.fn(),
    vcsGetLog: vi.fn(),
    vcsGetDiff: vi.fn(),
    vcsListBranches: vi.fn(),
    vcsCreateBranch: vi.fn(),
    vcsCheckoutBranch: vi.fn(),
    vcsDeleteBranch: vi.fn(),
    vcsMerge: vi.fn(),
    vcsPush: vi.fn(),
    vcsPull: vi.fn(),
    vcsInit: vi.fn(),
    vcsListRemotes: vi.fn(),
    vcsAddRemote: vi.fn(),
    vcsRemoveRemote: vi.fn(),
    vcsExportPreview: vi.fn(),
    pollJob: vi.fn(),
}));

vi.mock('../../src/api/project', () => ({ getLicenseFeatures: mocks.getLicenseFeatures }));
vi.mock('../../src/api/sourceControl', () => ({
    vcsGetStatus: mocks.vcsGetStatus,
    vcsCommit: mocks.vcsCommit,
    vcsGetLog: mocks.vcsGetLog,
    vcsGetDiff: mocks.vcsGetDiff,
    vcsListBranches: mocks.vcsListBranches,
    vcsCreateBranch: mocks.vcsCreateBranch,
    vcsCheckoutBranch: mocks.vcsCheckoutBranch,
    vcsDeleteBranch: mocks.vcsDeleteBranch,
    vcsMerge: mocks.vcsMerge,
    vcsPush: mocks.vcsPush,
    vcsPull: mocks.vcsPull,
    vcsInit: mocks.vcsInit,
    vcsListRemotes: mocks.vcsListRemotes,
    vcsAddRemote: mocks.vcsAddRemote,
    vcsRemoveRemote: mocks.vcsRemoveRemote,
    vcsExportPreview: mocks.vcsExportPreview,
}));
vi.mock('../../src/api/jobs', () => ({
    pollJob: mocks.pollJob,
    isJobPollingCancellationError: (error: unknown) => error instanceof Error && error.name === 'JobPollingCancelledError',
}));
vi.mock('../../src/views/outputChannel', () => ({ log: vi.fn(), logError: vi.fn() }));

import { TiaSourceControl } from '../../src/providers/scmProvider';

const initializedStatus = {
    IsInitialized: true,
    ChangedFilesCount: 1,
    Changes: [{
        FilePath: 'PLC_1/Program blocks/DB Café.xml',
        Status: 'Deleted',
        Domain: 'Blocks',
        DeviceName: 'PLC_1',
        ItemName: 'DB Café',
    }],
    LastCommitSha: '1234567890',
    LastCommitMessage: 'Initial',
};

function extensionContext(): any {
    return { subscriptions: [] };
}

async function settle(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
}

describe('TiaSourceControl', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
        (vscode.commands as any).reset();
        (vscode.scm as any).reset();
        (vscode.workspace as any).isTrusted = true;
        mocks.getLicenseFeatures.mockResolvedValue({ Features: [{ Key: 'hasVcs', Enabled: true }] });
        mocks.vcsGetStatus.mockResolvedValue(initializedStatus);
        mocks.vcsListRemotes.mockResolvedValue([{ Name: 'origin', Url: 'https://example.invalid/repo.git' }]);
        mocks.vcsCommit.mockResolvedValue('job-commit');
        mocks.vcsExportPreview.mockResolvedValue('job-export');
        mocks.pollJob.mockResolvedValue({ Status: 'Completed', Message: '' });
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('uses the native SCM model and maps Deleted changes as removed resources', async () => {
        const provider = new TiaSourceControl();
        provider.activate(extensionContext());

        provider.startMonitoring(30_000, 60_000, 8_000);
        await settle();

        const scm = (vscode.scm as any).created[0];
        expect(scm.inputBox.enabled).toBe(true);
        expect(scm.count).toBe(1);
        expect(scm.createResourceGroup).toBeDefined();
        const group = (provider as any).changesGroup;
        expect(group.resourceStates[0].resourceUri.path).toContain('DB Café.xml');
        expect(group.resourceStates[0].decorations.strikeThrough).toBe(true);
        expect(group.resourceStates[0].decorations.iconPath.id).toBe('diff-removed');
    });

    it('requires the exact hasVcs feature before calling VCS APIs', async () => {
        mocks.getLicenseFeatures.mockResolvedValue({ Features: [{ Key: 'HasVcs', Enabled: true }] });
        const provider = new TiaSourceControl();
        provider.activate(extensionContext());

        provider.startMonitoring();
        await settle();

        expect(mocks.vcsGetStatus).not.toHaveBeenCalled();
        expect(mocks.vcsExportPreview).not.toHaveBeenCalled();
        const hasVcsContext = (vscode.commands as any).executed.find(
            (entry: any) => entry.command === 'setContext' && entry.args[0] === 'tiaConnect.hasVcs',
        );
        expect(hasVcsContext?.args[1]).toBe(false);
    });

    it('stops refresh and auto-export timers when monitoring stops', async () => {
        const provider = new TiaSourceControl();
        provider.activate(extensionContext());
        provider.startMonitoring(100, 200, 50);
        await settle();
        mocks.vcsGetStatus.mockClear();

        provider.stopMonitoring();
        await vi.advanceTimersByTimeAsync(1_000);

        expect(mocks.vcsGetStatus).not.toHaveBeenCalled();
        expect(mocks.vcsExportPreview).not.toHaveBeenCalled();
    });

    it('preserves the exact commit message sent to the backend', async () => {
        const provider = new TiaSourceControl();
        provider.activate(extensionContext());
        provider.startMonitoring();
        await settle();
        const message = '  Réglage I\u0307stanbul  ';
        (vscode.scm as any).created[0].inputBox.value = message;

        await (vscode.commands as any).executeCommand('tiaConnect.vcsCommit');

        expect(mocks.vcsCommit).toHaveBeenCalledWith(message);
    });
});
