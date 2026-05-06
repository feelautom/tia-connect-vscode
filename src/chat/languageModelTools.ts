import * as vscode from 'vscode';
import { client } from '../api/client';
import { getLicenseFeatures } from '../api/project';
import { log } from '../views/outputChannel';

// ── Helpers ──────────────────────────────────────────────────────

function jsonResult(payload: unknown): vscode.LanguageModelToolResult {
    const text = JSON.stringify(payload, null, 2);
    return new vscode.LanguageModelToolResult([new vscode.LanguageModelTextPart(text)]);
}

function errorResult(message: string): vscode.LanguageModelToolResult {
    return jsonResult({ success: false, error: message });
}

function enc(s: string): string {
    return encodeURIComponent(s);
}

// License check cache (avoid checking on every tool call)
let aiLicenseChecked = false;
let aiLicenseAllowed = true;

async function checkAiLicense(): Promise<boolean> {
    if (aiLicenseChecked) { return aiLicenseAllowed; }
    try {
        const license = await getLicenseFeatures();
        const aiFeature = license.Features?.find(f => f.Key === 'ai' || f.Key === 'copilot' || f.Key === 'assistant');
        aiLicenseAllowed = !aiFeature || aiFeature.Enabled;
        aiLicenseChecked = true;
        // Reset cache after 5 minutes
        setTimeout(() => { aiLicenseChecked = false; }, 5 * 60 * 1000);
    } catch {
        // License check failed — allow
    }
    return aiLicenseAllowed;
}

async function safeCall<T>(fn: () => Promise<T>): Promise<vscode.LanguageModelToolResult> {
    try {
        if (!await checkAiLicense()) {
            return errorResult('This feature requires an AI-enabled license. Upgrade your T-IA Connect license to use AI tools.');
        }
        const result = await fn();
        return jsonResult({ success: true, data: result });
    } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return errorResult(msg);
    }
}

// ── Tool implementations ─────────────────────────────────────────

class GetProjectOverviewTool implements vscode.LanguageModelTool<Record<string, never>> {
    async invoke(): Promise<vscode.LanguageModelToolResult> {
        return safeCall(async () => {
            const res = await client.get<unknown>('/api/projects/overview');
            return res.Data;
        });
    }
}

class ListDevicesTool implements vscode.LanguageModelTool<Record<string, never>> {
    async invoke(): Promise<vscode.LanguageModelToolResult> {
        return safeCall(async () => {
            const res = await client.get<unknown>('/api/projects/devices');
            return res.Data;
        });
    }
}

class ListBlocksTool implements vscode.LanguageModelTool<{ device: string }> {
    async invoke(options: vscode.LanguageModelToolInvocationOptions<{ device: string }>): Promise<vscode.LanguageModelToolResult> {
        return safeCall(async () => {
            const res = await client.get<unknown>(`/api/devices/${enc(options.input.device)}/blocks/tree`);
            return res.Data;
        });
    }
}

class GetBlockContentTool implements vscode.LanguageModelTool<{ device: string; block: string }> {
    async invoke(options: vscode.LanguageModelToolInvocationOptions<{ device: string; block: string }>): Promise<vscode.LanguageModelToolResult> {
        return safeCall(async () => {
            const res = await client.get<unknown>(`/api/devices/${enc(options.input.device)}/blocks/${enc(options.input.block)}/content`);
            return res.Data;
        });
    }
}

class GetBlockSourceTool implements vscode.LanguageModelTool<{ device: string; block: string }> {
    async invoke(options: vscode.LanguageModelToolInvocationOptions<{ device: string; block: string }>): Promise<vscode.LanguageModelToolResult> {
        return safeCall(async () => {
            const res = await client.get<unknown>(`/api/devices/${enc(options.input.device)}/blocks/${enc(options.input.block)}/source`);
            return res.Data;
        });
    }
}

class CreateBlockTool implements vscode.LanguageModelTool<{ device: string; blockType: string; name: string; language: string }> {
    async invoke(options: vscode.LanguageModelToolInvocationOptions<{ device: string; blockType: string; name: string; language: string }>): Promise<vscode.LanguageModelToolResult> {
        return safeCall(async () => {
            const { device, ...body } = options.input;
            const res = await client.post<unknown>(`/api/devices/${enc(device)}/blocks/generate-and-import`, {
                BlockType: body.blockType,
                Name: body.name,
                Language: body.language,
            });
            return res.Data;
        });
    }
}

class ImportSclTool implements vscode.LanguageModelTool<{ device: string; sclContent: string; sourceName?: string }> {
    async invoke(options: vscode.LanguageModelToolInvocationOptions<{ device: string; sclContent: string; sourceName?: string }>): Promise<vscode.LanguageModelToolResult> {
        return safeCall(async () => {
            const res = await client.post<unknown>(
                `/api/devices/${enc(options.input.device)}/external-sources/import-and-generate`,
                { SclContent: options.input.sclContent, SourceName: options.input.sourceName }
            );
            return { success: res.Success, message: res.Message };
        });
    }
}

class ExportBlockTool implements vscode.LanguageModelTool<{ device: string; block: string; format?: string }> {
    async invoke(options: vscode.LanguageModelToolInvocationOptions<{ device: string; block: string; format?: string }>): Promise<vscode.LanguageModelToolResult> {
        return safeCall(async () => {
            const fmt = options.input.format || 'xml';
            const res = await client.post<unknown>(
                `/api/devices/${enc(options.input.device)}/blocks/${enc(options.input.block)}/export`,
                { Format: fmt }
            );
            return res.Data;
        });
    }
}

class DeleteBlockTool implements vscode.LanguageModelTool<{ device: string; block: string }> {
    async invoke(options: vscode.LanguageModelToolInvocationOptions<{ device: string; block: string }>): Promise<vscode.LanguageModelToolResult> {
        return safeCall(async () => {
            const res = await client.delete<unknown>(`/api/devices/${enc(options.input.device)}/blocks/${enc(options.input.block)}`);
            return { success: res.Success, message: res.Message };
        });
    }
}

class CompileDeviceTool implements vscode.LanguageModelTool<{ device: string }> {
    async invoke(options: vscode.LanguageModelToolInvocationOptions<{ device: string }>): Promise<vscode.LanguageModelToolResult> {
        return safeCall(async () => {
            const res = await client.post<unknown>(`/api/devices/${enc(options.input.device)}/actions/compile-sync`);
            return res.Data;
        });
    }
}

class CompileBlockTool implements vscode.LanguageModelTool<{ device: string; block: string }> {
    async invoke(options: vscode.LanguageModelToolInvocationOptions<{ device: string; block: string }>): Promise<vscode.LanguageModelToolResult> {
        return safeCall(async () => {
            const res = await client.post<unknown>(
                `/api/devices/${enc(options.input.device)}/blocks/${enc(options.input.block)}/actions/compile`,
                {}
            );
            return res.Data;
        });
    }
}

class ListTagTablesTool implements vscode.LanguageModelTool<{ device: string }> {
    async invoke(options: vscode.LanguageModelToolInvocationOptions<{ device: string }>): Promise<vscode.LanguageModelToolResult> {
        return safeCall(async () => {
            const res = await client.get<unknown>(`/api/devices/${enc(options.input.device)}/tag-tables`);
            return res.Data;
        });
    }
}

class ListTagsTool implements vscode.LanguageModelTool<{ device: string; tagTable: string }> {
    async invoke(options: vscode.LanguageModelToolInvocationOptions<{ device: string; tagTable: string }>): Promise<vscode.LanguageModelToolResult> {
        return safeCall(async () => {
            const res = await client.get<unknown>(
                `/api/devices/${enc(options.input.device)}/tag-tables/${enc(options.input.tagTable)}/tags`
            );
            return res.Data;
        });
    }
}

class CreateTagTool implements vscode.LanguageModelTool<{ device: string; tagTable: string; name: string; dataType: string; address: string; comment?: string }> {
    async invoke(options: vscode.LanguageModelToolInvocationOptions<{ device: string; tagTable: string; name: string; dataType: string; address: string; comment?: string }>): Promise<vscode.LanguageModelToolResult> {
        return safeCall(async () => {
            const { device, tagTable, ...tag } = options.input;
            const res = await client.post<unknown>(
                `/api/devices/${enc(device)}/tag-tables/${enc(tagTable)}/tags`,
                { Name: tag.name, DataType: tag.dataType, LogicalAddress: tag.address, Comment: tag.comment }
            );
            return res.Data;
        });
    }
}

class ListUdtsTool implements vscode.LanguageModelTool<{ device: string }> {
    async invoke(options: vscode.LanguageModelToolInvocationOptions<{ device: string }>): Promise<vscode.LanguageModelToolResult> {
        return safeCall(async () => {
            const res = await client.get<unknown>(`/api/devices/${enc(options.input.device)}/udts`);
            return res.Data;
        });
    }
}

class GetCrossReferencesTool implements vscode.LanguageModelTool<{ device: string; block: string }> {
    async invoke(options: vscode.LanguageModelToolInvocationOptions<{ device: string; block: string }>): Promise<vscode.LanguageModelToolResult> {
        return safeCall(async () => {
            const res = await client.get<unknown>(
                `/api/devices/${enc(options.input.device)}/blocks/${enc(options.input.block)}/cross-references`
            );
            return res.Data;
        });
    }
}

class SaveProjectTool implements vscode.LanguageModelTool<Record<string, never>> {
    async invoke(): Promise<vscode.LanguageModelToolResult> {
        return safeCall(async () => {
            const res = await client.post<unknown>('/api/projects/actions/save');
            return { success: res.Success, message: res.Message };
        });
    }
}

class DownloadToPlcTool implements vscode.LanguageModelTool<{ device: string; scope?: string }> {
    async invoke(options: vscode.LanguageModelToolInvocationOptions<{ device: string; scope?: string }>): Promise<vscode.LanguageModelToolResult> {
        return safeCall(async () => {
            const res = await client.post<unknown>(
                `/api/devices/${enc(options.input.device)}/actions/download`,
                { Scope: options.input.scope || 'Software' }
            );
            return res.Data;
        });
    }
}

class PlcSimStatusTool implements vscode.LanguageModelTool<Record<string, never>> {
    async invoke(): Promise<vscode.LanguageModelToolResult> {
        return safeCall(async () => {
            const res = await client.get<unknown>('/api/simulation/status');
            return res.Data;
        });
    }
}

class PlcSimReadTagTool implements vscode.LanguageModelTool<{ tagName: string }> {
    async invoke(options: vscode.LanguageModelToolInvocationOptions<{ tagName: string }>): Promise<vscode.LanguageModelToolResult> {
        return safeCall(async () => {
            const res = await client.get<unknown>(`/api/simulation/plcsim/tags/${enc(options.input.tagName)}`);
            return res.Data;
        });
    }
}

class PlcSimWriteTagTool implements vscode.LanguageModelTool<{ tagName: string; value: string }> {
    async invoke(options: vscode.LanguageModelToolInvocationOptions<{ tagName: string; value: string }>): Promise<vscode.LanguageModelToolResult> {
        return safeCall(async () => {
            const res = await client.post<unknown>(
                `/api/simulation/plcsim/tags/${enc(options.input.tagName)}`,
                { Value: options.input.value }
            );
            return res.Data;
        });
    }
}

class RunTestsTool implements vscode.LanguageModelTool<{ device: string }> {
    async invoke(options: vscode.LanguageModelToolInvocationOptions<{ device: string }>): Promise<vscode.LanguageModelToolResult> {
        return safeCall(async () => {
            const res = await client.post<unknown>(`/api/tests/run`, { DeviceName: options.input.device });
            return res.Data;
        });
    }
}

class VcsStatusTool implements vscode.LanguageModelTool<Record<string, never>> {
    async invoke(): Promise<vscode.LanguageModelToolResult> {
        return safeCall(async () => {
            const res = await client.get<unknown>('/api/source-control/status');
            return res.Data;
        });
    }
}

class VcsCommitTool implements vscode.LanguageModelTool<{ message: string }> {
    async invoke(options: vscode.LanguageModelToolInvocationOptions<{ message: string }>): Promise<vscode.LanguageModelToolResult> {
        return safeCall(async () => {
            const res = await client.post<unknown>('/api/source-control/commit', { Message: options.input.message });
            return res.Data;
        });
    }
}

class VcsDiffTool implements vscode.LanguageModelTool<Record<string, never>> {
    async invoke(): Promise<vscode.LanguageModelToolResult> {
        return safeCall(async () => {
            const res = await client.get<unknown>('/api/source-control/diff');
            return res.Data;
        });
    }
}

class PipelineRunTool implements vscode.LanguageModelTool<{ pipeline: string }> {
    async invoke(options: vscode.LanguageModelToolInvocationOptions<{ pipeline: string }>): Promise<vscode.LanguageModelToolResult> {
        return safeCall(async () => {
            const res = await client.post<unknown>(`/api/pipelines/${enc(options.input.pipeline)}/run`);
            return res.Data;
        });
    }
}

class PipelineListTool implements vscode.LanguageModelTool<Record<string, never>> {
    async invoke(): Promise<vscode.LanguageModelToolResult> {
        return safeCall(async () => {
            const res = await client.get<unknown>('/api/pipelines');
            return res.Data;
        });
    }
}

class SearchCatalogTool implements vscode.LanguageModelTool<{ query: string }> {
    async invoke(options: vscode.LanguageModelToolInvocationOptions<{ query: string }>): Promise<vscode.LanguageModelToolResult> {
        return safeCall(async () => {
            const res = await client.post<unknown>('/api/catalog/search', { Query: options.input.query });
            return res.Data;
        });
    }
}

class AddDeviceTool implements vscode.LanguageModelTool<{ orderNumber: string; name?: string }> {
    async invoke(options: vscode.LanguageModelToolInvocationOptions<{ orderNumber: string; name?: string }>): Promise<vscode.LanguageModelToolResult> {
        return safeCall(async () => {
            const res = await client.post<unknown>('/api/projects/devices', {
                OrderNumber: options.input.orderNumber,
                Name: options.input.name,
            });
            return res.Data;
        });
    }
}

class GoOnlineTool implements vscode.LanguageModelTool<{ device: string }> {
    async invoke(options: vscode.LanguageModelToolInvocationOptions<{ device: string }>): Promise<vscode.LanguageModelToolResult> {
        return safeCall(async () => {
            const res = await client.post<unknown>(`/api/devices/${enc(options.input.device)}/online/connect`);
            return { success: res.Success, message: res.Message };
        });
    }
}

class GoOfflineTool implements vscode.LanguageModelTool<{ device: string }> {
    async invoke(options: vscode.LanguageModelToolInvocationOptions<{ device: string }>): Promise<vscode.LanguageModelToolResult> {
        return safeCall(async () => {
            const res = await client.post<unknown>(`/api/devices/${enc(options.input.device)}/online/disconnect`);
            return { success: res.Success, message: res.Message };
        });
    }
}

// ── Registration ─────────────────────────────────────────────────

export function registerLanguageModelTools(context: vscode.ExtensionContext): void {
    // Check if vscode.lm.registerTool is available (VS Code 1.96+)
    if (!vscode.lm?.registerTool) {
        log('[LM Tools] vscode.lm.registerTool not available — skipping Language Model Tools registration');
        return;
    }

    const tools: [string, vscode.LanguageModelTool<any>][] = [
        // Project
        ['tia_get_project_overview', new GetProjectOverviewTool()],
        ['tia_list_devices', new ListDevicesTool()],
        ['tia_save_project', new SaveProjectTool()],
        // Blocks
        ['tia_list_blocks', new ListBlocksTool()],
        ['tia_get_block_content', new GetBlockContentTool()],
        ['tia_get_block_source', new GetBlockSourceTool()],
        ['tia_create_block', new CreateBlockTool()],
        ['tia_import_scl', new ImportSclTool()],
        ['tia_export_block', new ExportBlockTool()],
        ['tia_delete_block', new DeleteBlockTool()],
        // Compilation
        ['tia_compile_device', new CompileDeviceTool()],
        ['tia_compile_block', new CompileBlockTool()],
        // Tags
        ['tia_list_tag_tables', new ListTagTablesTool()],
        ['tia_list_tags', new ListTagsTool()],
        ['tia_create_tag', new CreateTagTool()],
        // UDTs
        ['tia_list_udts', new ListUdtsTool()],
        // Cross-references
        ['tia_get_cross_references', new GetCrossReferencesTool()],
        // Online / Download
        ['tia_download_to_plc', new DownloadToPlcTool()],
        ['tia_go_online', new GoOnlineTool()],
        ['tia_go_offline', new GoOfflineTool()],
        // PLCSim
        ['tia_plcsim_status', new PlcSimStatusTool()],
        ['tia_plcsim_read_tag', new PlcSimReadTagTool()],
        ['tia_plcsim_write_tag', new PlcSimWriteTagTool()],
        // Tests
        ['tia_run_tests', new RunTestsTool()],
        // VCS
        ['tia_vcs_status', new VcsStatusTool()],
        ['tia_vcs_commit', new VcsCommitTool()],
        ['tia_vcs_diff', new VcsDiffTool()],
        // Pipelines
        ['tia_pipeline_list', new PipelineListTool()],
        ['tia_pipeline_run', new PipelineRunTool()],
        // Hardware
        ['tia_search_catalog', new SearchCatalogTool()],
        ['tia_add_device', new AddDeviceTool()],
    ];

    for (const [name, tool] of tools) {
        context.subscriptions.push(vscode.lm.registerTool(name, tool));
    }

    log(`[LM Tools] Registered ${tools.length} Language Model Tools`);
}
