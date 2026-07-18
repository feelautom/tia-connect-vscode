import { beforeEach, describe, expect, it, vi } from 'vitest';
import { workspace } from 'vscode';
import { getApiKey, initializeApiKeyStorage, setApiKey } from '../../src/utils/config';

function createContext(initialSecret?: string) {
    const secrets = new Map<string, string>();
    if (initialSecret !== undefined) { secrets.set('tiaConnect.apiKey', initialSecret); }
    return {
        secrets: {
            get: vi.fn(async (key: string) => secrets.get(key)),
            store: vi.fn(async (key: string, value: string) => { secrets.set(key, value); }),
            delete: vi.fn(async (key: string) => { secrets.delete(key); }),
        },
    } as any;
}

describe('API key SecretStorage', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('migrates the legacy setting byte-for-byte and clears it', async () => {
        const update = vi.fn();
        vi.spyOn(workspace, 'getConfiguration').mockReturnValue({
            get: vi.fn().mockReturnValue('  Opaque-Key_Ä  '),
            inspect: vi.fn().mockReturnValue({
                globalValue: '  Opaque-Key_Ä  ',
                workspaceValue: 'workspace-copy',
                workspaceFolderValue: 'folder-copy',
            }),
            update,
        } as any);
        const context = createContext();

        await initializeApiKeyStorage(context);

        expect(context.secrets.store).toHaveBeenCalledWith('tiaConnect.apiKey', '  Opaque-Key_Ä  ');
        expect(getApiKey()).toBe('  Opaque-Key_Ä  ');
        expect(update).toHaveBeenCalledWith('apiKey', undefined, 1);
        expect(update).toHaveBeenCalledWith('apiKey', undefined, 2);
        expect(update).toHaveBeenCalledWith('apiKey', undefined, 3);
    });

    it('prefers an existing secret and still clears a stale legacy setting', async () => {
        const update = vi.fn();
        vi.spyOn(workspace, 'getConfiguration').mockReturnValue({
            get: vi.fn().mockReturnValue('legacy'),
            inspect: vi.fn().mockReturnValue({ globalValue: 'legacy' }),
            update,
        } as any);
        const context = createContext('secret-value');

        await initializeApiKeyStorage(context);

        expect(getApiKey()).toBe('secret-value');
        expect(context.secrets.store).not.toHaveBeenCalled();
        expect(update).toHaveBeenCalled();
    });

    it('stores and deletes opaque keys without normalization', async () => {
        vi.spyOn(workspace, 'getConfiguration').mockReturnValue({ get: vi.fn().mockReturnValue(''), inspect: vi.fn(), update: vi.fn() } as any);
        const context = createContext();
        await initializeApiKeyStorage(context);

        await setApiKey(' MiXeD/+= ');
        expect(getApiKey()).toBe(' MiXeD/+= ');
        await setApiKey('');
        expect(getApiKey()).toBe('');
        expect(context.secrets.delete).toHaveBeenCalledWith('tiaConnect.apiKey');
    });
});
