import * as vscode from 'vscode';
import { parseSclDocument } from './sclParser';

/**
 * Go-to-definition for SCL/STL variables and cross-file block references.
 * - Local variables: navigates to the VAR section declaration
 * - Block names (quoted): opens the block via T-IA Connect API
 */
export class SclDefinitionProvider implements vscode.DefinitionProvider {
    async provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position,
    ): Promise<vscode.Definition | undefined> {
        const wordRange = document.getWordRangeAtPosition(position, /[#"]?[\w.]+["]?/);
        if (!wordRange) { return undefined; }

        let word = document.getText(wordRange);
        const wasQuoted = word.startsWith('"') && word.endsWith('"');

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

        // Cross-file: if the word was quoted (e.g. "FB_Motor"), try to open the block
        if (wasQuoted && word !== parsed.header?.name) {
            vscode.commands.executeCommand('tiaConnect.openBlock', { blockName: word });
            return undefined;
        }

        return undefined;
    }
}
