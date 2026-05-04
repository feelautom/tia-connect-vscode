import * as vscode from 'vscode';

export function getServerUrl(): string {
    return vscode.workspace.getConfiguration('tiaConnect').get<string>('serverUrl', 'http://localhost:9000');
}

export function getApiKey(): string {
    return vscode.workspace.getConfiguration('tiaConnect').get<string>('apiKey', '');
}

export function getAutoReimport(): boolean {
    return vscode.workspace.getConfiguration('tiaConnect').get<boolean>('autoReimportOnSave', true);
}

export function getAutoCompile(): boolean {
    return vscode.workspace.getConfiguration('tiaConnect').get<boolean>('autoCompileOnReimport', false);
}
