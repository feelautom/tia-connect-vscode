/**
 * HMI API — export/import HMI screens, tags, and connections.
 */

import { client } from './client';

export interface HmiScreenInfo {
    Name: string;
    Number: number;
    Width: number;
    Height: number;
}

export interface HmiTagInfo {
    Name: string;
    DataType: string;
    Connection: string;
    PlcTag: string;
}

export interface HmiConnectionInfo {
    Name: string;
    Partner: string;
    Type: string;
}

function enc(s: string): string {
    return encodeURIComponent(s);
}

/** List HMI screens for a device */
export async function getHmiScreens(deviceName: string): Promise<HmiScreenInfo[]> {
    const res = await client.get<any>(
        `/api/devices/${enc(deviceName)}/hmi/screens`
    );
    const data = res.Data;
    if (Array.isArray(data)) return data;
    if (data?.Screens) return data.Screens;
    return [];
}

/** Export an HMI screen to XML */
export async function exportHmiScreen(deviceName: string, screenName: string, filePath: string): Promise<void> {
    await client.post(
        `/api/devices/${enc(deviceName)}/hmi/screens/${enc(screenName)}/actions/export`,
        { exportPath: filePath }
    );
}

/** Import an HMI screen from XML */
export async function importHmiScreen(deviceName: string, filePath: string): Promise<void> {
    await client.post(
        `/api/devices/${enc(deviceName)}/hmi/screens/actions/import`,
        { importFilePath: filePath }
    );
}

/** List HMI tags for a device */
export async function getHmiTags(deviceName: string): Promise<HmiTagInfo[]> {
    const res = await client.get<any>(
        `/api/devices/${enc(deviceName)}/hmi/tags`
    );
    const data = res.Data;
    if (Array.isArray(data)) return data;
    if (data?.Tags) return data.Tags;
    return [];
}

/** Export HMI tags to XML */
export async function exportHmiTags(deviceName: string, filePath: string): Promise<void> {
    await client.post(
        `/api/devices/${enc(deviceName)}/hmi/tags/actions/export`,
        { exportPath: filePath }
    );
}

/** Import HMI tags from XML */
export async function importHmiTags(deviceName: string, filePath: string): Promise<void> {
    await client.post(
        `/api/devices/${enc(deviceName)}/hmi/tags/actions/import`,
        { importFilePath: filePath }
    );
}

/** List HMI connections */
export async function getHmiConnections(deviceName: string): Promise<HmiConnectionInfo[]> {
    const res = await client.get<any>(
        `/api/devices/${enc(deviceName)}/hmi/connections`
    );
    const data = res.Data;
    if (Array.isArray(data)) return data;
    if (data?.Connections) return data.Connections;
    return [];
}

/** Export HMI connections to XML */
export async function exportHmiConnections(deviceName: string, filePath: string): Promise<void> {
    await client.post(
        `/api/devices/${enc(deviceName)}/hmi/connections/actions/export`,
        { exportPath: filePath }
    );
}

/** Import HMI connections from XML */
export async function importHmiConnections(deviceName: string, filePath: string): Promise<void> {
    await client.post(
        `/api/devices/${enc(deviceName)}/hmi/connections/actions/import`,
        { importFilePath: filePath }
    );
}
