import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import { workspace } from 'vscode';

vi.mock('fs');
vi.mock('../../src/utils/config', () => ({
    getServerUrl: () => 'http://localhost:9000',
    getApiKey: () => 'actual-secret-key',
    getAutoConfigureMcp: () => true,
}));
vi.mock('../../src/views/outputChannel', () => ({ log: vi.fn() }));

import { ensureMcpConfig } from '../../src/utils/mcpConfig';

describe('ensureMcpConfig', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        (workspace as any).workspaceFolders = [{ uri: { fsPath: 'C:\\workspace' } }];
        vi.mocked(fs.existsSync).mockReturnValue(true);
        vi.mocked(fs.renameSync).mockImplementation(() => undefined);
    });

    it('leaves malformed JSON unchanged and reports an error', async () => {
        vi.mocked(fs.readFileSync).mockReturnValue('{ malformed');

        await expect(ensureMcpConfig()).rejects.toThrow('Cannot update malformed MCP configuration');
        expect(fs.writeFileSync).not.toHaveBeenCalled();
        expect(fs.renameSync).not.toHaveBeenCalled();
    });

    it('leaves a non-array inputs property unchanged', async () => {
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
            servers: { existing: { type: 'stdio', command: 'safe-tool' } },
            inputs: { unexpected: true },
        }));

        await expect(ensureMcpConfig()).rejects.toThrow('inputs must be an array');
        expect(fs.writeFileSync).not.toHaveBeenCalled();
        expect(fs.renameSync).not.toHaveBeenCalled();
    });

    it('preserves other entries and writes only a password input placeholder atomically', async () => {
        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
            servers: { existing: { type: 'stdio', command: 'safe-tool' } },
            inputs: [{ id: 'existingInput', type: 'promptString' }],
        }));
        let written = '';
        vi.mocked(fs.writeFileSync).mockImplementation((_path, data) => { written = String(data); });

        await ensureMcpConfig();

        expect(written).not.toContain('actual-secret-key');
        const config = JSON.parse(written);
        expect(config.servers.existing.command).toBe('safe-tool');
        expect(config.servers['tia-connect'].headers['X-Client-Id']).toBe('vscode/1.0.3-test');
        expect(config.servers['tia-connect'].headers['X-API-Key']).toBe('${input:tiaConnectApiKey}');
        expect(config.inputs).toEqual(expect.arrayContaining([
            expect.objectContaining({ id: 'existingInput' }),
            expect.objectContaining({ id: 'tiaConnectApiKey', password: true }),
        ]));
        expect(fs.writeFileSync).toHaveBeenCalledWith(expect.stringMatching(/\.tmp$/), expect.any(String), expect.objectContaining({ flag: 'wx' }));
        expect(fs.renameSync).toHaveBeenCalledWith(expect.stringMatching(/\.tmp$/), expect.stringMatching(/mcp\.json$/));
    });
});
