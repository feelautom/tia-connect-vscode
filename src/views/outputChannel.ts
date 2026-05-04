import * as vscode from 'vscode';
import { OUTPUT_CHANNEL_NAME } from '../utils/constants';

let channel: vscode.OutputChannel;

export function getOutputChannel(): vscode.OutputChannel {
    if (!channel) {
        channel = vscode.window.createOutputChannel(OUTPUT_CHANNEL_NAME);
    }
    return channel;
}

export function log(message: string): void {
    const ts = new Date().toLocaleTimeString();
    getOutputChannel().appendLine(`[${ts}] ${message}`);
}

export function logError(message: string, error?: unknown): void {
    const ts = new Date().toLocaleTimeString();
    const errMsg = error instanceof Error ? error.message : String(error ?? '');
    getOutputChannel().appendLine(`[${ts}] ERROR: ${message}${errMsg ? ' - ' + errMsg : ''}`);
}

/** Reveal the output channel panel */
export function showOutput(): void {
    getOutputChannel().show(true);
}
