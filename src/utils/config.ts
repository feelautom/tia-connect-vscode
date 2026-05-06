import * as vscode from 'vscode';

export function getServerUrl(): string {
    return vscode.workspace.getConfiguration('tiaConnect').get<string>('serverUrl', 'http://localhost:9000');
}

export function getApiKey(): string {
    return vscode.workspace.getConfiguration('tiaConnect').get<string>('apiKey', '');
}

export async function setApiKey(key: string): Promise<void> {
    await vscode.workspace.getConfiguration('tiaConnect').update('apiKey', key, vscode.ConfigurationTarget.Global);
}

export function getAutoReimport(): boolean {
    return vscode.workspace.getConfiguration('tiaConnect').get<boolean>('autoReimportOnSave', true);
}

export function getAutoCompile(): boolean {
    return vscode.workspace.getConfiguration('tiaConnect').get<boolean>('autoCompileOnReimport', false);
}

/** Auto-save interval in minutes (0 = disabled) */
export function getAutoSaveInterval(): number {
    return vscode.workspace.getConfiguration('tiaConnect').get<number>('autoSaveInterval', 5);
}

/** List of block names excluded from auto-reimport */
export function getExcludeFromReimport(): string[] {
    return vscode.workspace.getConfiguration('tiaConnect').get<string[]>('excludeFromReimport', []);
}

/** Whether to auto-configure MCP in .vscode/mcp.json for GitHub Copilot */
export function getAutoConfigureMcp(): boolean {
    return vscode.workspace.getConfiguration('tiaConnect').get<boolean>('autoConfigureMcp', true);
}
