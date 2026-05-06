import * as vscode from 'vscode';
import { CompilationMessage } from '../api/types';
import { mapDiagnostics } from '../utils/diagnosticMapper';

let diagnosticCollection: vscode.DiagnosticCollection;

export function createDiagnostics(): vscode.DiagnosticCollection {
    diagnosticCollection = vscode.languages.createDiagnosticCollection('tiaConnect');
    return diagnosticCollection;
}

/**
 * Update diagnostics for a file based on compilation messages.
 * Tries to map errors to precise line numbers when possible.
 */
export function updateDiagnostics(fileUri: vscode.Uri, messages: CompilationMessage[], sourceCode?: string): void {
    if (!diagnosticCollection) { return; }

    // If no source code provided, try to read from the open editor
    if (!sourceCode) {
        const doc = vscode.workspace.textDocuments.find(d => d.uri.toString() === fileUri.toString());
        if (doc) {
            sourceCode = doc.getText();
        }
    }

    const mapped = mapDiagnostics(messages, sourceCode);

    const diagnostics: vscode.Diagnostic[] = mapped.map(m => {
        const severity = m.severity === 'Error'
            ? vscode.DiagnosticSeverity.Error
            : m.severity === 'Warning'
                ? vscode.DiagnosticSeverity.Warning
                : vscode.DiagnosticSeverity.Information;

        const range = new vscode.Range(m.line, m.column, m.line, m.column);

        const diag = new vscode.Diagnostic(range, m.message, severity);
        diag.source = 'T-IA Connect';
        if (m.path) {
            diag.code = m.path;
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
