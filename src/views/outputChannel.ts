import * as vscode from 'vscode';
import { OUTPUT_CHANNEL_NAME } from '../utils/constants';

let channel: vscode.OutputChannel;
const isDev = process.env.NODE_ENV === 'development' || process.env.VSCODE_DEBUG_MODE === 'true';

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

/** Verbose log — only shown in dev/debug mode */
export function debug(message: string): void {
    if (!isDev) { return; }
    const ts = new Date().toLocaleTimeString();
    getOutputChannel().appendLine(`[${ts}] [DEBUG] ${message}`);
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
