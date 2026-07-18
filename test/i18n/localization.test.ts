import * as fs from 'fs';
import * as path from 'path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

function sourceFiles(directory: string): string[] {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory()) { return sourceFiles(fullPath); }
        return entry.name.endsWith('.ts') ? [fullPath] : [];
    });
}

function visitSources(visitor: (node: ts.Node, source: ts.SourceFile) => void): void {
    for (const file of sourceFiles(path.resolve('src'))) {
        const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true);
        const visit = (node: ts.Node): void => {
            visitor(node, source);
            ts.forEachChild(node, visit);
        };
        visit(source);
    }
}

describe('runtime localization inventory', () => {
    it('has a French translation for every literal vscode.l10n key', () => {
        const used = new Set<string>();
        visitSources((node, source) => {
            if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) { return; }
            if (node.expression.name.text !== 't' || !node.expression.expression.getText(source).endsWith('l10n')) { return; }
            const first = node.arguments[0];
            if (first && ts.isStringLiteralLike(first)) { used.add(first.text); }
        });

        const french = JSON.parse(fs.readFileSync(path.resolve('l10n/bundle.l10n.fr.json'), 'utf8')) as Record<string, string>;
        const missing = [...used].filter(key => !(key in french)).sort();
        expect(missing).toEqual([]);
    });

    it('does not pass hard-coded human text directly to VS Code notifications', () => {
        const violations: string[] = [];
        visitSources((node, source) => {
            if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)) { return; }
            if (!/^show(Information|Warning|Error)Message$/.test(node.expression.name.text)) { return; }
            const first = node.arguments[0];
            if (!first) { return; }
            const directLiteral = ts.isStringLiteralLike(first) && /[A-Za-zÀ-ÿ]/.test(first.text);
            const templateText = ts.isTemplateExpression(first)
                ? [first.head.text, ...first.templateSpans.map(span => span.literal.text)].join('')
                : '';
            if (directLiteral || /[A-Za-zÀ-ÿ]/.test(templateText)) {
                const position = source.getLineAndCharacterOfPosition(node.getStart(source));
                violations.push(`${path.relative(process.cwd(), source.fileName)}:${position.line + 1}`);
            }
        });
        expect(violations).toEqual([]);
    });
});
