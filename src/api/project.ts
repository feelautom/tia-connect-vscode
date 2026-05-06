import { client } from './client';
import { ProjectOverview, DeviceInfo, LicenseFeatures, PlcSimStatus } from './types';

export async function getProjectOverview(): Promise<ProjectOverview> {
    const res = await client.get<ProjectOverview>('/api/projects/overview');
    const data = res.Data;
    // Normalize: API returns ProjectName/ProjectPath, we also expose as Name/Path
    if (data && !data.Name && data.ProjectName) {
        data.Name = data.ProjectName;
    }
    if (data && !data.Path && data.ProjectPath) {
        data.Path = data.ProjectPath;
    }
    return data;
}

export async function listDevices(): Promise<DeviceInfo[]> {
    const res = await client.get<DeviceInfo[]>('/api/projects/devices');
    return res.Data;
}

export async function getLicenseFeatures(): Promise<LicenseFeatures> {
    const res = await client.get<LicenseFeatures>('/api/license/features');
    return res.Data;
}

export async function getPlcSimStatus(): Promise<PlcSimStatus> {
    const res = await client.get<PlcSimStatus>('/api/simulation/status');
    return res.Data;
}

export interface ProjectFile {
    Name: string;
    Path: string;
    Extension: string;
    Size: number;
    LastModified: string;
}

export interface ProjectHistoryEntry {
    Path: string;
    LastAccess: string;
}

export async function listProjectFiles(): Promise<ProjectFile[]> {
    const res = await client.get<ProjectFile[]>('/api/projects/files');
    return res.Data ?? [];
}

export async function getProjectHistory(): Promise<ProjectHistoryEntry[]> {
    const res = await client.get<ProjectHistoryEntry[]>('/api/projects/history');
    return res.Data ?? [];
}

export async function openProject(path: string): Promise<string> {
    const res = await client.post<{ JobId: string }>('/api/projects/actions/open', { Path: path });
    return res.Data.JobId;
}

export async function closeProject(): Promise<string> {
    const res = await client.post<{ JobId: string }>('/api/projects/actions/close');
    return res.Data.JobId;
}

export async function retrieveProject(archivePath: string, targetDirectory: string): Promise<string> {
    const res = await client.post<{ JobId: string }>('/api/projects/actions/retrieve', {
        ArchivePath: archivePath,
        TargetDirectory: targetDirectory,
    });
    return res.Data.JobId;
}
