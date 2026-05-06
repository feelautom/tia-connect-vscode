import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getServerUrl, getApiKey, getAutoConfigureMcp } from './config';
import { log } from '../views/outputChannel';

/**
 * Ensures .vscode/mcp.json contains the T-IA Connect MCP server entry.
 * Called when a project is loaded so GitHub Copilot Chat can use TIA tools.
 */
export async function ensureMcpConfig(): Promise<void> {
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
    };
    if (apiKey) {
        tiaEntry.headers = { 'X-API-Key': apiKey };
    }

    let config: Record<string, unknown> = {};

    // Read existing file
    if (fs.existsSync(mcpFilePath)) {
        try {
            const raw = fs.readFileSync(mcpFilePath, 'utf-8');
            config = JSON.parse(raw);
        } catch {
            // Malformed JSON — overwrite
            log('mcp.json malformed, recreating');
        }
    }

    // Merge
    if (!config.servers || typeof config.servers !== 'object') {
        config.servers = {};
    }
    (config.servers as Record<string, unknown>)['tia-connect'] = tiaEntry;

    // Write
    if (!fs.existsSync(vscodeDir)) {
        fs.mkdirSync(vscodeDir, { recursive: true });
    }
    fs.writeFileSync(mcpFilePath, JSON.stringify(config, null, 2), 'utf-8');
    log('MCP config written to .vscode/mcp.json');
}
