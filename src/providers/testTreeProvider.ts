import * as vscode from 'vscode';
import { l10n } from 'vscode';
import { listTests, getTest, runTest } from '../api/testHarness';
import { getLicenseFeatures, getPlcSimStatus } from '../api/project';
import { pollJob } from '../api/jobs';
import { TestRunResult } from '../api/types';
import { log, logError, showOutput } from '../views/outputChannel';
import { openTestResultWebview } from '../editors/testResultWebview';

type TestNodeType = 'test' | 'step' | 'message';

interface TestTreeItem {
    type: TestNodeType;
    label: string;
    testName: string;
    stepIndex?: number;
    status?: 'none' | 'running' | 'passed' | 'failed' | 'errored';
    duration?: number;
    error?: string;
    messageIcon?: string;
}

export class TestTreeProvider implements vscode.TreeDataProvider<TestTreeItem>, vscode.Disposable {
    private _onDidChangeTreeData = new vscode.EventEmitter<TestTreeItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private tests: TestTreeItem[] = [];
    private testSteps = new Map<string, TestTreeItem[]>();
    private testResults = new Map<string, TestRunResult>();
    private disposables: vscode.Disposable[] = [];

    activate(context: vscode.ExtensionContext): void {
        const treeView = vscode.window.createTreeView('tiaTestExplorer', {
            treeDataProvider: this,
            showCollapseAll: true,
        });

        context.subscriptions.push(
            treeView,
            vscode.commands.registerCommand('tiaConnect.testRefresh', () => this.discoverTests()),
            vscode.commands.registerCommand('tiaConnect.testRunAll', () => this.runAll()),
            vscode.commands.registerCommand('tiaConnect.testRunSingle', (item: TestTreeItem) =>
                this.runSingleTest(item)
            ),
            vscode.commands.registerCommand('tiaConnect.testShowResult', (item: TestTreeItem) =>
                this.showResult(item)
            ),
        );

        this.disposables.push(treeView);
    }

    async discoverTests(): Promise<void> {
        try {
            // Check license
            let hasTestHarness = false;
            try {
                const license = await getLicenseFeatures();
                const features = (license as any).Features ?? [];
                hasTestHarness = features.some((f: any) => f.Key === 'hasTestHarness' && f.Enabled);
            } catch { /* assume not available */ }

            if (!hasTestHarness) {
                this.tests = [{
                    type: 'message', label: 'Test Harness not included in your license.',
                    testName: '', messageIcon: 'lock',
                }];
                this.testSteps.clear();
                this._onDidChangeTreeData.fire(undefined);
                log('Test Harness feature not available in current license.');
                return;
            }

            // Check PLCSim Advanced
            let plcSimAvailable = false;
            try {
                const plcSim = await getPlcSimStatus();
                plcSimAvailable = (plcSim as any).ApiAvailable === true;
            } catch { /* not available */ }

            if (!plcSimAvailable) {
                this.tests = [{
                    type: 'message', label: 'PLCSim Advanced not installed or not running.',
                    testName: '', messageIcon: 'warning',
                }];
                this.testSteps.clear();
                this._onDidChangeTreeData.fire(undefined);
                log('PLCSim Advanced not available.');
                return;
            }

            // Discover tests
            const testNames = await listTests();
            if (testNames.length === 0) {
                this.tests = [{
                    type: 'message', label: 'No tests found. Create tests via MCP or REST API.',
                    testName: '', messageIcon: 'info',
                }];
            } else {
                this.tests = testNames.map(name => ({
                    type: 'test' as const,
                    label: name,
                    testName: name,
                    status: 'none' as const,
                }));
            }
            this.testSteps.clear();
            log(`Discovered ${testNames.length} PLC test(s).`);
            this._onDidChangeTreeData.fire(undefined);
        } catch (err) {
            logError('Test discovery failed', err);
        }
    }

    getTreeItem(element: TestTreeItem): vscode.TreeItem {
        const item = new vscode.TreeItem(
            element.label,
            element.type === 'test'
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None
        );

        if (element.type === 'message') {
            item.iconPath = new vscode.ThemeIcon(element.messageIcon || 'info');
            item.contextValue = 'plcTestMessage';
        } else {
            item.iconPath = this.getStatusIcon(element.status || 'none');
            item.contextValue = element.type === 'test' ? 'plcTest' : 'plcTestStep';
        }

        if (element.type === 'test') {
            item.description = this.getTestDescription(element);
            if (this.testResults.has(element.testName)) {
                item.command = {
                    command: 'tiaConnect.testShowResult',
                    title: 'Show Results',
                    arguments: [element],
                };
            }
        }

        if (element.type === 'step' && element.error) {
            item.tooltip = element.error;
        }

        return item;
    }

    async getChildren(element?: TestTreeItem): Promise<TestTreeItem[]> {
        if (!element) {
            return this.tests;
        }

        if (element.type === 'test') {
            return this.getStepsForTest(element.testName);
        }

        return [];
    }

    private async getStepsForTest(testName: string): Promise<TestTreeItem[]> {
        if (this.testSteps.has(testName)) {
            return this.testSteps.get(testName)!;
        }

        try {
            const tc = await getTest(testName);
            if (!tc?.steps) { return []; }

            const steps: TestTreeItem[] = tc.steps.map((step, i) => ({
                type: 'step' as const,
                label: step.description || `Step ${i + 1}`,
                testName,
                stepIndex: i,
                status: 'none' as const,
            }));

            this.testSteps.set(testName, steps);
            return steps;
        } catch (err) {
            logError(`Failed to load steps for ${testName}`, err);
            return [];
        }
    }

    private async runSingleTest(item: TestTreeItem): Promise<void> {
        if (item.type !== 'test') { return; }

        showOutput();
        log(`--- Running test: ${item.testName} ---`);

        // Mark as running
        item.status = 'running';
        const steps = this.testSteps.get(item.testName) || [];
        for (const s of steps) { s.status = 'running'; }
        this._onDidChangeTreeData.fire(undefined);

        try {
            const jobId = await runTest(item.testName);
            const jobResult = await pollJob(jobId, (s) => {
                log(`  Job: ${s.Status}${s.Message ? ' - ' + s.Message : ''}`);
            });

            if (jobResult.Status === 'Failed') {
                item.status = 'errored';
                item.error = jobResult.Error || 'Test execution failed.';
                log(`  ERROR: ${item.error}`);
                for (const s of steps) { s.status = 'errored'; }
                this._onDidChangeTreeData.fire(undefined);
                vscode.window.showErrorMessage(`Test "${item.testName}": ${item.error}`);
                return;
            }

            const result = jobResult.Result as any;
            if (!result?.Results?.length) {
                item.status = 'errored';
                item.error = 'No results returned.';
                log(`  ERROR: No results returned.`);
                this._onDidChangeTreeData.fire(undefined);
                return;
            }

            const testResult: TestRunResult = result.Results[result.Results.length - 1];
            item.status = testResult.Passed ? 'passed' : 'failed';
            item.duration = testResult.DurationMs;
            item.error = testResult.Error;

            log(`  Result: ${testResult.Passed ? 'PASSED' : 'FAILED'} (${testResult.DurationMs}ms)`);

            // Update step results
            for (const stepResult of testResult.Steps || []) {
                const stepItem = steps[stepResult.StepIndex];
                if (!stepItem) { continue; }

                stepItem.status = stepResult.Passed ? 'passed' : 'failed';
                if (!stepResult.Passed) {
                    const failedAssertions = (stepResult.Assertions || [])
                        .filter(a => !a.Passed)
                        .map(a => `${a.TagName}: expected ${JSON.stringify(a.ExpectedValue)}, got ${JSON.stringify(a.ActualValue)}`)
                        .join('; ');
                    stepItem.error = failedAssertions || 'Step failed.';
                    log(`  Step ${stepResult.StepIndex}: FAILED - ${stepItem.error}`);
                } else {
                    log(`  Step ${stepResult.StepIndex}: PASSED`);
                }
            }

            this._onDidChangeTreeData.fire(undefined);

            // Store and open detailed results webview
            this.testResults.set(item.testName, testResult);
            log(`  Opening test result webview for ${item.testName}...`);
            try {
                await openTestResultWebview(testResult);
                log(`  Webview opened successfully.`);
            } catch (webviewErr) {
                log(`  ERROR opening webview: ${webviewErr}`);
            }

            if (testResult.Passed) {
                vscode.window.showInformationMessage(l10n.t('Test "{0}" PASSED ({1}ms)', item.testName, String(testResult.DurationMs)));
            } else {
                vscode.window.showWarningMessage(l10n.t('Test "{0}" FAILED. See results panel.', item.testName));
            }

        } catch (err) {
            item.status = 'errored';
            item.error = err instanceof Error ? err.message : String(err);
            log(`  ERROR: ${item.error}`);
            for (const s of steps) { s.status = 'errored'; }
            this._onDidChangeTreeData.fire(undefined);
            logError(`Test ${item.testName} error`, err);
            vscode.window.showErrorMessage(`Test "${item.testName}": ${item.error}`);
        }
    }

    private async showResult(item: TestTreeItem): Promise<void> {
        if (item.type !== 'test') { return; }
        const result = this.testResults.get(item.testName);
        if (result) {
            await openTestResultWebview(result);
        } else {
            vscode.window.showInformationMessage(l10n.t('No results yet for "{0}". Run the test first.', item.testName));
        }
    }

    async runAll(): Promise<void> {
        for (const test of this.tests) {
            await this.runSingleTest(test);
        }
    }

    private getStatusIcon(status: string): vscode.ThemeIcon {
        switch (status) {
            case 'passed': return new vscode.ThemeIcon('pass', new vscode.ThemeColor('testing.iconPassed'));
            case 'failed': return new vscode.ThemeIcon('error', new vscode.ThemeColor('testing.iconFailed'));
            case 'errored': return new vscode.ThemeIcon('warning', new vscode.ThemeColor('testing.iconErrored'));
            case 'running': return new vscode.ThemeIcon('sync~spin');
            default: return new vscode.ThemeIcon('circle-outline');
        }
    }

    private getTestDescription(element: TestTreeItem): string {
        const parts: string[] = [];
        if (element.status === 'passed') { parts.push('Passed'); }
        if (element.status === 'failed') { parts.push('Failed'); }
        if (element.duration) { parts.push(`${element.duration}ms`); }
        return parts.join(' | ');
    }

    dispose(): void {
        for (const d of this.disposables) { d.dispose(); }
    }
}
