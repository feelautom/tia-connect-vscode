import * as vscode from 'vscode';
import { CompilationMessage } from '../api/types';

let diagnosticCollection: vscode.DiagnosticCollection;

export function createDiagnostics(): vscode.DiagnosticCollection {
    diagnosticCollection = vscode.languages.createDiagnosticCollection('tiaConnect');
    return diagnosticCollection;
}

/**
 * Update diagnostics for a file based on compilation messages.
 * Maps compilation errors to the open editor if possible.
 */
export function updateDiagnostics(fileUri: vscode.Uri, messages: CompilationMessage[]): void {
    if (!diagnosticCollection) { return; }

    const diagnostics: vscode.Diagnostic[] = messages.map(msg => {
        const severity = msg.ErrorLevel === 'Error'
            ? vscode.DiagnosticSeverity.Error
            : msg.ErrorLevel === 'Warning'
                ? vscode.DiagnosticSeverity.Warning
                : vscode.DiagnosticSeverity.Information;

        // TIA Portal doesn't provide line numbers in compilation messages,
        // so we place diagnostics at line 0
        const range = new vscode.Range(0, 0, 0, 0);

        const diag = new vscode.Diagnostic(range, msg.Description, severity);
        diag.source = 'T-IA Connect';
        if (msg.Path) {
            diag.code = msg.Path;
        }
        return diag;
    });

    diagnosticCollection.set(fileUri, diagnostics);
}

/** Clear all diagnostics for a file */
export function clearDiagnostics(fileUri: vscode.Uri): void {
    diagnosticCollection?.delete(fileUri);
}

/** Clear all diagnostics */
export function clearAllDiagnostics(): void {
    diagnosticCollection?.clear();
}

export function disposeDiagnostics(): void {
    diagnosticCollection?.dispose();
}
