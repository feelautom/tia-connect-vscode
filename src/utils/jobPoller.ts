import * as vscode from 'vscode';
import { pollJob } from '../api/jobs';
import { JobStatus } from '../api/types';

/**
 * Run a job with VS Code progress UI.
 * @param title Progress notification title
 * @param jobId Job ID to poll
 * @returns Final job status
 */
export async function runJobWithProgress(title: string, jobId: string): Promise<JobStatus> {
    return vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title,
            cancellable: true,
        },
        async (progress, token) => {
            const result = await pollJob(jobId, (status) => {
                progress.report({
                    message: status.Message || `${status.Status} (${status.Progress}%)`,
                    increment: undefined,
                });
            }, undefined, undefined, token);
            return result;
        }
    );
}
