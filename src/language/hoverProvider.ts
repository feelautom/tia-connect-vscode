import * as vscode from 'vscode';
import { parseSclDocument } from './sclParser';
import { SCL_KEYWORDS, SCL_TYPES, SCL_FUNCTIONS, SCL_SYSTEM_BLOCKS, STL_INSTRUCTIONS, KeywordInfo } from './sclKeywords';
import { searchDocs } from '../api/docs';

/**
 * Hover information for SCL/STL.
 * Shows type info for local variables, documentation for keywords/functions.
 * Falls back to the T-IA Connect documentation API for unknown symbols.
 */
export class SclHoverProvider implements vscode.HoverProvider {
    private readonly keywordMap: Map<string, KeywordInfo>;
    private readonly isStl: boolean;
    private readonly docsCache: Map<string, string | null> = new Map();

    constructor(isStl = false) {
        this.isStl = isStl;
        this.keywordMap = new Map();

        const all = isStl
            ? [...STL_INSTRUCTIONS, ...SCL_KEYWORDS, ...SCL_TYPES, ...SCL_SYSTEM_BLOCKS]
            : [...SCL_KEYWORDS, ...SCL_TYPES, ...SCL_FUNCTIONS, ...SCL_SYSTEM_BLOCKS];

        for (const kw of all) {
            this.keywordMap.set(kw.label.toUpperCase(), kw);
        }
    }

    async provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
    ): Promise<vscode.Hover | undefined> {
        const wordRange = document.getWordRangeAtPosition(position, /[#"]?[\w.]+["]?/);
        if (!wordRange) { return undefined; }

        let word = document.getText(wordRange);
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

        // Check keywords/types/functions/system blocks
        const kwInfo = this.keywordMap.get(word.toUpperCase());
        if (kwInfo) {
            const md = new vscode.MarkdownString();
            md.supportHtml = true;
            md.appendMarkdown(`**${kwInfo.label}** — ${kwInfo.detail}\n\n`);
            md.appendMarkdown(kwInfo.documentation);
            return new vscode.Hover(md, wordRange);
        }

        // Fallback: query T-IA Connect documentation API
        return this.fetchDocsHover(word, wordRange);
    }

    private async fetchDocsHover(word: string, range: vscode.Range): Promise<vscode.Hover | undefined> {
        const key = word.toUpperCase();

        // Check cache
        if (this.docsCache.has(key)) {
            const cached = this.docsCache.get(key);
            if (!cached) { return undefined; }
            const md = new vscode.MarkdownString(cached);
            md.supportHtml = true;
            return new vscode.Hover(md, range);
        }

        try {
            const results = await searchDocs(word);
            if (!results || results.length === 0) {
                this.docsCache.set(key, null);
                return undefined;
            }

            // Use the most relevant result
            const best = results[0];
            const content = `**${word}** — *T-IA Connect Docs*\n\n${best.Snippet}`;
            this.docsCache.set(key, content);

            const md = new vscode.MarkdownString(content);
            md.supportHtml = true;
            return new vscode.Hover(md, range);
        } catch {
            // Server not connected or error — cache miss as null
            this.docsCache.set(key, null);
            return undefined;
        }
    }
}
