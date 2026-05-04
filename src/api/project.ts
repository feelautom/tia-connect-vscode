import { client } from './client';
import { ProjectOverview, DeviceInfo } from './types';

export async function getProjectOverview(): Promise<ProjectOverview> {
    const res = await client.get<ProjectOverview>('/api/projects/overview');
    return res.Data;
}

export async function listDevices(): Promise<DeviceInfo[]> {
    const res = await client.get<DeviceInfo[]>('/api/projects/devices');
    return res.Data;
}
