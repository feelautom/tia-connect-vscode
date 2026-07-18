import * as vscode from 'vscode';
import { l10n } from 'vscode';
import { registerWorkspaceCommand, isWorkspaceTrusted } from '../security/workspaceTrust';
import { listTests, getTest, runTest } from '../api/testHarness';
import { getLicenseFeatures, getPlcSimStatus } from '../api/project';
import { isJobPollingCancellationError, pollJob } from '../api/jobs';
import { TestRunResult } from '../api/types';
import { log, logError } from '../views/outputChannel';

type TestItemMetadata =
    | { kind: 'test'; testName: string }
    | { kind: 'step'; testName: string; parent: vscode.TestItem; stepIndex: number }
    | { kind: 'status' };

type Availability =
    | { ready: true }
    | { ready: false; id: string; message: string; logMessage: string };

export function createPlcTestItemId(testName: string): string {
    return `plc-test:${encodeURIComponent(testName)}`;
}

export function createPlcTestStepItemId(testId: string, stepIndex: number): string {
    return `${testId}:step:${stepIndex}`;
}

export class TiaTestProvider implements vscode.Disposable {
    private readonly controller: vscode.TestController;
    private readonly metadata = new WeakMap<vscode.TestItem, TestItemMetadata>();
    private readonly disposables: vscode.Disposable[] = [];

    constructor() {
        this.controller = vscode.tests.createTestController('tiaPlcTests', l10n.t('PLC Tests'));
        this.disposables.push(this.controller.createRunProfile(
            l10n.t('Run PLC Tests'),
            vscode.TestRunProfileKind.Run,
            (request, token) => this.runHandler(request, token),
            true,
        ));

        this.controller.resolveHandler = async (item) => {
            if (item) {
                await this.resolveTestChildren(item);
            } else {
                await this.discoverTests();
            }
        };
        this.controller.refreshHandler = () => this.discoverTests();
    }

    activate(context: vscode.ExtensionContext): void {
        context.subscriptions.push(
            registerWorkspaceCommand('tiaConnect.testRefresh', () => this.discoverTests()),
            registerWorkspaceCommand('tiaConnect.testRunAll', () => this.runAll()),
        );
    }

    async discoverTests(): Promise<void> {
        const availability = await this.checkAvailability();
        if (!availability.ready) {
            this.showStatus(availability.id, availability.message, true);
            log(availability.logMessage);
            return;
        }

        try {
            const testNames = await listTests();
            this.controller.items.replace([]);

            if (testNames.length === 0) {
                this.showStatus(
                    'no-tests',
                    l10n.t('No PLC tests found. Create tests via MCP or the REST API.'),
                    false,
                );
                return;
            }

            for (const testName of testNames) {
                const item = this.controller.createTestItem(createPlcTestItemId(testName), testName);
                item.canResolveChildren = true;
                this.metadata.set(item, { kind: 'test', testName });
                this.controller.items.add(item);
            }

            log(`Discovered ${testNames.length} PLC test(s).`);
        } catch (error) {
            this.showStatus('discovery-error', l10n.t('PLC test discovery failed. See T-IA Connect output for details.'), true);
            logError('Test discovery failed', error);
        }
    }

    private async checkAvailability(): Promise<Availability> {
        if (!isWorkspaceTrusted()) {
            return {
                ready: false,
                id: 'workspace-untrusted',
                message: l10n.t('PLC tests are disabled in Restricted Mode. Trust this workspace to continue.'),
                logMessage: 'PLC tests unavailable: workspace is not trusted.',
            };
        }

        try {
            const license = await getLicenseFeatures();
            const enabled = license.Features?.some(feature => feature.Key === 'hasTestHarness' && feature.Enabled) === true;
            if (!enabled) {
                return {
                    ready: false,
                    id: 'license-required',
                    message: l10n.t('PLC Test Harness is not included in the current license.'),
                    logMessage: 'Test Harness feature not available in current license.',
                };
            }
        } catch (error) {
            logError('Test Harness license check failed', error);
            return {
                ready: false,
                id: 'license-check-error',
                message: l10n.t('The PLC Test Harness license could not be verified.'),
                logMessage: 'Test Harness license could not be verified.',
            };
        }

        try {
            const plcSim = await getPlcSimStatus();
            if (!plcSim.ApiAvailable) {
                return {
                    ready: false,
                    id: 'plcsim-required',
                    message: l10n.t('PLCSim Advanced is not installed, not running, or unavailable.'),
                    logMessage: 'PLCSim Advanced not available.',
                };
            }
        } catch (error) {
            logError('PLCSim Advanced availability check failed', error);
            return {
                ready: false,
                id: 'plcsim-check-error',
                message: l10n.t('PLCSim Advanced availability could not be verified.'),
                logMessage: 'PLCSim Advanced availability could not be verified.',
            };
        }

        return { ready: true };
    }

    private showStatus(id: string, message: string, isError: boolean): void {
        this.controller.items.replace([]);
        const item = this.controller.createTestItem(`plc-status:${id}`, message);
        item.canResolveChildren = false;
        if (isError) {
            item.error = message;
        }
        this.metadata.set(item, { kind: 'status' });
        this.controller.items.add(item);
    }

    private async resolveTestChildren(item: vscode.TestItem): Promise<void> {
        const metadata = this.metadata.get(item);
        if (metadata?.kind !== 'test') { return; }

        try {
            const testCase = await getTest(metadata.testName);
            item.children.replace([]);
            for (let index = 0; index < (testCase.steps?.length ?? 0); index++) {
                const step = testCase.steps[index];
                const stepItem = this.controller.createTestItem(
                    createPlcTestStepItemId(item.id, index),
                    step.description || l10n.t('Step {0}', index + 1),
                );
                this.metadata.set(stepItem, {
                    kind: 'step',
                    testName: metadata.testName,
                    parent: item,
                    stepIndex: index,
                });
                item.children.add(stepItem);
            }
        } catch (error) {
            item.error = l10n.t('Failed to load PLC test steps.');
            logError(`Failed to resolve PLC test steps for ${metadata.testName}`, error);
        }
    }

    private collectTests(request: vscode.TestRunRequest): vscode.TestItem[] {
        const selected = new Map<string, vscode.TestItem>();
        const addItem = (item: vscode.TestItem): void => {
            const metadata = this.metadata.get(item);
            if (metadata?.kind === 'test') {
                selected.set(item.id, item);
            } else if (metadata?.kind === 'step') {
                selected.set(metadata.parent.id, metadata.parent);
            }
        };

        if (request.include) {
            request.include.forEach(addItem);
        } else {
            this.controller.items.forEach(addItem);
        }

        request.exclude?.forEach(item => {
            const metadata = this.metadata.get(item);
            if (metadata?.kind === 'test') {
                selected.delete(item.id);
            } else if (metadata?.kind === 'step') {
                // The backend runs complete PLC tests, so excluding one step excludes its parent.
                selected.delete(metadata.parent.id);
            }
        });

        return [...selected.values()];
    }

    private async runHandler(request: vscode.TestRunRequest, token: vscode.CancellationToken): Promise<void> {
        const run = this.controller.createTestRun(request);
        const tests = this.collectTests(request);
        tests.forEach(item => run.enqueued(item));

        const availability = await this.checkAvailability();
        if (!availability.ready) {
            const message = new vscode.TestMessage(availability.message);
            tests.forEach(item => run.errored(item, message));
            log(availability.logMessage);
            run.end();
            return;
        }

        for (let index = 0; index < tests.length; index++) {
            const item = tests[index];
            if (token.isCancellationRequested) {
                tests.slice(index).forEach(pending => run.skipped(pending));
                break;
            }

            const metadata = this.metadata.get(item);
            if (metadata?.kind !== 'test') { continue; }

            await this.resolveTestChildren(item);
            run.started(item);
            item.children.forEach(step => run.started(step));

            try {
                const jobId = await runTest(metadata.testName);
                const job = await pollJob(jobId, undefined, undefined, undefined, token);

                if (job.Status === 'Failed') {
                    const message = new vscode.TestMessage(job.Error || l10n.t('PLC test execution failed.'));
                    run.errored(item, message);
                    item.children.forEach(step => run.errored(step, message));
                    continue;
                }

                const testResult = this.latestResult(job.Result);
                if (!testResult) {
                    const message = new vscode.TestMessage(l10n.t('No PLC test results were returned.'));
                    run.errored(item, message);
                    item.children.forEach(step => run.errored(step, message));
                    continue;
                }

                this.updateStepResults(run, item, testResult);
                if (testResult.Passed) {
                    run.passed(item, testResult.DurationMs);
                } else {
                    run.failed(item, this.failureMessages(testResult), testResult.DurationMs);
                }
            } catch (error) {
                if (isJobPollingCancellationError(error) || token.isCancellationRequested) {
                    run.skipped(item);
                    item.children.forEach(step => run.skipped(step));
                    tests.slice(index + 1).forEach(pending => run.skipped(pending));
                    break;
                }

                const message = new vscode.TestMessage(
                    error instanceof Error ? error.message : l10n.t('Unexpected PLC test execution error.'),
                );
                run.errored(item, message);
                item.children.forEach(step => run.errored(step, message));
                logError(`PLC test execution error for ${metadata.testName}`, error);
            }
        }

        run.end();
    }

    private latestResult(value: unknown): TestRunResult | undefined {
        if (!value || typeof value !== 'object') { return undefined; }
        const results = (value as { Results?: unknown }).Results;
        if (!Array.isArray(results) || results.length === 0) { return undefined; }
        const latest = results[results.length - 1];
        if (!latest || typeof latest !== 'object' || typeof (latest as TestRunResult).Passed !== 'boolean') {
            return undefined;
        }
        return latest as TestRunResult;
    }

    private failureMessages(result: TestRunResult): vscode.TestMessage[] {
        const messages: vscode.TestMessage[] = [];
        if (result.Error) { messages.push(new vscode.TestMessage(result.Error)); }

        for (const step of result.Steps ?? []) {
            for (const assertion of step.Assertions ?? []) {
                if (!assertion.Passed) {
                    messages.push(new vscode.TestMessage(l10n.t(
                        '{0}: {1}\nExpected: {2}\nActual: {3}',
                        assertion.TagName,
                        assertion.Message,
                        this.displayValue(assertion.ExpectedValue),
                        this.displayValue(assertion.ActualValue),
                    )));
                }
            }
        }

        return messages.length > 0
            ? messages
            : [new vscode.TestMessage(l10n.t('PLC test failed without additional details.'))];
    }

    private updateStepResults(run: vscode.TestRun, parent: vscode.TestItem, result: TestRunResult): void {
        const reported = new Set<number>();
        for (const step of result.Steps ?? []) {
            reported.add(step.StepIndex);
            const item = parent.children.get(createPlcTestStepItemId(parent.id, step.StepIndex));
            if (!item) { continue; }

            if (step.Passed) {
                run.passed(item);
            } else {
                const messages = (step.Assertions ?? [])
                    .filter(assertion => !assertion.Passed)
                    .map(assertion => new vscode.TestMessage(l10n.t(
                        '{0}: {1}\nExpected: {2}\nActual: {3}',
                        assertion.TagName,
                        assertion.Message,
                        this.displayValue(assertion.ExpectedValue),
                        this.displayValue(assertion.ActualValue),
                    )));
                run.failed(item, messages.length > 0
                    ? messages
                    : [new vscode.TestMessage(l10n.t('PLC test step failed.'))]);
            }
        }

        parent.children.forEach(item => {
            const metadata = this.metadata.get(item);
            if (metadata?.kind === 'step' && !reported.has(metadata.stepIndex)) {
                run.skipped(item);
            }
        });
    }

    private displayValue(value: unknown): string {
        if (typeof value === 'string') { return value; }
        try {
            const serialized = JSON.stringify(value);
            return serialized === undefined ? String(value) : serialized;
        } catch {
            return l10n.t('[Value cannot be displayed]');
        }
    }

    private async runAll(): Promise<void> {
        await vscode.commands.executeCommand('testing.runAll');
    }

    dispose(): void {
        this.disposables.forEach(disposable => disposable.dispose());
        this.controller.dispose();
    }
}
