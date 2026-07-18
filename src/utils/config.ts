import * as vscode from 'vscode';

const API_KEY_SECRET = 'tiaConnect.apiKey';
let apiKeyStorage: vscode.SecretStorage | undefined;
let cachedApiKey = '';

/**
 * Initializes API-key storage and migrates the legacy global setting once.
 * API keys are opaque secrets: their bytes are preserved exactly.
 */
export async function initializeApiKeyStorage(context: vscode.ExtensionContext): Promise<void> {
    apiKeyStorage = context.secrets;
    const storedKey = await apiKeyStorage.get(API_KEY_SECRET);
    const config = vscode.workspace.getConfiguration('tiaConnect');
    const legacyKey = vscode.workspace.isTrusted ? config.get<string>('apiKey', '') : '';
    const inspectedLegacy = vscode.workspace.isTrusted ? config.inspect<string>('apiKey') : undefined;

    if (storedKey !== undefined) {
        cachedApiKey = storedKey;
    } else if (legacyKey !== '') {
        await apiKeyStorage.store(API_KEY_SECRET, legacyKey);
        cachedApiKey = legacyKey;
    }

    if (inspectedLegacy?.globalValue !== undefined) {
        await config.update('apiKey', undefined, vscode.ConfigurationTarget.Global);
    }
    if (inspectedLegacy?.workspaceValue !== undefined) {
        await config.update('apiKey', undefined, vscode.ConfigurationTarget.Workspace);
    }
    if (inspectedLegacy?.workspaceFolderValue !== undefined) {
        await config.update('apiKey', undefined, vscode.ConfigurationTarget.WorkspaceFolder);
    }
}

export function getServerUrl(): string {
    return vscode.workspace.getConfiguration('tiaConnect').get<string>('serverUrl', 'http://localhost:9000');
}

export function getApiKey(): string {
    return cachedApiKey;
}

export async function setApiKey(key: string): Promise<void> {
    if (!apiKeyStorage) {
        throw new Error('API key storage has not been initialized.');
    }

    if (key === '') {
        await apiKeyStorage.delete(API_KEY_SECRET);
    } else {
        await apiKeyStorage.store(API_KEY_SECRET, key);
    }
    cachedApiKey = key;
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
