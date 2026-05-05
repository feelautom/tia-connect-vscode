import { client } from './client';
import { JobStatus } from './types';
import { getSignalRClient } from './signalr';

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const POLL_FALLBACK_INTERVAL_MS = 1000;

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
    cancellationToken?: { isCancellationRequested: boolean },
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
    cancellationToken?: { isCancellationRequested: boolean },
): Promise<JobStatus> {
    return new Promise((resolve, reject) => {
        const signalr = getSignalRClient();
        let settled = false;
        let unsubscribe: (() => void) | null = null;

        const cleanup = () => { unsubscribe?.(); };

        const timer = setTimeout(() => {
            if (settled) { return; }
            settled = true;
            cleanup();
            reject(new Error(`Job ${jobId} timed out after ${timeoutMs / 1000}s.`));
        }, timeoutMs);

        // Also do one initial HTTP check in case the job already completed
        getJobStatus(jobId).then(status => {
            if (settled) { return; }
            onProgress?.(status);
            if (status.Status === 'Completed' || status.Status === 'Failed') {
                settled = true;
                clearTimeout(timer);
                resolve(status);
            }
        }).catch(() => {});

        const handler = (_hub: string, method: string, args: unknown[]) => {
            if (settled) { return; }
            if (cancellationToken?.isCancellationRequested) {
                settled = true;
                clearTimeout(timer);
                cleanup();
                reject(new Error('Job polling cancelled.'));
                return;
            }

            const msgJobId = args[0] as string;
            if (msgJobId !== jobId) { return; }

            if (method === 'jobStatusChanged') {
                const statusStr = args[1] as string;
                const result = args[2];
                const description = args[3] as string | undefined;

                const status: JobStatus = {
                    JobId: jobId,
                    Status: statusStr,
                    Result: result,
                    Message: description || '',
                    Error: statusStr === 'Failed' ? (description || '') : undefined,
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
                });
            }
        };

        unsubscribe = signalr.onMessage(handler);
    });
}

/** Fallback: poll job status via HTTP */
async function pollJobHttp(
    jobId: string,
    onProgress: ((status: JobStatus) => void) | undefined,
    intervalMs: number,
    timeoutMs: number,
    cancellationToken?: { isCancellationRequested: boolean },
): Promise<JobStatus> {
    const deadline = Date.now() + timeoutMs;

    while (true) {
        if (cancellationToken?.isCancellationRequested) {
            throw new Error('Job polling cancelled.');
        }

        const status = await getJobStatus(jobId);
        onProgress?.(status);

        if (status.Status === 'Completed' || status.Status === 'Failed') {
            return status;
        }

        if (Date.now() > deadline) {
            throw new Error(`Job ${jobId} timed out after ${timeoutMs / 1000}s (last status: ${status.Status}).`);
        }

        await new Promise(r => setTimeout(r, intervalMs));
    }
}
