import { client } from './client';
import { JobStatus } from './types';
import { getSignalRClient } from './signalr';

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const POLL_FALLBACK_INTERVAL_MS = 1000;

interface JobCancellationToken {
    readonly isCancellationRequested: boolean;
    onCancellationRequested?: (listener: () => void) => { dispose(): unknown };
}

export class JobPollingCancelledError extends Error {
    constructor() {
        super('Job polling cancelled.');
        this.name = 'JobPollingCancelledError';
    }
}

export function isJobPollingCancellationError(error: unknown): error is JobPollingCancelledError {
    return error instanceof JobPollingCancelledError
        || (error instanceof Error && error.name === 'JobPollingCancelledError');
}

export async function getJobStatus(jobId: string): Promise<JobStatus> {
    const res = await client.get<JobStatus>(`/api/jobs/${encodeURIComponent(jobId)}`);
    return res.Data;
}

/** Wait for a job to complete using SignalR push notifications, with HTTP polling fallback */
export async function pollJob(
    jobId: string,
    onProgress?: (status: JobStatus) => void,
    intervalMs = POLL_FALLBACK_INTERVAL_MS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    cancellationToken?: JobCancellationToken,
): Promise<JobStatus> {
    const signalr = getSignalRClient();

    if (signalr.connected) {
        return waitJobViaSignalR(jobId, onProgress, timeoutMs, cancellationToken);
    }

    // Fallback: HTTP polling
    return pollJobHttp(jobId, onProgress, intervalMs, timeoutMs, cancellationToken);
}

/** Listen for job updates via SignalR push notifications */
function waitJobViaSignalR(
    jobId: string,
    onProgress: ((status: JobStatus) => void) | undefined,
    timeoutMs: number,
    cancellationToken?: JobCancellationToken,
): Promise<JobStatus> {
    return new Promise((resolve, reject) => {
        const signalr = getSignalRClient();
        let settled = false;
        let unsubscribe: (() => void) | null = null;
        const cancellationState: { subscription?: { dispose(): unknown } } = {};
        const cleanup = () => {
            unsubscribe?.();
            cancellationState.subscription?.dispose();
        };

        const timer = setTimeout(() => {
            if (settled) { return; }
            settled = true;
            cleanup();
            reject(new Error(`Job ${jobId} timed out after ${timeoutMs / 1000}s.`));
        }, timeoutMs);

        cancellationState.subscription = cancellationToken?.onCancellationRequested?.(() => {
            if (settled) { return; }
            settled = true;
            clearTimeout(timer);
            cleanup();
            reject(new JobPollingCancelledError());
        });

        // Also do one initial HTTP check in case the job already completed
        getJobStatus(jobId).then(status => {
            if (settled) { return; }
            onProgress?.(status);
            if (status.Status === 'Completed' || status.Status === 'Failed') {
                settled = true;
                clearTimeout(timer);
                cleanup();
                resolve(status);
            }
        }).catch(() => {});

        const handler = (_hub: string, method: string, args: unknown[]) => {
            if (settled) { return; }
            if (cancellationToken?.isCancellationRequested) {
                settled = true;
                clearTimeout(timer);
                cleanup();
                reject(new JobPollingCancelledError());
                return;
            }

            const msgJobId = args[0] as string;
            if (msgJobId !== jobId) { return; }

            if (method === 'jobStatusChanged') {
                const statusStr = args[1] as string;
                if (!isJobStatusValue(statusStr)) { return; }
                const result = args[2];
                const description = args[3] as string | undefined;

                const status: JobStatus = {
                    JobId: jobId,
                    Status: statusStr,
                    Result: result,
                    Message: description || '',
                    Error: statusStr === 'Failed' ? (description || '') : undefined,
                    Progress: statusStr === 'Completed' ? 100 : 0,
                    CreatedAt: new Date().toISOString(),
                };
                onProgress?.(status);

                if (statusStr === 'Completed' || statusStr === 'Failed') {
                    settled = true;
                    clearTimeout(timer);
                    cleanup();
                    // Fetch final status via HTTP for complete data
                    getJobStatus(jobId).then(resolve).catch(() => resolve(status));
                }
            } else if (method === 'jobProgressChanged') {
                const percent = args[1] as number;
                const message = args[2] as string;
                onProgress?.({
                    JobId: jobId,
                    Status: 'Running',
                    Message: message || `${percent}%`,
                    Result: null,
                    Progress: Number.isFinite(percent) ? Math.max(0, Math.min(100, percent)) : 0,
                    CreatedAt: new Date().toISOString(),
                });
            }
        };

        unsubscribe = signalr.onMessage(handler);
    });
}

function isJobStatusValue(value: string): value is JobStatus['Status'] {
    return value === 'Pending' || value === 'Running' || value === 'Completed' || value === 'Failed';
}

/** Fallback: poll job status via HTTP */
async function pollJobHttp(
    jobId: string,
    onProgress: ((status: JobStatus) => void) | undefined,
    intervalMs: number,
    timeoutMs: number,
    cancellationToken?: JobCancellationToken,
): Promise<JobStatus> {
    const deadline = Date.now() + timeoutMs;

    while (true) {
        if (cancellationToken?.isCancellationRequested) {
            throw new JobPollingCancelledError();
        }

        const status = await getJobStatus(jobId);
        onProgress?.(status);

        if (status.Status === 'Completed' || status.Status === 'Failed') {
            return status;
        }

        if (Date.now() > deadline) {
            throw new Error(`Job ${jobId} timed out after ${timeoutMs / 1000}s (last status: ${status.Status}).`);
        }

        await cancellableDelay(intervalMs, cancellationToken);
    }
}

function cancellableDelay(delayMs: number, cancellationToken?: JobCancellationToken): Promise<void> {
    if (cancellationToken?.isCancellationRequested) {
        return Promise.reject(new JobPollingCancelledError());
    }

    return new Promise((resolve, reject) => {
        const cancellationState: { subscription?: { dispose(): unknown } } = {};
        const timer = setTimeout(() => {
            cancellationState.subscription?.dispose();
            resolve();
        }, delayMs);
        cancellationState.subscription = cancellationToken?.onCancellationRequested?.(() => {
            clearTimeout(timer);
            cancellationState.subscription?.dispose();
            reject(new JobPollingCancelledError());
        });
    });
}
