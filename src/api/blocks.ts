import { client } from './client';
import { BlockTreeNode, BlockContentDto, CompilationResult, ImportResult } from './types';

export async function getBlockTree(deviceName: string): Promise<BlockTreeNode[]> {
    const res = await client.get<BlockTreeNode[]>(
        `/api/devices/${enc(deviceName)}/blocks/tree`
    );
    return res.Data;
}

/** Get full block content (interface, networks, RawXml, SourceText) */
export async function getBlockContent(deviceName: string, blockName: string): Promise<BlockContentDto> {
    const res = await client.get<BlockContentDto>(
        `/api/devices/${enc(deviceName)}/blocks/${enc(blockName)}/content`
    );
    return res.Data;
}

export async function importAndGenerate(deviceName: string, sclContent: string, sourceName?: string): Promise<ImportResult> {
    const res = await client.post<ImportResult>(
        `/api/devices/${enc(deviceName)}/external-sources/import-and-generate`,
        { SclContent: sclContent, SourceName: sourceName }
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

/** Export block as raw XML (for non-editable blocks like LAD/FBD) */
export async function exportBlockXml(deviceName: string, blockName: string): Promise<string> {
    const res = await client.get<string>(
        `/api/devices/${enc(deviceName)}/blocks/${enc(blockName)}/export-xml`
    );
    return res.Data;
}

function enc(s: string): string {
    return encodeURIComponent(s);
}
