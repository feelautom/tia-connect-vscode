import * as vscode from 'vscode';

const EXTENSION_ID = 'FEELAUTOM.tia-connect-vscode';

export function getExtensionVersion(): string {
    try {
        return normalizeVersion(vscode.extensions.getExtension(EXTENSION_ID)?.packageJSON?.version);
    } catch {
        return 'unknown';
    }
}

export function getClientId(): string {
    return `vscode/${getExtensionVersion()}`;
}

export function getClientIdentityHeaders(): Record<string, string> {
    return { 'X-Client-Id': getClientId() };
}

function normalizeVersion(value: unknown): string {
    return typeof value === 'string' && /^[0-9A-Za-z][0-9A-Za-z.+-]{0,31}$/.test(value)
        ? value
        : 'unknown';
}
