import { client } from './client';
import { TagTableInfo, TagInfo, UdtSummary, UdtDetail } from './types';

/** List all tag tables for a device */
export async function getTagTables(deviceName: string): Promise<TagTableInfo[]> {
    const res = await client.get<any>(
        `/api/devices/${enc(deviceName)}/tag-tables`
    );
    const data = res.Data;
    if (Array.isArray(data)) { return data; }
    // API may wrap in { TagTables: [...] }
    if (data?.TagTables && Array.isArray(data.TagTables)) { return data.TagTables; }
    return [];
}

/** List tags in a specific tag table */
export async function getTagsInTable(deviceName: string, tableName: string): Promise<TagInfo[]> {
    const res = await client.get<any>(
        `/api/devices/${enc(deviceName)}/tag-tables/${enc(tableName)}/tags`
    );
    const data = res.Data;
    if (Array.isArray(data)) { return data; }
    if (data?.Tags && Array.isArray(data.Tags)) { return data.Tags; }
    return [];
}

/** List all UDTs for a device */
export async function getUdts(deviceName: string): Promise<UdtSummary[]> {
    const res = await client.get<any>(
        `/api/devices/${enc(deviceName)}/udts`
    );
    const data = res.Data;
    if (Array.isArray(data)) { return data; }
    if (data?.Udts && Array.isArray(data.Udts)) { return data.Udts; }
    return [];
}

/** Get UDT details (members) */
export async function getUdtDetails(deviceName: string, udtName: string): Promise<UdtDetail> {
    const res = await client.get<UdtDetail>(
        `/api/devices/${enc(deviceName)}/udts/${enc(udtName)}`
    );
    return res.Data;
}

function enc(s: string): string {
    return encodeURIComponent(s);
}
