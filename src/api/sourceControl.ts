import { client } from './client';
import {
    VcsStatus, VcsLogEntry, VcsDiffResult, VcsBranchInfo,
    VcsSettings, VcsRemoteInfo
} from './types';

const PREFIX = '/api/source-control';

export async function vcsInit(): Promise<void> {
    await client.post(`${PREFIX}/init`);
}

/** Commit returns a JobId (async operation: export + commit) */
export async function vcsCommit(message: string): Promise<string> {
    const res = await client.post<{ JobId: string }>(`${PREFIX}/commit`, { Message: message });
    return res.Data.JobId;
}

export async function vcsGetStatus(): Promise<VcsStatus> {
    const res = await client.get<VcsStatus>(`${PREFIX}/status`);
    return res.Data;
}

export async function vcsGetLog(count = 50): Promise<VcsLogEntry[]> {
    const res = await client.get<VcsLogEntry[]>(`${PREFIX}/log?count=${count}`);
    return res.Data;
}

export async function vcsGetDiff(from: string, to = 'HEAD'): Promise<VcsDiffResult> {
    const res = await client.get<VcsDiffResult>(`${PREFIX}/diff?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
    return res.Data;
}

export async function vcsListBranches(): Promise<VcsBranchInfo[]> {
    const res = await client.get<VcsBranchInfo[]>(`${PREFIX}/branches`);
    return res.Data;
}

export async function vcsCreateBranch(branchName: string): Promise<void> {
    await client.post(`${PREFIX}/branches`, { BranchName: branchName });
}

export async function vcsCheckoutBranch(branchName: string): Promise<void> {
    await client.post(`${PREFIX}/branches/checkout`, { BranchName: branchName });
}

export async function vcsDeleteBranch(branchName: string): Promise<void> {
    await client.delete(`${PREFIX}/branches/${encodeURIComponent(branchName)}`);
}

export async function vcsMerge(branchName: string): Promise<string> {
    const res = await client.post<string>(`${PREFIX}/merge`, { BranchName: branchName });
    return res.Message;
}

export async function vcsPush(remoteName?: string): Promise<string> {
    const res = await client.post<string>(`${PREFIX}/push`, { RemoteName: remoteName });
    return res.Message;
}

export async function vcsPull(remoteName?: string): Promise<string> {
    const res = await client.post<string>(`${PREFIX}/pull`, { RemoteName: remoteName });
    return res.Message;
}

export async function vcsGetConfig(): Promise<VcsSettings> {
    const res = await client.get<VcsSettings>(`${PREFIX}/config`);
    return res.Data;
}

export async function vcsListRemotes(): Promise<VcsRemoteInfo[]> {
    const res = await client.get<VcsRemoteInfo[]>(`${PREFIX}/remotes`);
    return res.Data;
}

export async function vcsAddRemote(name: string, url: string): Promise<void> {
    await client.post(`${PREFIX}/remotes`, { Name: name, Url: url });
}

export async function vcsRemoveRemote(name: string): Promise<void> {
    await client.delete(`${PREFIX}/remotes/${encodeURIComponent(name)}`);
}

/** Triggers an export without committing — returns a JobId */
export async function vcsExportPreview(): Promise<string> {
    const res = await client.post<{ JobId: string }>(`${PREFIX}/export-preview`);
    return res.Data.JobId;
}

export async function vcsGetFileContent(commitSha: string, filePath: string): Promise<string | null> {
    const res = await client.get<{ Content: string | null }>(`${PREFIX}/file-content?commitSha=${encodeURIComponent(commitSha)}&filePath=${encodeURIComponent(filePath)}`);
    return res.Data.Content;
}

export async function vcsRestore(commitSha: string, filePath: string, deviceName?: string): Promise<string> {
    const res = await client.post<{ JobId: string }>(`${PREFIX}/restore`, { CommitSha: commitSha, FilePath: filePath, DeviceName: deviceName });
    return res.Data.JobId;
}
