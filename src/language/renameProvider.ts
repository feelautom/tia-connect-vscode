import * as vscode from 'vscode';
import { parseSclDocument } from './sclParser';

/**
 * Rename symbol provider for SCL/STL.
 * Renames local variables throughout the current file,
 * handling both #prefixed and bare references.
 */
export class SclRenameProvider implements vscode.RenameProvider {
    prepareRename(
        document: vscode.TextDocument,
        position: vscode.Position,
    ): vscode.Range | { range: vscode.Range; placeholder: string } | undefined {
        const wordRange = document.getWordRangeAtPosition(position, /[#]?[\w]+/);
        if (!wordRange) { return undefined; }

        let word = document.getText(wordRange);
        word = word.replace(/^#/, '');

        const parsed = parseSclDocument(document.getText());
        const variable = parsed.variables.find(
            v => v.name.toLowerCase() === word.toLowerCase()
        );

        if (!variable) {
            throw new Error(`"${word}" is not a renameable symbol in this file.`);
        }

        // Return the range without the # prefix for the rename input
        const start = wordRange.start;
        const adjustedStart = document.getText(wordRange).startsWith('#')
            ? start.translate(0, 1)
            : start;

        return {
            range: new vscode.Range(adjustedStart, wordRange.end),
            placeholder: variable.name,
        };
    }

    provideRenameEdits(
        document: vscode.TextDocument,
        position: vscode.Position,
        newName: string,
    ): vscode.WorkspaceEdit | undefined {
        const wordRange = document.getWordRangeAtPosition(position, /[#]?[\w]+/);
        if (!wordRange) { return undefined; }

        let word = document.getText(wordRange);
        word = word.replace(/^#/, '');

        const parsed = parseSclDocument(document.getText());
        const variable = parsed.variables.find(
            v => v.name.toLowerCase() === word.toLowerCase()
        );
        if (!variable) { return undefined; }

        const edit = new vscode.WorkspaceEdit();
        const text = document.getText();

        // Find all occurrences of the variable name (with or without # prefix)
        // Match: #varName or standalone varName (as whole word)
        const escapedName = escapeRegex(variable.name);
        const pattern = new RegExp(`(#?)\\b${escapedName}\\b`, 'gi');

        let match: RegExpExecArray | null;
        while ((match = pattern.exec(text)) !== null) {
            const startPos = document.positionAt(match.index);
            const line = document.lineAt(startPos.line).text;

            // Skip if inside a comment
            const commentIdx = line.indexOf('//');
            if (commentIdx >= 0 && startPos.character >= commentIdx) { continue; }

            // Skip if inside a string literal
            if (isInsideString(line, startPos.character)) { continue; }

            const hasHash = match[1] === '#';
            const nameStart = hasHash ? match.index + 1 : match.index;
            const nameEnd = nameStart + variable.name.length;

            edit.replace(
                document.uri,
                new vscode.Range(
                    document.positionAt(nameStart),
                    document.positionAt(nameEnd),
                ),
                newName,
            );
        }

        return edit;
    }
}

function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isInsideString(line: string, charIndex: number): boolean {
    let inString = false;
    for (let i = 0; i < charIndex && i < line.length; i++) {
        if (line[i] === "'") { inString = !inString; }
    }
    return inString;
}
