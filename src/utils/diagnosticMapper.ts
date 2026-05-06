/**
 * Diagnostic Mapper — map TIA Portal compilation errors to source file lines.
 * TIA compilation messages reference networks/paths, not line numbers.
 * This module tries to map them to the actual lines in the open SCL/STL editor.
 */

import { CompilationMessage } from '../api/types';

export interface MappedDiagnostic {
    line: number;
    column: number;
    message: string;
    severity: 'Error' | 'Warning' | 'Info';
    path: string;
}

/**
 * Try to extract a line number from a compilation message.
 * TIA Portal sometimes includes patterns like:
 * - "Line 42, Column 5: ..."
 * - "Network 3: ..."
 * - "(Line: 12; Col: 3)"
 */
export function extractLineInfo(description: string): { line: number; column: number } | null {
    // Pattern: "Line 42, Column 5" or "line 42, col 5"
    const lineColMatch = description.match(/[Ll]ine[:\s]+(\d+)[,;]\s*[Cc]ol(?:umn)?[:\s]+(\d+)/);
    if (lineColMatch) {
        return { line: parseInt(lineColMatch[1], 10), column: parseInt(lineColMatch[2], 10) };
    }

    // Pattern: "(Line: 12; Col: 3)"
    const parenMatch = description.match(/\([Ll]ine:\s*(\d+);\s*[Cc]ol:\s*(\d+)\)/);
    if (parenMatch) {
        return { line: parseInt(parenMatch[1], 10), column: parseInt(parenMatch[2], 10) };
    }

    // Pattern: "Line 42:" or "line 42"
    const lineOnlyMatch = description.match(/[Ll]ine[:\s]+(\d+)/);
    if (lineOnlyMatch) {
        return { line: parseInt(lineOnlyMatch[1], 10), column: 0 };
    }

    return null;
}

/**
 * Try to find the line in source code that matches a symbol referenced in the error.
 * Searches for variable names, block names, etc. mentioned in the error message.
 */
export function findSymbolLine(sourceCode: string, description: string): number {
    // Extract quoted identifiers from the error message
    const quoted = description.match(/'([^']+)'/g) || description.match(/"([^"]+)"/g);
    if (!quoted) return 0;

    const lines = sourceCode.split('\n');
    for (const q of quoted) {
        const symbol = q.replace(/['"]/g, '');
        if (symbol.length < 2) continue;

        for (let i = 0; i < lines.length; i++) {
            if (lines[i].includes(symbol)) {
                return i; // 0-based
            }
        }
    }

    return 0;
}

/**
 * Map compilation messages to source file line numbers.
 * Uses multiple strategies:
 * 1. Extract explicit line/column from message text
 * 2. Search source code for referenced symbols
 * 3. Fall back to line 0
 */
export function mapDiagnostics(
    messages: CompilationMessage[],
    sourceCode?: string,
): MappedDiagnostic[] {
    return messages.map(msg => {
        // Strategy 1: explicit line info in the message
        const lineInfo = extractLineInfo(msg.Description);
        if (lineInfo) {
            return {
                line: lineInfo.line - 1, // Convert to 0-based
                column: lineInfo.column,
                message: msg.Description,
                severity: msg.ErrorLevel,
                path: msg.Path,
            };
        }

        // Strategy 2: symbol search in source code
        if (sourceCode) {
            const symbolLine = findSymbolLine(sourceCode, msg.Description);
            if (symbolLine > 0) {
                return {
                    line: symbolLine,
                    column: 0,
                    message: msg.Description,
                    severity: msg.ErrorLevel,
                    path: msg.Path,
                };
            }
        }

        // Strategy 3: fallback to line 0
        return {
            line: 0,
            column: 0,
            message: msg.Description,
            severity: msg.ErrorLevel,
            path: msg.Path,
        };
    });
}
