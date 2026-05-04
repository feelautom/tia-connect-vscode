import { client } from './client';
import { BlockTreeNode, ExportSourceResult, CompilationResult, ImportResult } from './types';

export async function getBlockTree(deviceName: string): Promise<BlockTreeNode[]> {
    const res = await client.get<BlockTreeNode[]>(
        `/api/devices/${enc(deviceName)}/blocks/tree`
    );
    return res.Data;
}

export async function exportBlockSource(deviceName: string, blockName: string): Promise<ExportSourceResult> {
    const res = await client.post<ExportSourceResult>(
        `/api/devices/${enc(deviceName)}/blocks/${enc(blockName)}/actions/export-source`
    );
    return res.Data;
}

export async function importAndGenerate(deviceName: string, sclContent: string): Promise<ImportResult> {
    const res = await client.post<ImportResult>(
        `/api/devices/${enc(deviceName)}/external-sources/import-and-generate`,
        { SclContent: sclContent }
    );
    return res.Data;
}

export async function compileDevice(deviceName: string): Promise<CompilationResult> {
    const res = await client.post<CompilationResult>(
        `/api/devices/${enc(deviceName)}/actions/compile-sync`
    );
    return res.Data;
}

export async function compileBlock(deviceName: string, blockName: string): Promise<CompilationResult> {
    const res = await client.post<CompilationResult>(
        `/api/devices/${enc(deviceName)}/blocks/${enc(blockName)}/actions/compile`
    );
    return res.Data;
}

export async function exportBlockToFile(deviceName: string, blockName: string, exportPath: string): Promise<string> {
    const res = await client.post<string>(
        `/api/devices/${enc(deviceName)}/blocks/${enc(blockName)}/actions/export`,
        { ExportPath: exportPath }
    );
    return res.Data;
}

function enc(s: string): string {
    return encodeURIComponent(s);
}
