import { client } from './client';
import { ProjectOverview, DeviceInfo } from './types';

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
