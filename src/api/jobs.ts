import { client } from './client';
import { JobStatus } from './types';

export async function getJobStatus(jobId: string): Promise<JobStatus> {
    const res = await client.get<JobStatus>(`/api/jobs/${encodeURIComponent(jobId)}`);
    return res.Data;
}

/** Poll a job until completion, calling onProgress with each update */
export async function pollJob(
    jobId: string,
    onProgress?: (status: JobStatus) => void,
    intervalMs = 1000
): Promise<JobStatus> {
    while (true) {
        const status = await getJobStatus(jobId);
        onProgress?.(status);

        if (status.Status === 'Completed' || status.Status === 'Failed') {
            return status;
        }

        await new Promise(r => setTimeout(r, intervalMs));
    }
}
