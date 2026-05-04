import * as vscode from 'vscode';
import { listTests, getTest, runTest, runAllTests } from '../api/testHarness';
import { pollJob } from '../api/jobs';
import { TestRunResult } from '../api/types';
import { log, logError } from '../views/outputChannel';

export class TiaTestProvider implements vscode.Disposable {
    private controller: vscode.TestController;
    private runProfiles: vscode.Disposable[] = [];
    private disposables: vscode.Disposable[] = [];

    constructor() {
        this.controller = vscode.tests.createTestController('tiaPlcTests', 'PLC Tests');

        // Run profile
        const runProfile = this.controller.createRunProfile(
            'Run',
            vscode.TestRunProfileKind.Run,
            (request, token) => this.runHandler(request, token)
        );
        this.runProfiles.push(runProfile);

        // Resolve handler: discover tests when explorer is opened, resolve children on expand
        this.controller.resolveHandler = async (item) => {
            if (!item) {
                await this.discoverTests();
            } else {
                await this.resolveTestChildren(item);
            }
        };
    }

    activate(context: vscode.ExtensionContext): void {
        context.subscriptions.push(
            vscode.commands.registerCommand('tiaConnect.testRefresh', () => this.discoverTests()),
            vscode.commands.registerCommand('tiaConnect.testRunAll', () => this.runAll()),
        );
    }

    /** Discover tests from the backend */
    async discoverTests(): Promise<void> {
        try {
            const testNames = await listTests();

            // Remove old items
            this.controller.items.forEach(item => this.controller.items.delete(item.id));

            for (const name of testNames) {
                const testItem = this.controller.createTestItem(
                    `plc-test:${name}`,
                    name,
                );
                testItem.canResolveChildren = true;
                this.controller.items.add(testItem);
            }

            log(`Discovered ${testNames.length} PLC test(s).`);
        } catch (err) {
            logError('Test discovery failed', err);
        }
    }

    /** Resolve children (steps) for a test item */
    private async resolveTestChildren(item: vscode.TestItem): Promise<void> {
        const testName = item.label;
        try {
            const tc = await getTest(testName);
            if (tc?.steps) {
                for (let i = 0; i < tc.steps.length; i++) {
                    const step = tc.steps[i];
                    const stepItem = this.controller.createTestItem(
                        `plc-test:${testName}:step${i}`,
                        step.description || `Step ${i + 1}`,
                    );
                    item.children.add(stepItem);
                }
            }
        } catch (err) {
            logError(`Failed to resolve test ${testName}`, err);
        }
    }

    /** Run selected tests or all */
    private async runHandler(
        request: vscode.TestRunRequest,
        token: vscode.CancellationToken,
    ): Promise<void> {
        const run = this.controller.createTestRun(request);

        // Collect test names to run
        const testsToRun: vscode.TestItem[] = [];
        if (request.include) {
            for (const item of request.include) {
                // Only run top-level test items (not individual steps)
                if (!item.id.includes(':step')) {
                    testsToRun.push(item);
                }
            }
        } else {
            // Run all
            this.controller.items.forEach(item => testsToRun.push(item));
        }

        for (const testItem of testsToRun) {
            if (token.isCancellationRequested) { break; }

            const testName = testItem.label;
            run.started(testItem);

            try {
                const jobId = await runTest(testName);
                const jobResult = await pollJob(jobId);

                if (jobResult.Status === 'Failed') {
                    run.failed(testItem, new vscode.TestMessage(jobResult.Error || 'Test execution failed.'));
                    continue;
                }

                // Parse result from job
                const result = jobResult.Result as any;
                if (!result?.Results?.length) {
                    run.errored(testItem, new vscode.TestMessage('No results returned.'));
                    continue;
                }

                const testResult: TestRunResult = result.Results[result.Results.length - 1];

                if (testResult.Passed) {
                    run.passed(testItem, testResult.DurationMs);
                } else {
                    const messages = this.extractFailureMessages(testResult);
                    run.failed(testItem, messages, testResult.DurationMs);
                }

                // Update step results
                this.updateStepResults(run, testItem, testResult);

            } catch (err) {
                const msg = err instanceof Error ? err.message : String(err);
                run.errored(testItem, new vscode.TestMessage(msg));
                logError(`Test ${testName} error`, err);
            }
        }

        run.end();
    }

    private async runAll(): Promise<void> {
        await vscode.commands.executeCommand('testing.runAll');
    }

    private extractFailureMessages(result: TestRunResult): vscode.TestMessage[] {
        const messages: vscode.TestMessage[] = [];

        if (result.Error) {
            messages.push(new vscode.TestMessage(result.Error));
        }

        for (const step of result.Steps || []) {
            for (const assertion of step.Assertions || []) {
                if (!assertion.Passed) {
                    messages.push(new vscode.TestMessage(
                        `${assertion.TagName}: ${assertion.Message}\n  Expected: ${JSON.stringify(assertion.ExpectedValue)}\n  Actual: ${JSON.stringify(assertion.ActualValue)}`
                    ));
                }
            }
        }

        return messages.length ? messages : [new vscode.TestMessage('Test failed (no details).')];
    }

    private updateStepResults(run: vscode.TestRun, testItem: vscode.TestItem, result: TestRunResult): void {
        for (const step of result.Steps || []) {
            const stepId = `${testItem.id}:step${step.StepIndex}`;
            const stepItem = testItem.children.get(stepId);
            if (!stepItem) { continue; }

            if (step.Passed) {
                run.passed(stepItem);
            } else {
                const msgs = (step.Assertions || [])
                    .filter(a => !a.Passed)
                    .map(a => new vscode.TestMessage(`${a.TagName}: ${a.Message}`));
                run.failed(stepItem, msgs.length ? msgs : [new vscode.TestMessage('Step failed.')]);
            }
        }
    }

    dispose(): void {
        this.controller.dispose();
        for (const d of this.runProfiles) { d.dispose(); }
        for (const d of this.disposables) { d.dispose(); }
    }
}
