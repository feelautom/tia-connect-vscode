import { client } from './client';
import { BlockTreeNode, BlockContentDto, CompilationResult, CompilationMessage, CrossReferenceResult } from './types';
import { ApiResponse } from './types';

export async function getBlockTree(deviceName: string): Promise<BlockTreeNode[]> {
    const res = await client.get<any>(
        `/api/devices/${enc(deviceName)}/blocks/tree`
    );
    const data = res.Data;
    // API returns a single root node (e.g. "Program blocks") with Children
    // We return the children directly as the tree roots
    if (data && !Array.isArray(data) && data.Children) {
        return data.Children as BlockTreeNode[];
    }
    // If it's already an array, use as-is
    if (Array.isArray(data)) {
        return data;
    }
    return [];
}

/** Get full block content (interface, networks, RawXml, SourceText) */
export async function getBlockContent(deviceName: string, blockName: string): Promise<BlockContentDto> {
    const res = await client.get<BlockContentDto>(
        `/api/devices/${enc(deviceName)}/blocks/${enc(blockName)}/content`
    );
    return res.Data;
}

/** Reimport SCL/STL source into TIA Portal */
export async function importAndGenerate(deviceName: string, sclContent: string, sourceName?: string): Promise<ApiResponse> {
    const res = await client.post<unknown>(
        `/api/devices/${enc(deviceName)}/external-sources/import-and-generate`,
        { SclContent: sclContent, SourceName: sourceName }
    );
    return res;
}

/** Compile entire device (synchronous) */
export async function compileDevice(deviceName: string): Promise<CompilationResult> {
    const res = await client.post<any>(
        `/api/devices/${enc(deviceName)}/actions/compile-sync`
    );
    // Response data contains { result: { errorCount, warningCount, messages } }
    const data = res.Data;
    return normalizeCompilationResult(data);
}

/** Compile a single block */
export async function compileBlock(deviceName: string, blockName: string): Promise<CompilationResult> {
    const res = await client.post<any>(
        `/api/devices/${enc(deviceName)}/blocks/${enc(blockName)}/actions/compile`,
        {}
    );
    const data = res.Data;
    return normalizeCompilationResult(data);
}

/** Export block as raw XML */
export async function exportBlockXml(deviceName: string, blockName: string): Promise<string> {
    // Use /content endpoint which reliably returns RawXml
    const details = await getBlockDetails(deviceName, blockName);
    if (details?.RawXml) {
        return details.RawXml;
    }
    throw new Error(`No XML available for block ${blockName}.`);
}

function normalizeCompilationResult(data: any): CompilationResult {
    if (!data) {
        return { Success: false, ErrorCount: 0, WarningCount: 0, Messages: [] };
    }
    // The compile response may nest results under "Result"
    const r = data.Result || data;
    return {
        Success: (r.State === 'Success' || r.State === 'success') && (r.ErrorCount ?? r.errorCount ?? 0) === 0,
        ErrorCount: r.ErrorCount ?? r.errorCount ?? 0,
        WarningCount: r.WarningCount ?? r.warningCount ?? 0,
        Messages: flattenMessages(r.Messages || r.messages || []),
    };
}

function flattenMessages(messages: any[]): CompilationMessage[] {
    const result: CompilationMessage[] = [];
    for (const msg of messages) {
        if (msg.Description || msg.description) {
            result.push({
                Path: msg.Path || msg.path || '',
                Description: msg.Description || msg.description || '',
                ErrorLevel: mapState(msg.State || msg.state) as CompilationMessage['ErrorLevel'],
            });
        }
        // Recurse into nested messages
        const nested = msg.Messages || msg.messages;
        if (Array.isArray(nested)) {
            result.push(...flattenMessages(nested));
        }
    }
    return result;
}

function mapState(state: string): 'Error' | 'Warning' | 'Info' {
    if (!state) { return 'Info'; }
    const s = state.toLowerCase();
    if (s === 'error') { return 'Error'; }
    if (s === 'warning') { return 'Warning'; }
    return 'Info';
}

/** Get block details (interface, networks with parts) for LAD/FBD viewing */
export async function getBlockDetails(deviceName: string, blockName: string): Promise<any> {
    const res = await client.get<any>(
        `/api/devices/${enc(deviceName)}/blocks/${enc(blockName)}/content`
    );
    return res.Data;
}

/** Get cross-references for a block */
export async function getCrossReferences(deviceName: string, blockName: string): Promise<CrossReferenceResult> {
    const res = await client.get<CrossReferenceResult>(
        `/api/devices/${enc(deviceName)}/blocks/${enc(blockName)}/cross-references`
    );
    return res.Data;
}

function enc(s: string): string {
    return encodeURIComponent(s);
}
