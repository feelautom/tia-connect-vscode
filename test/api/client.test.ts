import { describe, it, expect } from 'vitest';
import { toPascalCaseKeys } from '../../src/api/client';

describe('toPascalCaseKeys', () => {
    it('converts simple object keys to PascalCase', () => {
        const input = { success: true, message: 'ok', data: null };
        const result = toPascalCaseKeys(input) as any;
        expect(result).toEqual({ Success: true, Message: 'ok', Data: null });
    });

    it('converts nested object keys', () => {
        const input = { response: { success: true, data: { blockName: 'FB1' } } };
        const result = toPascalCaseKeys(input) as any;
        expect(result.Response.Success).toBe(true);
        expect(result.Response.Data.BlockName).toBe('FB1');
    });

    it('converts array elements', () => {
        const input = [{ name: 'a' }, { name: 'b' }];
        const result = toPascalCaseKeys(input) as any[];
        expect(result).toEqual([{ Name: 'a' }, { Name: 'b' }]);
    });

    it('handles nested arrays', () => {
        const input = { devices: [{ name: 'PLC_1', blocks: [{ name: 'Main' }] }] };
        const result = toPascalCaseKeys(input) as any;
        expect(result.Devices[0].Name).toBe('PLC_1');
        expect(result.Devices[0].Blocks[0].Name).toBe('Main');
    });

    it('returns null/undefined as-is', () => {
        expect(toPascalCaseKeys(null)).toBeNull();
        expect(toPascalCaseKeys(undefined)).toBeUndefined();
    });

    it('returns primitives as-is', () => {
        expect(toPascalCaseKeys(42)).toBe(42);
        expect(toPascalCaseKeys('hello')).toBe('hello');
        expect(toPascalCaseKeys(true)).toBe(true);
    });

    it('handles empty object', () => {
        expect(toPascalCaseKeys({})).toEqual({});
    });

    it('handles empty array', () => {
        expect(toPascalCaseKeys([])).toEqual([]);
    });

    it('handles already-PascalCase keys (capitalizes first char, no change)', () => {
        const input = { Success: true, Message: 'already pascal' };
        const result = toPascalCaseKeys(input) as any;
        expect(result).toEqual({ Success: true, Message: 'already pascal' });
    });

    it('handles mixed case keys', () => {
        const input = { errorCount: 0, WarningCount: 1, messages: [] };
        const result = toPascalCaseKeys(input) as any;
        expect(result).toHaveProperty('ErrorCount', 0);
        expect(result).toHaveProperty('WarningCount', 1);
        expect(result).toHaveProperty('Messages');
    });
});
