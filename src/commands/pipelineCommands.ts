import * as vscode from 'vscode';
import {
    listPipelines, getPipeline, runPipeline,
    getExecutionHistory, listTemplates, instantiateTemplate,
} from '../api/pipelines';
import { pollJob } from '../api/jobs';
import { PipelineExecution, PipelineStepResult } from '../api/types';
import { log, logError } from '../views/outputChannel';

export function registerPipelineCommands(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('tiaConnect.pipelineList', () => showPipelineList()),
        vscode.commands.registerCommand('tiaConnect.pipelineRun', () => runPipelineCommand()),
        vscode.commands.registerCommand('tiaConnect.pipelineHistory', () => showPipelineHistory()),
        vscode.commands.registerCommand('tiaConnect.pipelineFromTemplate', () => createFromTemplate()),
    );
}

async function showPipelineList(): Promise<void> {
    try {
        const names = await listPipelines();
        if (!names.length) {
            vscode.window.showInformationMessage('No pipelines defined. Create one from a template.');
            return;
        }

        const selected = await vscode.window.showQuickPick(names, {
            placeHolder: 'Select a pipeline to view',
        });

        if (!selected) { return; }

        const pipeline = await getPipeline(selected);
        const doc = await vscode.workspace.openTextDocument({
            content: JSON.stringify(pipeline, null, 2),
            language: 'json',
        });
        await vscode.window.showTextDocument(doc, { preview: true });
    } catch (err) {
        logError('Pipeline list failed', err);
        vscode.window.showErrorMessage(`Failed: ${err instanceof Error ? err.message : err}`);
    }
}

async function runPipelineCommand(): Promise<void> {
    try {
        const names = await listPipelines();
        if (!names.length) {
            vscode.window.showInformationMessage('No pipelines to run.');
            return;
        }

        const selected = await vscode.window.showQuickPick(names, {
            placeHolder: 'Select a pipeline to run',
        });

        if (!selected) { return; }

        const jobId = await runPipeline(selected);
        log(`Pipeline '${selected}' started, job: ${jobId}`);

        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: `Pipeline: ${selected}`,
                cancellable: false,
            },
            async (progress) => {
                const result = await pollJob(jobId, (status) => {
                    progress.report({ message: status.Message });
                });

                if (result.Status === 'Completed') {
                    const execution = result.Result as PipelineExecution | undefined;
                    const summary = formatExecutionSummary(execution);
                    vscode.window.showInformationMessage(`Pipeline '${selected}' completed. ${summary}`);
                    log(`Pipeline '${selected}' completed. ${summary}`);
                } else {
                    vscode.window.showErrorMessage(
                        `Pipeline '${selected}' failed: ${result.Error || result.Message}`
                    );
                }
            }
        );
    } catch (err) {
        logError('Pipeline run failed', err);
        vscode.window.showErrorMessage(`Pipeline failed: ${err instanceof Error ? err.message : err}`);
    }
}

async function showPipelineHistory(): Promise<void> {
    try {
        const executions = await getExecutionHistory(undefined, 30);
        if (!executions.length) {
            vscode.window.showInformationMessage('No pipeline execution history.');
            return;
        }

        const items = executions.map(e => ({
            label: `${statusIcon(e.Status)} ${e.PipelineName}`,
            description: `${e.Status} - ${formatDuration(e.DurationMs)}`,
            detail: `Started: ${new Date(e.StartedAt).toLocaleString()}${e.Error ? ' | Error: ' + e.Error : ''}`,
            execution: e,
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Pipeline execution history',
        });

        if (!selected) { return; }

        // Show step details
        const e = selected.execution;
        const lines = [
            `Pipeline: ${e.PipelineName}`,
            `Status: ${e.Status}`,
            `Duration: ${formatDuration(e.DurationMs)}`,
            `Started: ${e.StartedAt}`,
            `Completed: ${e.CompletedAt || 'N/A'}`,
            e.Error ? `Error: ${e.Error}` : '',
            '',
            '--- Steps ---',
            ...e.StepResults.map((s: PipelineStepResult) =>
                `${statusIcon(s.Status)} Step ${s.StepIndex}: ${s.StepName} (${s.Action}) - ${formatDuration(s.DurationMs)}${s.Error ? ' ERROR: ' + s.Error : ''}`
            ),
        ].filter(Boolean);

        const doc = await vscode.workspace.openTextDocument({
            content: lines.join('\n'),
            language: 'plaintext',
        });
        await vscode.window.showTextDocument(doc, { preview: true });
    } catch (err) {
        logError('Pipeline history failed', err);
        vscode.window.showErrorMessage(`Failed: ${err instanceof Error ? err.message : err}`);
    }
}

async function createFromTemplate(): Promise<void> {
    try {
        const templates = await listTemplates();
        if (!templates.length) {
            vscode.window.showInformationMessage('No pipeline templates available.');
            return;
        }

        const selected = await vscode.window.showQuickPick(
            templates.map(t => ({
                label: t.Name,
                description: t.Category,
                detail: t.Description,
                id: t.Id,
            })),
            { placeHolder: 'Select a pipeline template' }
        );

        if (!selected) { return; }

        const pipelineName = await vscode.window.showInputBox({
            prompt: 'Name for the new pipeline',
            value: selected.label.replace(/\s+/g, '_'),
        });

        if (!pipelineName) { return; }

        const pipeline = await instantiateTemplate((selected as any).id, pipelineName);
        vscode.window.showInformationMessage(`Pipeline '${pipelineName}' created from template.`);
        log(`Pipeline '${pipelineName}' created from template '${selected.label}'.`);

        // Show the created pipeline
        const doc = await vscode.workspace.openTextDocument({
            content: JSON.stringify(pipeline, null, 2),
            language: 'json',
        });
        await vscode.window.showTextDocument(doc);
    } catch (err) {
        logError('Template instantiation failed', err);
        vscode.window.showErrorMessage(`Failed: ${err instanceof Error ? err.message : err}`);
    }
}

function formatExecutionSummary(execution?: PipelineExecution): string {
    if (!execution) { return ''; }
    const passed = execution.StepResults.filter(s => s.Status === 'Completed').length;
    const total = execution.StepResults.length;
    return `${passed}/${total} steps OK in ${formatDuration(execution.DurationMs)}`;
}

function formatDuration(ms: number): string {
    if (ms < 1000) { return `${ms}ms`; }
    if (ms < 60000) { return `${(ms / 1000).toFixed(1)}s`; }
    return `${(ms / 60000).toFixed(1)}min`;
}

function statusIcon(status: string): string {
    switch (status) {
        case 'Completed': return '[OK]';
        case 'Failed': return '[FAIL]';
        case 'Running': return '[RUN]';
        case 'Cancelled': return '[CANCEL]';
        case 'Skipped': return '[SKIP]';
        default: return '[...]';
    }
}
