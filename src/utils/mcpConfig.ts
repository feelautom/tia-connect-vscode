import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getServerUrl, getApiKey, getAutoConfigureMcp } from './config';
import { log } from '../views/outputChannel';
import { getClientId } from '../api/clientIdentity';
import { normalizeTelemetryError, trackTelemetry } from '../telemetry/telemetry';
import { isWorkspaceTrusted } from '../security/workspaceTrust';

/**
 * Ensures .vscode/mcp.json contains the T-IA Connect MCP server entry.
 * Called when a project is loaded so GitHub Copilot Chat can use TIA tools.
 */
export async function ensureMcpConfig(): Promise<void> {
    if (!isWorkspaceTrusted()) { return; }
    if (!getAutoConfigureMcp()) { return; }

    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) { return; }

    const workspaceRoot = folders[0].uri.fsPath;
    const vscodeDir = path.join(workspaceRoot, '.vscode');
    const mcpFilePath = path.join(vscodeDir, 'mcp.json');

    const serverUrl = getServerUrl();
    const apiKey = getApiKey();

    const tiaEntry: Record<string, unknown> = {
        type: 'sse',
        url: `${serverUrl}/mcp/sse`,
        headers: { 'X-Client-Id': getClientId() },
    };
    if (apiKey) {
        // VS Code prompts for the key at runtime; the secret is never written to the workspace.
        (tiaEntry.headers as Record<string, string>)['X-API-Key'] = '${input:tiaConnectApiKey}';
    }

    let config: Record<string, unknown> = {};

    try {
        // Read existing file
        if (fs.existsSync(mcpFilePath)) {
            const raw = fs.readFileSync(mcpFilePath, 'utf-8');
            config = JSON.parse(raw);
        }

        // Merge
        if (!config.servers || typeof config.servers !== 'object') {
            config.servers = {};
        }
        (config.servers as Record<string, unknown>)['tia-connect'] = tiaEntry;

        if (apiKey) {
            if (config.inputs !== undefined && !Array.isArray(config.inputs)) {
                log('MCP config not changed: existing inputs property is not an array.');
                vscode.window.showErrorMessage('T-IA Connect: .vscode/mcp.json has an invalid inputs property and was left unchanged.');
                throw new Error('Cannot update MCP configuration: inputs must be an array.');
            }
            const existingInputs = config.inputs ?? [];
            config.inputs = [
                ...existingInputs.filter(input => {
                    return !input || typeof input !== 'object' || (input as Record<string, unknown>).id !== 'tiaConnectApiKey';
                }),
                {
                    id: 'tiaConnectApiKey',
                    type: 'promptString',
                    description: 'T-IA Connect local API key',
                    password: true,
                },
            ];
        }

        // Write
        if (!fs.existsSync(vscodeDir)) {
            fs.mkdirSync(vscodeDir, { recursive: true });
        }
        const tempPath = `${mcpFilePath}.${process.pid}.${Date.now()}.tmp`;
        fs.writeFileSync(tempPath, JSON.stringify(config, null, 2), { encoding: 'utf-8', flag: 'wx' });
        fs.renameSync(tempPath, mcpFilePath);
        log('MCP config written to .vscode/mcp.json');
        void trackTelemetry('VSCode_McpConfigured', { success: true, mode: 'MCP' });
    } catch (err) {
        const malformed = err instanceof SyntaxError;
        if (malformed) {
            log('MCP config not changed: existing .vscode/mcp.json is malformed.');
            vscode.window.showErrorMessage('T-IA Connect: .vscode/mcp.json is malformed and was left unchanged.');
        }
        void trackTelemetry('VSCode_McpConfigurationFailed', {
            success: false,
            mode: 'MCP',
            errorCode: malformed ? 'invalid_response' : normalizeTelemetryError(err),
        });
        if (malformed) {
            throw new Error(`Cannot update malformed MCP configuration: ${err}`);
        }
        throw err;
    }
}
