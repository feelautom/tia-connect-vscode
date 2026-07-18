import { beforeEach, describe, it, expect, vi } from 'vitest';
import { workspace } from 'vscode';
import { TiaClient, toPascalCaseKeys } from '../../src/api/client';

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

describe('TiaClient business responses', () => {
    beforeEach(() => {
        (workspace as any).isTrusted = true;
    });

    it('rejects mutating requests before network access in restricted mode', async () => {
        (workspace as any).isTrusted = false;
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        await expect(new TiaClient().post('/api/project/save')).rejects.toThrow('trusted workspace');
        expect(fetchMock).not.toHaveBeenCalled();
        vi.unstubAllGlobals();
    });

    it('adds the versioned VS Code client identity header', async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ Success: true }),
            headers: new Headers(),
        });
        vi.stubGlobal('fetch', fetchMock);

        await new TiaClient().get('/api/project');

        expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
            'X-Client-Id': 'vscode/1.0.3-test',
        });
        vi.unstubAllGlobals();
    });

    it('rejects HTTP 2xx responses whose business result is Success=false', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ Success: false, Message: 'Operation refused' }),
            headers: new Headers(),
        }));

        await expect(new TiaClient().get('/api/test')).rejects.toThrow('Operation refused');
        vi.unstubAllGlobals();
    });

    it('returns successful business responses', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ Success: true, Data: { value: 1 } }),
            headers: new Headers(),
        }));

        const response = await new TiaClient().get<{ Value: number }>('/api/test');
        expect(response.Data).toEqual({ Value: 1 });
        vi.unstubAllGlobals();
    });
});
