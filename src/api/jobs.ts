import { client } from './client';
import { JobStatus } from './types';

const DEFAULT_POLL_INTERVAL_MS = 1000;
const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export async function getJobStatus(jobId: string): Promise<JobStatus> {
    const res = await client.get<JobStatus>(`/api/jobs/${encodeURIComponent(jobId)}`);
    return res.Data;
}

/** Poll a job until completion, calling onProgress with each update */
export async function pollJob(
    jobId: string,
    onProgress?: (status: JobStatus) => void,
    intervalMs = DEFAULT_POLL_INTERVAL_MS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
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
