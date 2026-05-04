import * as vscode from 'vscode';
import { parseSclDocument, parseStlDocument } from './sclParser';
import { SCL_KEYWORDS, SCL_TYPES, SCL_FUNCTIONS, STL_INSTRUCTIONS, KeywordInfo } from './sclKeywords';

export class SclCompletionProvider implements vscode.CompletionItemProvider {
    provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
    ): vscode.CompletionItem[] {
        const items: vscode.CompletionItem[] = [];
        const lineText = document.lineAt(position.line).text;
        const textBefore = lineText.substring(0, position.character);

        // Get local variables from current document
        const parsed = parseSclDocument(document.getText());

        // Add local variables
        for (const v of parsed.variables) {
            const item = new vscode.CompletionItem(v.name, vscode.CompletionItemKind.Variable);
            item.detail = `${v.section}: ${v.dataType}`;
            item.documentation = v.comment || `${v.section} variable (line ${v.line + 1})`;
            item.sortText = '0' + v.name; // Variables first
            items.push(item);
        }

        // Add keywords
        for (const kw of SCL_KEYWORDS) {
            items.push(toCompletionItem(kw, '1'));
        }

        // Add types (suggest when after ':' or in type position)
        const afterColon = /:\s*\w*$/.test(textBefore);
        if (afterColon) {
            for (const t of SCL_TYPES) {
                const item = toCompletionItem(t, '0');
                items.push(item);
            }
        } else {
            for (const t of SCL_TYPES) {
                items.push(toCompletionItem(t, '2'));
            }
        }

        // Add built-in functions
        for (const fn of SCL_FUNCTIONS) {
            items.push(toCompletionItem(fn, '2'));
        }

        return items;
    }
}

export class StlCompletionProvider implements vscode.CompletionItemProvider {
    provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
    ): vscode.CompletionItem[] {
        const items: vscode.CompletionItem[] = [];

        // STL instructions
        for (const instr of STL_INSTRUCTIONS) {
            items.push(toCompletionItem(instr, '0'));
        }

        // Also parse variables from header
        const parsed = parseStlDocument(document.getText());
        for (const v of parsed.variables) {
            const item = new vscode.CompletionItem(v.name, vscode.CompletionItemKind.Variable);
            item.detail = `${v.section}: ${v.dataType}`;
            item.sortText = '0' + v.name;
            items.push(item);
        }

        // Types for VAR sections
        for (const t of SCL_TYPES) {
            items.push(toCompletionItem(t, '2'));
        }

        return items;
    }
}

function toCompletionItem(info: KeywordInfo, sortPrefix: string): vscode.CompletionItem {
    let kind: vscode.CompletionItemKind;
    switch (info.kind) {
        case 'keyword': kind = vscode.CompletionItemKind.Keyword; break;
        case 'type': kind = vscode.CompletionItemKind.TypeParameter; break;
        case 'function': kind = vscode.CompletionItemKind.Function; break;
        case 'constant': kind = vscode.CompletionItemKind.Constant; break;
        case 'snippet': kind = vscode.CompletionItemKind.Snippet; break;
        default: kind = vscode.CompletionItemKind.Text;
    }

    const item = new vscode.CompletionItem(info.label, kind);
    item.detail = info.detail;
    item.documentation = new vscode.MarkdownString(info.documentation);
    item.sortText = sortPrefix + info.label;

    if (info.insertText) {
        item.insertText = new vscode.SnippetString(info.insertText);
    }

    return item;
}
