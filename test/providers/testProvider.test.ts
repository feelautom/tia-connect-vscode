import * as vscode from 'vscode';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    listTests: vi.fn(),
    getTest: vi.fn(),
    runTest: vi.fn(),
    pollJob: vi.fn(),
    getLicenseFeatures: vi.fn(),
    getPlcSimStatus: vi.fn(),
}));

vi.mock('../../src/api/testHarness', () => ({
    listTests: mocks.listTests,
    getTest: mocks.getTest,
    runTest: mocks.runTest,
}));
vi.mock('../../src/api/project', () => ({
    getLicenseFeatures: mocks.getLicenseFeatures,
    getPlcSimStatus: mocks.getPlcSimStatus,
}));
vi.mock('../../src/api/jobs', () => ({
    pollJob: mocks.pollJob,
    isJobPollingCancellationError: (error: unknown) => error instanceof Error && error.name === 'JobPollingCancelledError',
}));
vi.mock('../../src/views/outputChannel', () => ({ log: vi.fn(), logError: vi.fn() }));

import { createPlcTestItemId, TiaTestProvider } from '../../src/providers/testProvider';

function controller(): any {
    return (vscode.tests as any).createdControllers[0];
}

function items(collection: any): any[] {
    return [...collection.entries()].map(([, item]) => item);
}

function token(cancelled = false): any {
    return { isCancellationRequested: cancelled, onCancellationRequested: () => ({ dispose: () => {} }) };
}

async function discover(names = ['Motor test']): Promise<TiaTestProvider> {
    mocks.listTests.mockResolvedValue(names);
    const provider = new TiaTestProvider();
    await provider.discoverTests();
    return provider;
}

async function run(request: any, cancellationToken = token()): Promise<any> {
    await controller().profiles[0].handler(request, cancellationToken);
    return controller().runs.at(-1);
}

describe('TiaTestProvider', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (vscode.tests as any).reset();
        (vscode.workspace as any).isTrusted = true;
        mocks.getLicenseFeatures.mockResolvedValue({
            Features: [{ Key: 'hasTestHarness', Enabled: true }],
        });
        mocks.getPlcSimStatus.mockResolvedValue({ ApiAvailable: true });
        mocks.getTest.mockImplementation(async (name: string) => ({
            name,
            steps: [{ description: 'Write input' }, { description: 'Check output' }],
        }));
        mocks.runTest.mockResolvedValue('job-1');
        mocks.pollJob.mockResolvedValue({
            Status: 'Completed',
            Result: {
                Results: [{
                    TestName: 'Motor test',
                    Description: '',
                    Passed: true,
                    Steps: [
                        { StepIndex: 0, Description: 'Write input', Passed: true, Assertions: [] },
                        { StepIndex: 1, Description: 'Check output', Passed: true, Assertions: [] },
                    ],
                    StartedAt: '',
                    CompletedAt: '',
                    DurationMs: 42,
                }],
            },
        });
    });

    it('preserves exact test names while creating deterministic encoded item IDs', async () => {
        const names = ['Motor: Start', 'mOtOr é', 'I\u0307stanbul'];
        await discover(names);

        expect(items(controller().items).map(item => item.label)).toEqual(names);
        expect(items(controller().items).map(item => item.id)).toEqual(names.map(createPlcTestItemId));
    });

    it('connects the native Test Explorer refresh action to backend discovery', async () => {
        await discover();
        mocks.listTests.mockClear();

        await controller().refreshHandler();

        expect(mocks.listTests).toHaveBeenCalledOnce();
    });

    it('shows a native non-runnable status item when the license blocks Test Harness', async () => {
        mocks.getLicenseFeatures.mockResolvedValue({ Features: [] });
        await discover();

        const [status] = items(controller().items);
        expect(status.id).toBe('plc-status:license-required');
        expect(status.error).toContain('not included');
        expect(mocks.listTests).not.toHaveBeenCalled();
    });

    it('does not call industrial APIs when the workspace is in Restricted Mode', async () => {
        (vscode.workspace as any).isTrusted = false;
        await discover();

        const [status] = items(controller().items);
        expect(status.id).toBe('plc-status:workspace-untrusted');
        expect(mocks.getLicenseFeatures).not.toHaveBeenCalled();
        expect(mocks.getPlcSimStatus).not.toHaveBeenCalled();
        expect(mocks.listTests).not.toHaveBeenCalled();
    });

    it('shows PLCSim unavailability without attempting test discovery', async () => {
        mocks.getPlcSimStatus.mockResolvedValue({ ApiAvailable: false });
        await discover();

        const [status] = items(controller().items);
        expect(status.id).toBe('plc-status:plcsim-required');
        expect(mocks.listTests).not.toHaveBeenCalled();
    });

    it('runs a selected step as its exact parent backend test and maps step results', async () => {
        await discover(['Motor: Start']);
        const [parent] = items(controller().items);
        await controller().resolveHandler(parent);
        const [, selectedStep] = items(parent.children);

        const testRun = await run(new vscode.TestRunRequest([selectedStep]));

        expect(mocks.runTest).toHaveBeenCalledWith('Motor: Start');
        expect(mocks.pollJob.mock.calls[0][4]).toEqual(expect.objectContaining({ isCancellationRequested: false }));
        expect(testRun.events).toEqual(expect.arrayContaining([
            expect.objectContaining({ state: 'passed', item: parent, duration: 42 }),
            expect.objectContaining({ state: 'passed', item: selectedStep }),
        ]));
    });

    it('excludes the complete backend test when one of its steps is excluded', async () => {
        await discover();
        const [parent] = items(controller().items);
        await controller().resolveHandler(parent);
        const [excludedStep] = items(parent.children);

        await run(new vscode.TestRunRequest([parent], [excludedStep]));

        expect(mocks.runTest).not.toHaveBeenCalled();
    });

    it('maps failed assertions to the parent and native step result', async () => {
        mocks.pollJob.mockResolvedValue({
            Status: 'Completed',
            Result: {
                Results: [{
                    Passed: false,
                    Error: 'Sequence failed',
                    DurationMs: 15,
                    Steps: [{
                        StepIndex: 0,
                        Passed: false,
                        Assertions: [{
                            TagName: 'DB1.Speed',
                            Passed: false,
                            Message: 'Outside tolerance',
                            ExpectedValue: 100,
                            ActualValue: 80,
                        }],
                    }],
                }],
            },
        });
        await discover();
        const [parent] = items(controller().items);

        const testRun = await run(new vscode.TestRunRequest([parent]));
        const failures = testRun.events.filter((event: any) => event.state === 'failed');

        expect(failures).toHaveLength(2);
        expect(JSON.stringify(failures)).toContain('DB1.Speed');
        expect(JSON.stringify(failures)).toContain('Expected: 100');
    });

    it('marks the active and queued tests skipped when polling is cancelled', async () => {
        const cancellation = token(false);
        const error = new Error('cancelled');
        error.name = 'JobPollingCancelledError';
        mocks.pollJob.mockImplementation(async () => {
            cancellation.isCancellationRequested = true;
            throw error;
        });
        await discover(['First', 'Second']);
        const [first, second] = items(controller().items);

        const testRun = await run(new vscode.TestRunRequest([first, second]), cancellation);

        expect(mocks.runTest).toHaveBeenCalledTimes(1);
        expect(testRun.events).toEqual(expect.arrayContaining([
            expect.objectContaining({ state: 'skipped', item: first }),
            expect.objectContaining({ state: 'skipped', item: second }),
        ]));
    });
});
