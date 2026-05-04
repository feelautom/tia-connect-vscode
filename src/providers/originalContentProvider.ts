import * as vscode from 'vscode';
import { ORIGINAL_SCHEME } from '../utils/constants';

/**
 * Provides the "original" content of block files for QuickDiff gutter decorations.
 * When a block is opened from TIA Portal, its initial content is stored here.
 * VS Code compares the current editor content with this original to show inline diffs.
 */
export class OriginalContentProvider implements vscode.TextDocumentContentProvider {
    private originals = new Map<string, string>();

    /** Store the original content for a file */
    setOriginal(fsPath: string, content: string): void {
        this.originals.set(fsPath, content);
    }

    /** Remove stored original (e.g., after successful reimport) */
    clearOriginal(fsPath: string): void {
        this.originals.delete(fsPath);
    }

    /** Check if we have an original for this file */
    hasOriginal(fsPath: string): boolean {
        return this.originals.has(fsPath);
    }

    /** Build the original URI for a given file path */
    static toOriginalUri(fsPath: string): vscode.Uri {
        return vscode.Uri.from({ scheme: ORIGINAL_SCHEME, path: fsPath });
    }

    provideTextDocumentContent(uri: vscode.Uri): string {
        return this.originals.get(uri.path) || '';
    }
}
