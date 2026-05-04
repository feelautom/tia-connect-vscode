import { describe, it, expect } from 'vitest';
import { escapeHtml, getPlcTypeClass, extractBlockNameFromSource, sanitizeFileName } from '../../src/utils/html';

describe('escapeHtml', () => {
    it('escapes ampersands', () => {
        expect(escapeHtml('A & B')).toBe('A &amp; B');
    });

    it('escapes angle brackets', () => {
        expect(escapeHtml('<script>alert(1)</script>')).toBe('&lt;script&gt;alert(1)&lt;/script&gt;');
    });

    it('escapes double quotes', () => {
        expect(escapeHtml('value="test"')).toBe('value=&quot;test&quot;');
    });

    it('handles all special chars together', () => {
        expect(escapeHtml('<a href="x&y">')).toBe('&lt;a href=&quot;x&amp;y&quot;&gt;');
    });

    it('leaves normal text unchanged', () => {
        expect(escapeHtml('Hello World 123')).toBe('Hello World 123');
    });

    it('handles empty string', () => {
        expect(escapeHtml('')).toBe('');
    });
});

describe('getPlcTypeClass', () => {
    it('returns type-bool for Bool', () => {
        expect(getPlcTypeClass('Bool')).toBe('type-bool');
        expect(getPlcTypeClass('BOOL')).toBe('type-bool');
        expect(getPlcTypeClass('bool')).toBe('type-bool');
    });

    it('returns type-int for integer types', () => {
        for (const t of ['Int', 'DINT', 'SINT', 'UINT', 'UDINT', 'USINT', 'LINT', 'ULINT']) {
            expect(getPlcTypeClass(t)).toBe('type-int');
        }
    });

    it('returns type-real for floating point types', () => {
        expect(getPlcTypeClass('Real')).toBe('type-real');
        expect(getPlcTypeClass('LREAL')).toBe('type-real');
    });

    it('returns type-word for word types', () => {
        for (const t of ['Word', 'DWORD', 'BYTE', 'LWORD']) {
            expect(getPlcTypeClass(t)).toBe('type-word');
        }
    });

    it('returns type-string for string types', () => {
        expect(getPlcTypeClass('String')).toBe('type-string');
        expect(getPlcTypeClass('WSTRING')).toBe('type-string');
    });

    it('returns type-time for time/date types', () => {
        for (const t of ['TIME', 'LTIME', 'DATE', 'TOD', 'DT', 'DTL']) {
            expect(getPlcTypeClass(t)).toBe('type-time');
        }
    });

    it('returns type-other for unknown types', () => {
        expect(getPlcTypeClass('MyUDT')).toBe('type-other');
        expect(getPlcTypeClass('Array[0..10] of Int')).toBe('type-other');
    });

    it('returns empty string for empty/null input', () => {
        expect(getPlcTypeClass('')).toBe('');
    });
});

describe('extractBlockNameFromSource', () => {
    it('extracts FUNCTION_BLOCK name', () => {
        const src = 'FUNCTION_BLOCK "FB_Motor"\nVAR\nEND_VAR';
        expect(extractBlockNameFromSource(src)).toBe('FB_Motor');
    });

    it('extracts FUNCTION name', () => {
        const src = 'FUNCTION "FC_Calc" : Int\nBEGIN\nEND_FUNCTION';
        expect(extractBlockNameFromSource(src)).toBe('FC_Calc');
    });

    it('extracts DATA_BLOCK name', () => {
        const src = 'DATA_BLOCK "DB_Config"\nVERSION : 0.1\nBEGIN\nEND_DATA_BLOCK';
        expect(extractBlockNameFromSource(src)).toBe('DB_Config');
    });

    it('extracts ORGANIZATION_BLOCK name', () => {
        const src = 'ORGANIZATION_BLOCK "Main"\nVERSION : 0.1\nBEGIN\nEND_ORGANIZATION_BLOCK';
        expect(extractBlockNameFromSource(src)).toBe('Main');
    });

    it('handles leading whitespace', () => {
        const src = '  \n  FUNCTION_BLOCK "FB_Test"\nEND_FUNCTION_BLOCK';
        expect(extractBlockNameFromSource(src)).toBe('FB_Test');
    });

    it('returns undefined for non-block source', () => {
        expect(extractBlockNameFromSource('// just a comment')).toBeUndefined();
        expect(extractBlockNameFromSource('')).toBeUndefined();
    });

    it('is case-insensitive', () => {
        const src = 'function_block "FB_Lower"';
        expect(extractBlockNameFromSource(src)).toBe('FB_Lower');
    });
});

describe('sanitizeFileName', () => {
    it('removes special characters', () => {
        expect(sanitizeFileName('PLC 1')).toBe('PLC_1');
        expect(sanitizeFileName('Block/Name')).toBe('Block_Name');
    });

    it('keeps alphanumeric, underscores, and hyphens', () => {
        expect(sanitizeFileName('FB_Motor-V2')).toBe('FB_Motor-V2');
    });

    it('handles dots and brackets', () => {
        expect(sanitizeFileName('Array[0..10]')).toBe('Array_0__10_');
    });
});
