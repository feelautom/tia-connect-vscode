import * as vscode from 'vscode';
import { parseSclDocument } from './sclParser';

/**
 * Go-to-definition for SCL/STL variables.
 * Navigates to the VAR section where the variable is declared.
 */
export class SclDefinitionProvider implements vscode.DefinitionProvider {
    provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
    ): vscode.Definition | undefined {
        const wordRange = document.getWordRangeAtPosition(position, /[#"]?[\w.]+["]?/);
        if (!wordRange) { return undefined; }

        let word = document.getText(wordRange);

        // Strip leading # (local variable prefix) and surrounding quotes
        word = word.replace(/^#/, '').replace(/^"|"$/g, '');

        const parsed = parseSclDocument(document.getText());

        // Search in declared variables
        const variable = parsed.variables.find(
            v => v.name.toLowerCase() === word.toLowerCase()
        );

        if (variable) {
            return new vscode.Location(
                document.uri,
                new vscode.Position(variable.line, 0),
            );
        }

        // Check if it's the block name itself
        if (parsed.header && parsed.header.name.toLowerCase() === word.toLowerCase()) {
            return new vscode.Location(
                document.uri,
                new vscode.Position(parsed.header.line, 0),
            );
        }

        return undefined;
    }
}
