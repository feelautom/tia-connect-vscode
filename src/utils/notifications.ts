import * as vscode from 'vscode';
import { createHash } from 'crypto';

const DEFAULT_DEDUPLICATION_WINDOW_MS = 10_000;
const lastShownAt = new Map<string, number>();

function shouldShow(kind: string, message: string, now: number, windowMs: number): boolean {
    for (const [storedKey, shownAt] of lastShownAt) {
        if (now - shownAt >= windowMs) { lastShownAt.delete(storedKey); }
    }
    const key = createHash('sha256')
        .update(kind, 'utf8')
        .update('\0', 'utf8')
        .update(message, 'utf8')
        .digest('hex');
    const previous = lastShownAt.get(key);
    if (previous !== undefined && now - previous < windowMs) {
        return false;
    }
    lastShownAt.set(key, now);
    return true;
}

export function showDeduplicatedError(
    message: string,
    windowMs = DEFAULT_DEDUPLICATION_WINDOW_MS,
): Thenable<string | undefined> | undefined {
    if (!shouldShow('error', message, Date.now(), windowMs)) { return undefined; }
    return vscode.window.showErrorMessage(message);
}

export function showDeduplicatedWarning(
    message: string,
    windowMs = DEFAULT_DEDUPLICATION_WINDOW_MS,
): Thenable<string | undefined> | undefined {
    if (!shouldShow('warning', message, Date.now(), windowMs)) { return undefined; }
    return vscode.window.showWarningMessage(message);
}

export function showBackgroundStatus(message: string, timeoutMs = 5_000): vscode.Disposable {
    return vscode.window.setStatusBarMessage(`$(check) ${message}`, timeoutMs);
}

export function resetNotificationDeduplicationForTests(): void {
    lastShownAt.clear();
}
