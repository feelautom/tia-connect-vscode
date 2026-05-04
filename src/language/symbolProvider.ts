import * as vscode from 'vscode';
import { parseSclDocument } from './sclParser';

/**
 * Provides document symbols for the Outline view and Ctrl+Shift+O navigation.
 * Works for both SCL and STL files.
 */
export class SclDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
    provideDocumentSymbols(document: vscode.TextDocument): vscode.DocumentSymbol[] {
        const symbols: vscode.DocumentSymbol[] = [];
        const parsed = parseSclDocument(document.getText());

        // Block header as top-level symbol
        if (parsed.header) {
            const headerKind = this.getBlockSymbolKind(parsed.header.kind);
            const headerRange = new vscode.Range(parsed.header.line, 0, document.lineCount - 1, 0);
            const headerSelection = new vscode.Range(parsed.header.line, 0, parsed.header.line, 999);
            const blockSymbol = new vscode.DocumentSymbol(
                parsed.header.name,
                parsed.header.kind.replace(/_/g, ' '),
                headerKind,
                headerRange,
                headerSelection,
            );

            // Add variable sections as children
            const sectionSymbols = this.buildSectionSymbols(parsed, document);
            blockSymbol.children = sectionSymbols;

            symbols.push(blockSymbol);
        } else {
            // No header — just list variables flat
            for (const v of parsed.variables) {
                const range = new vscode.Range(v.line, 0, v.endLine, 999);
                const sym = new vscode.DocumentSymbol(
                    v.name,
                    v.dataType,
                    vscode.SymbolKind.Variable,
                    range,
                    range,
                );
                symbols.push(sym);
            }
        }

        return symbols;
    }

    private buildSectionSymbols(parsed: ReturnType<typeof parseSclDocument>, document: vscode.TextDocument): vscode.DocumentSymbol[] {
        const sections: vscode.DocumentSymbol[] = [];

        for (const region of parsed.regions) {
            const regionRange = new vscode.Range(region.startLine, 0, region.endLine, 999);
            const sectionSym = new vscode.DocumentSymbol(
                region.kind.replace(/_/g, ' '),
                '',
                vscode.SymbolKind.Namespace,
                regionRange,
                new vscode.Range(region.startLine, 0, region.startLine, 999),
            );

            // Add variables in this section as children
            const varsInSection = parsed.variables.filter(
                v => v.line > region.startLine && v.line < region.endLine
            );
            for (const v of varsInSection) {
                const varRange = new vscode.Range(v.line, 0, v.endLine, 999);
                const varSym = new vscode.DocumentSymbol(
                    v.name,
                    v.dataType,
                    vscode.SymbolKind.Variable,
                    varRange,
                    varRange,
                );
                sectionSym.children.push(varSym);
            }

            sections.push(sectionSym);
        }

        return sections;
    }

    private getBlockSymbolKind(kind: string): vscode.SymbolKind {
        switch (kind) {
            case 'FUNCTION_BLOCK': return vscode.SymbolKind.Class;
            case 'FUNCTION': return vscode.SymbolKind.Function;
            case 'DATA_BLOCK': return vscode.SymbolKind.Struct;
            case 'ORGANIZATION_BLOCK': return vscode.SymbolKind.Event;
            case 'TYPE': return vscode.SymbolKind.Struct;
            default: return vscode.SymbolKind.Module;
        }
    }
}
