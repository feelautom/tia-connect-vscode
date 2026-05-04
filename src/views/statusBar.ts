import * as vscode from 'vscode';
import { COMMANDS } from '../utils/constants';

let statusBarItem: vscode.StatusBarItem;

export function createStatusBar(): vscode.StatusBarItem {
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.text = '$(plug) T-IA Connect';
    statusBarItem.tooltip = 'Click to connect to T-IA Connect server';
    statusBarItem.command = COMMANDS.connect;
    statusBarItem.show();
    return statusBarItem;
}

export function setConnected(projectName?: string): void {
    if (!statusBarItem) { return; }
    const label = projectName ? `T-IA: ${projectName}` : 'T-IA Connect';
    statusBarItem.text = `$(check) ${label}`;
    statusBarItem.tooltip = `Connected${projectName ? ` - ${projectName}` : ''}`;
    statusBarItem.command = COMMANDS.disconnect;
    statusBarItem.backgroundColor = undefined;
}

export function setDisconnected(): void {
    if (!statusBarItem) { return; }
    statusBarItem.text = '$(plug) T-IA Connect';
    statusBarItem.tooltip = 'Click to connect to T-IA Connect server';
    statusBarItem.command = COMMANDS.connect;
    statusBarItem.backgroundColor = undefined;
}

export function setError(message: string): void {
    if (!statusBarItem) { return; }
    statusBarItem.text = '$(error) T-IA Connect';
    statusBarItem.tooltip = message;
    statusBarItem.command = COMMANDS.connect;
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
}

export function disposeStatusBar(): void {
    statusBarItem?.dispose();
}
