import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fs from 'fs';

// Mock fs before importing the module
vi.mock('fs');
const existsSyncMock = vi.mocked(fs.existsSync);

// Mock config to avoid vscode dependency
vi.mock('../../src/utils/config', () => ({
    getServerUrl: () => 'http://localhost:9000',
}));

// Mock outputChannel
vi.mock('../../src/views/outputChannel', () => ({
    log: () => {},
    logError: () => {},
}));

import { isServerInstalled, detectServer } from '../../src/install/serverDetector';

describe('isServerInstalled', () => {
    beforeEach(() => {
        existsSyncMock.mockReset();
    });

    it('returns installed=true when exe found at FeelAutomCorp path', () => {
        existsSyncMock.mockImplementation((p: fs.PathLike) => {
            return String(p).includes('FeelAutomCorp');
        });

        const result = isServerInstalled();
        expect(result.installed).toBe(true);
        expect(result.exePath).toContain('FeelAutomCorp');
    });

    it('returns installed=true when exe found at legacy FEELAUTOM path', () => {
        existsSyncMock.mockImplementation((p: fs.PathLike) => {
            return String(p).includes('FEELAUTOM');
        });

        const result = isServerInstalled();
        expect(result.installed).toBe(true);
        expect(result.exePath).toContain('FEELAUTOM');
    });

    it('returns installed=false when exe not found anywhere', () => {
        existsSyncMock.mockReturnValue(false);

        const result = isServerInstalled();
        expect(result.installed).toBe(false);
        expect(result.exePath).toBeUndefined();
    });

    it('checks FeelAutomCorp path first (priority)', () => {
        const checkedPaths: string[] = [];
        existsSyncMock.mockImplementation((p: fs.PathLike) => {
            checkedPaths.push(String(p));
            return String(p).includes('FeelAutomCorp');
        });

        isServerInstalled();
        expect(checkedPaths[0]).toContain('FeelAutomCorp');
    });
});

describe('detectServer', () => {
    beforeEach(() => {
        existsSyncMock.mockReset();
        vi.restoreAllMocks();
    });

    it('returns running=false when server is unreachable', async () => {
        existsSyncMock.mockReturnValue(false);
        // Mock fetch to simulate unreachable server
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));

        const result = await detectServer();
        expect(result.running).toBe(false);

        vi.unstubAllGlobals();
    });

    it('returns running=true when health endpoint responds 200', async () => {
        existsSyncMock.mockReturnValue(true);
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));

        const result = await detectServer();
        expect(result.running).toBe(true);
        expect(result.installed).toBe(true);

        vi.unstubAllGlobals();
    });

    it('returns running=false when health endpoint responds non-ok', async () => {
        existsSyncMock.mockReturnValue(false);
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

        const result = await detectServer();
        expect(result.running).toBe(false);

        vi.unstubAllGlobals();
    });
});
