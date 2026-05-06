import { describe, it, expect } from 'vitest';
import {
    extractLineInfo,
    findSymbolLine,
    mapDiagnostics,
} from '../../src/utils/diagnosticMapper';

describe('extractLineInfo', () => {
    it('extracts "Line 42, Column 5"', () => {
        const result = extractLineInfo('Line 42, Column 5: Unexpected token');
        expect(result).toEqual({ line: 42, column: 5 });
    });

    it('extracts "line 10, col 3"', () => {
        const result = extractLineInfo('Error at line 10, col 3');
        expect(result).toEqual({ line: 10, column: 3 });
    });

    it('extracts "(Line: 12; Col: 3)"', () => {
        const result = extractLineInfo('Something (Line: 12; Col: 3) failed');
        expect(result).toEqual({ line: 12, column: 3 });
    });

    it('extracts "Line 7:" without column', () => {
        const result = extractLineInfo('Line 7: syntax error');
        expect(result).toEqual({ line: 7, column: 0 });
    });

    it('returns null when no line info', () => {
        expect(extractLineInfo('General compilation error')).toBeNull();
    });

    it('returns null for empty string', () => {
        expect(extractLineInfo('')).toBeNull();
    });
});

describe('findSymbolLine', () => {
    const sourceCode = [
        'FUNCTION_BLOCK FB_Motor',
        'VAR_INPUT',
        '    Start : Bool;',
        '    Stop : Bool;',
        'END_VAR',
        'VAR_OUTPUT',
        '    Running : Bool;',
        'END_VAR',
        'IF Start AND NOT Stop THEN',
        '    Running := TRUE;',
        'END_IF;',
    ].join('\n');

    it('finds line with quoted symbol', () => {
        const line = findSymbolLine(sourceCode, "Variable 'Running' is not defined");
        expect(line).toBe(6); // 0-based, line with "Running : Bool"
    });

    it('finds line with double-quoted symbol', () => {
        const line = findSymbolLine(sourceCode, 'Unknown identifier "Stop"');
        expect(line).toBe(3); // 0-based, line with "Stop : Bool"
    });

    it('returns 0 when no match found', () => {
        const line = findSymbolLine(sourceCode, 'Unknown error occurred');
        expect(line).toBe(0);
    });

    it('returns 0 for empty source', () => {
        const line = findSymbolLine('', "Variable 'X' not found");
        expect(line).toBe(0);
    });

    it('ignores very short symbols', () => {
        const line = findSymbolLine(sourceCode, "Error in 'X'");
        expect(line).toBe(0); // 'X' is too short (< 2 chars)
    });
});

describe('mapDiagnostics', () => {
    it('maps messages with line info', () => {
        const messages = [
            { Description: 'Error at Line 5, Column 10: bad token', ErrorLevel: 'Error' as const, Path: 'PLC_1/FB1' },
        ];

        const result = mapDiagnostics(messages);
        expect(result).toHaveLength(1);
        expect(result[0].line).toBe(4); // 0-based
        expect(result[0].column).toBe(10);
        expect(result[0].severity).toBe('Error');
    });

    it('maps messages using symbol search', () => {
        const sourceCode = 'VAR\n    myVar : Int;\nEND_VAR\nmyVar := 42;';
        const messages = [
            { Description: "Variable 'myVar' type mismatch", ErrorLevel: 'Warning' as const, Path: '' },
        ];

        const result = mapDiagnostics(messages, sourceCode);
        expect(result).toHaveLength(1);
        expect(result[0].line).toBe(1); // 0-based, first occurrence of myVar
    });

    it('falls back to line 0 when no info available', () => {
        const messages = [
            { Description: 'General error', ErrorLevel: 'Error' as const, Path: '' },
        ];

        const result = mapDiagnostics(messages);
        expect(result).toHaveLength(1);
        expect(result[0].line).toBe(0);
    });

    it('handles empty messages', () => {
        const result = mapDiagnostics([]);
        expect(result).toHaveLength(0);
    });

    it('prefers explicit line info over symbol search', () => {
        const sourceCode = 'Line1\nLine2\nLine3';
        const messages = [
            { Description: "Line 3: 'Line1' is bad", ErrorLevel: 'Error' as const, Path: '' },
        ];

        const result = mapDiagnostics(messages, sourceCode);
        expect(result[0].line).toBe(2); // Line 3 → 0-based index 2
    });
});
