import * as vscode from 'vscode';
import { parseSclDocument } from './sclParser';
import { SCL_KEYWORDS, SCL_TYPES, SCL_FUNCTIONS, STL_INSTRUCTIONS, KeywordInfo } from './sclKeywords';

/**
 * Hover information for SCL/STL.
 * Shows type info for local variables, documentation for keywords/functions.
 */
export class SclHoverProvider implements vscode.HoverProvider {
    private readonly keywordMap: Map<string, KeywordInfo>;
    private readonly isStl: boolean;

    constructor(isStl = false) {
        this.isStl = isStl;
        this.keywordMap = new Map();

        const all = isStl
            ? [...STL_INSTRUCTIONS, ...SCL_KEYWORDS, ...SCL_TYPES]
            : [...SCL_KEYWORDS, ...SCL_TYPES, ...SCL_FUNCTIONS];

        for (const kw of all) {
            this.keywordMap.set(kw.label.toUpperCase(), kw);
        }
    }

    provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
    ): vscode.Hover | undefined {
        const wordRange = document.getWordRangeAtPosition(position, /[#"]?[\w.]+["]?/);
        if (!wordRange) { return undefined; }

        let word = document.getText(wordRange);
        const rawWord = word;
        word = word.replace(/^#/, '').replace(/^"|"$/g, '');

        // Check local variables first
        const parsed = parseSclDocument(document.getText());
        const variable = parsed.variables.find(
            v => v.name.toLowerCase() === word.toLowerCase()
        );

        if (variable) {
            const md = new vscode.MarkdownString();
            md.appendCodeblock(
                `${variable.name} : ${variable.dataType}`,
                'scl'
            );
            md.appendMarkdown(`\n\n**Section:** ${variable.section}`);
            if (variable.initialValue) {
                md.appendMarkdown(`\n\n**Initial value:** \`${variable.initialValue}\``);
            }
            if (variable.comment) {
                md.appendMarkdown(`\n\n${variable.comment}`);
            }
            return new vscode.Hover(md, wordRange);
        }

        // Check block header
        if (parsed.header && parsed.header.name.toLowerCase() === word.toLowerCase()) {
            const md = new vscode.MarkdownString();
            const kind = parsed.header.kind.replace(/_/g, ' ');
            md.appendCodeblock(`${kind} "${parsed.header.name}"`, 'scl');
            if (parsed.header.returnType) {
                md.appendMarkdown(`\n\n**Return type:** \`${parsed.header.returnType}\``);
            }
            return new vscode.Hover(md, wordRange);
        }

        // Check keywords/types/functions
        const kwInfo = this.keywordMap.get(word.toUpperCase());
        if (kwInfo) {
            const md = new vscode.MarkdownString();
            md.appendMarkdown(`**${kwInfo.label}** — ${kwInfo.detail}\n\n`);
            md.appendMarkdown(kwInfo.documentation);
            return new vscode.Hover(md, wordRange);
        }

        return undefined;
    }
}
