import * as vscode from 'vscode';

const DIAGNOSTIC_SOURCE = 'SCL';

// Pairs of opening/closing keywords
const BLOCK_PAIRS: [RegExp, RegExp, string][] = [
    [/^\s*IF\b/i, /\bEND_IF\s*;/i, 'END_IF'],
    [/^\s*CASE\b/i, /\bEND_CASE\s*;/i, 'END_CASE'],
    [/^\s*FOR\b/i, /\bEND_FOR\s*;/i, 'END_FOR'],
    [/^\s*WHILE\b/i, /\bEND_WHILE\s*;/i, 'END_WHILE'],
    [/^\s*REPEAT\b/i, /\bEND_REPEAT\s*;/i, 'END_REPEAT'],
];

const SECTION_START_RE = /^\s*(VAR_INPUT|VAR_OUTPUT|VAR_IN_OUT|VAR_TEMP|VAR_STATIC|VAR_CONSTANT|VAR)\b/i;
const SECTION_END_RE = /^\s*END_VAR\b/i;
const BLOCK_HEADER_RE = /^\s*(FUNCTION_BLOCK|FUNCTION|DATA_BLOCK|ORGANIZATION_BLOCK|TYPE)\b/i;
const BLOCK_END_RE = /^\s*(END_FUNCTION_BLOCK|END_FUNCTION|END_DATA_BLOCK|END_ORGANIZATION_BLOCK|END_TYPE)\b/i;

export function createSclDiagnostics(context: vscode.ExtensionContext): vscode.DiagnosticCollection {
    const collection = vscode.languages.createDiagnosticCollection('scl-syntax');

    const updateDiagnostics = (document: vscode.TextDocument) => {
        if (document.languageId !== 'scl') {
            collection.delete(document.uri);
            return;
        }
        collection.set(document.uri, analyzeSclDocument(document));
    };

    // Run on open and change
    context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument(updateDiagnostics),
        vscode.workspace.onDidChangeTextDocument(e => updateDiagnostics(e.document)),
        vscode.workspace.onDidCloseTextDocument(doc => collection.delete(doc.uri)),
        collection,
    );

    // Analyze already open documents
    for (const doc of vscode.workspace.textDocuments) {
        updateDiagnostics(doc);
    }

    return collection;
}

function analyzeSclDocument(document: vscode.TextDocument): vscode.Diagnostic[] {
    const diagnostics: vscode.Diagnostic[] = [];
    const text = document.getText();
    const lines = text.split(/\r?\n/);

    checkUnmatchedSections(lines, diagnostics);
    checkUnmatchedBlockEnds(lines, diagnostics);
    checkUnmatchedParentheses(lines, diagnostics);
    checkControlFlowBlocks(lines, diagnostics);

    return diagnostics;
}

function checkUnmatchedSections(lines: string[], diagnostics: vscode.Diagnostic[]): void {
    const openSections: { name: string; line: number }[] = [];

    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        // Skip comments
        if (trimmed.startsWith('//')) { continue; }

        const startMatch = trimmed.match(SECTION_START_RE);
        if (startMatch) {
            openSections.push({ name: startMatch[1], line: i });
            continue;
        }

        if (SECTION_END_RE.test(trimmed)) {
            if (openSections.length > 0) {
                openSections.pop();
            } else {
                diagnostics.push(new vscode.Diagnostic(
                    new vscode.Range(i, 0, i, trimmed.length),
                    'END_VAR without matching VAR section',
                    vscode.DiagnosticSeverity.Error,
                ));
            }
        }
    }

    for (const open of openSections) {
        diagnostics.push(new vscode.Diagnostic(
            new vscode.Range(open.line, 0, open.line, lines[open.line].length),
            `${open.name} section is not closed (missing END_VAR)`,
            vscode.DiagnosticSeverity.Error,
        ));
    }
}

function checkUnmatchedBlockEnds(lines: string[], diagnostics: vscode.Diagnostic[]): void {
    let blockHeader: { kind: string; line: number } | null = null;
    let foundEnd = false;

    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();
        if (trimmed.startsWith('//')) { continue; }

        const headerMatch = trimmed.match(BLOCK_HEADER_RE);
        if (headerMatch) {
            blockHeader = { kind: headerMatch[1].toUpperCase(), line: i };
            continue;
        }

        if (BLOCK_END_RE.test(trimmed)) {
            foundEnd = true;
        }
    }

    if (blockHeader && !foundEnd) {
        const expectedEnd = `END_${blockHeader.kind}`;
        diagnostics.push(new vscode.Diagnostic(
            new vscode.Range(blockHeader.line, 0, blockHeader.line, lines[blockHeader.line].length),
            `Block is not closed (missing ${expectedEnd})`,
            vscode.DiagnosticSeverity.Error,
        ));
    }
}

function checkUnmatchedParentheses(lines: string[], diagnostics: vscode.Diagnostic[]): void {
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Skip comment lines
        if (line.trim().startsWith('//')) { continue; }

        // Remove string literals and comments before counting
        const cleaned = line
            .replace(/'[^']*'/g, '')  // Remove string literals
            .replace(/\/\/.*$/, '');    // Remove line comments

        let depth = 0;
        for (const ch of cleaned) {
            if (ch === '(') { depth++; }
            else if (ch === ')') { depth--; }
            if (depth < 0) {
                diagnostics.push(new vscode.Diagnostic(
                    new vscode.Range(i, 0, i, line.length),
                    'Unmatched closing parenthesis',
                    vscode.DiagnosticSeverity.Error,
                ));
                break;
            }
        }
        if (depth > 0) {
            diagnostics.push(new vscode.Diagnostic(
                new vscode.Range(i, 0, i, line.length),
                `${depth} unclosed parenthesis(es) on this line`,
                vscode.DiagnosticSeverity.Warning,
            ));
        }
    }
}

function checkControlFlowBlocks(lines: string[], diagnostics: vscode.Diagnostic[]): void {
    // Only check inside BEGIN..END_* block
    let inCode = false;

    for (const pair of BLOCK_PAIRS) {
        const [openRe, closeRe, closeName] = pair;
        const openStack: number[] = [];

        for (let i = 0; i < lines.length; i++) {
            const trimmed = lines[i].trim();
            if (trimmed.startsWith('//')) { continue; }

            if (/^\s*BEGIN\b/i.test(trimmed)) { inCode = true; continue; }
            if (BLOCK_END_RE.test(trimmed)) { inCode = false; continue; }

            if (!inCode) { continue; }

            // Check for opening keyword (only at start of statement, not inside expressions)
            if (openRe.test(trimmed)) {
                openStack.push(i);
            }
            if (closeRe.test(trimmed)) {
                if (openStack.length > 0) {
                    openStack.pop();
                }
            }
        }

        for (const openLine of openStack) {
            diagnostics.push(new vscode.Diagnostic(
                new vscode.Range(openLine, 0, openLine, lines[openLine].length),
                `Missing ${closeName}`,
                vscode.DiagnosticSeverity.Warning,
            ));
        }
    }
}
