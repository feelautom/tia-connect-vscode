import { client } from './client';
import { TagTableInfo, TagInfo, UdtSummary, UdtDetail, WatchTableInfo, WatchTableDetail } from './types';

// ─── Tag Tables ──────────────────────────────────────────────────

/** List all tag tables for a device */
export async function getTagTables(deviceName: string): Promise<TagTableInfo[]> {
    const res = await client.get<any>(
        `/api/devices/${enc(deviceName)}/tag-tables`
    );
    const data = res.Data;
    if (Array.isArray(data)) { return data; }
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

/** Export a tag table to CSV */
export async function exportTagTableCsv(deviceName: string, tableName: string, filePath: string): Promise<void> {
    await client.post(`/api/devices/${enc(deviceName)}/tag-tables/${enc(tableName)}/actions/export-csv-sync`, { exportPath: filePath });
}

/** Export a tag table to XLSX */
export async function exportTagTableXlsx(deviceName: string, tableName: string, filePath: string): Promise<void> {
    await client.post(`/api/devices/${enc(deviceName)}/tag-tables/${enc(tableName)}/actions/export-excel-sync`, { exportPath: filePath });
}

/** Export a tag table to XML — uses GET endpoint */
export async function exportTagTableXml(deviceName: string, tableName: string, filePath: string): Promise<void> {
    const res = await client.get<string>(`/api/devices/${enc(deviceName)}/tag-tables/${enc(tableName)}/export-xml`);
    const fs = await import('fs');
    fs.writeFileSync(filePath, typeof res.Data === 'string' ? res.Data : JSON.stringify(res.Data, null, 2), 'utf-8');
}

/** Import tags from a CSV file */
export async function importTagsCsv(deviceName: string, tableName: string, filePath: string): Promise<void> {
    await client.post(`/api/devices/${enc(deviceName)}/tag-tables/${enc(tableName)}/actions/import-csv-sync`, { filePath: filePath });
}

/** Import tags from an XLSX file */
export async function importTagsXlsx(deviceName: string, tableName: string, filePath: string): Promise<void> {
    await client.post(`/api/devices/${enc(deviceName)}/tag-tables/${enc(tableName)}/actions/import-xlsx-sync`, { filePath: filePath });
}

// ─── UDTs ────────────────────────────────────────────────────────

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

/** Export a UDT to XML */
export async function exportUdtXml(deviceName: string, udtName: string, filePath: string): Promise<void> {
    await client.post(`/api/devices/${enc(deviceName)}/udts/${enc(udtName)}/actions/export`, { exportPath: filePath });
}

/** Import a UDT from XML */
export async function importUdtXml(deviceName: string, filePath: string): Promise<void> {
    await client.post(`/api/devices/${enc(deviceName)}/udts/actions/import`, { importFilePath: filePath });
}

// ─── Watch Tables ────────────────────────────────────────────────

/** List all watch tables for a device */
export async function getWatchTables(deviceName: string): Promise<WatchTableInfo[]> {
    const res = await client.get<any>(
        `/api/devices/${enc(deviceName)}/watch-tables`
    );
    const data = res.Data;
    if (Array.isArray(data)) { return data; }
    if (data?.WatchTables && Array.isArray(data.WatchTables)) { return data.WatchTables; }
    return [];
}

/** Get watch table details (entries) */
export async function getWatchTableDetails(deviceName: string, tableName: string): Promise<WatchTableDetail> {
    const res = await client.get<WatchTableDetail>(
        `/api/devices/${enc(deviceName)}/watch-tables/${enc(tableName)}`
    );
    return res.Data;
}

/** Export a watch table to XML */
export async function exportWatchTableXml(deviceName: string, tableName: string, filePath: string): Promise<void> {
    await client.post(`/api/devices/${enc(deviceName)}/watch-tables/${enc(tableName)}/actions/export`, { exportPath: filePath });
}

function enc(s: string): string {
    return encodeURIComponent(s);
}
