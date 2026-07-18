import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';
import { workspace } from 'vscode';

const mocks = vi.hoisted(() => ({
    apiKey: 'Opaque+Secret/Key=',
    autoMcp: true,
    serverUrl: 'http://localhost:9000/private/path?token=hidden',
    installed: true,
    signalRConnected: true,
    license: {
        Edition: 'PRO',
        IsValid: true,
        Features: [{ Key: 'one', Name: 'Secret feature name', Description: 'private', Enabled: true }],
    },
}));

vi.mock('fs');
vi.mock('../../src/utils/config', () => ({
    getApiKey: () => mocks.apiKey,
    getAutoConfigureMcp: () => mocks.autoMcp,
    getServerUrl: () => mocks.serverUrl,
}));
vi.mock('../../src/install/serverDetector', () => ({
    isServerInstalled: () => ({ installed: mocks.installed, exePath: 'C:\\Sensitive\\Desktop.exe' }),
}));
vi.mock('../../src/api/signalr', () => ({
    getSignalRClient: () => ({ connected: mocks.signalRConnected }),
}));
vi.mock('../../src/api/project', () => ({
    getLicenseFeatures: vi.fn(async () => mocks.license),
}));

import {
    collectSupportDiagnostic,
    formatSupportDiagnostic,
    inspectMcpState,
    sanitizeServerUrl,
} from '../../src/diagnostics/supportDiagnostic';

describe('support diagnostic privacy', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        mocks.apiKey = 'Opaque+Secret/Key=';
        mocks.autoMcp = true;
        mocks.serverUrl = 'http://localhost:9000/private/path?token=hidden';
        mocks.installed = true;
        mocks.signalRConnected = true;
        (workspace as any).workspaceFolders = undefined;
        vi.mocked(fs.existsSync).mockReset();
        vi.mocked(fs.readFileSync).mockReset();
    });

    it('keeps only a safe loopback endpoint and redacts remote hosts', () => {
        expect(sanitizeServerUrl('http://localhost:9000/private?token=secret')).toBe('http://localhost:9000');
        expect(sanitizeServerUrl('https://plc.internal.example:9443/api')).toBe('https://<remote-host>:9443');
        expect(sanitizeServerUrl('http://user:secret@localhost:9000')).toBe('invalid');
        expect(sanitizeServerUrl('file:///C:/Sensitive')).toBe('invalid');
    });

    it('collects a useful connected report without raw response data or secrets', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            text: async () => JSON.stringify({
                status: { buildVersion: '2.2.840' },
                projectPath: 'D:\\Customer\\Secret.ap20',
                apiKey: 'server-secret',
            }),
        }));

        const snapshot = await collectSupportDiagnostic({ isAuthenticated: async () => true });
        const report = formatSupportDiagnostic(snapshot);

        expect(snapshot).toMatchObject({
            oauthAuthenticated: 'yes',
            apiKeyConfigured: 'yes',
            desktopInstalled: 'yes',
            safeEndpoint: 'http://localhost:9000',
            rest: 'healthy',
            desktopVersion: '2.2.840',
            signalR: 'connected',
            mcp: 'no_workspace',
            license: 'valid',
            licenseEdition: 'pro',
            enabledLicenseFeatures: 1,
        });
        for (const forbidden of [
            'Opaque+Secret/Key=', 'server-secret', 'Customer', 'Secret.ap20',
            'Secret feature name', 'private/path', 'token=hidden', 'Desktop.exe',
        ]) {
            expect(report).not.toContain(forbidden);
        }
        vi.unstubAllGlobals();
    });

    it('reports offline and invalid configurations with bounded safe values', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Cannot reach private-host')));
        mocks.apiKey = '';

        const offline = await collectSupportDiagnostic({ isAuthenticated: async () => false });
        expect(offline).toMatchObject({
            rest: 'unavailable',
            restErrorCode: 'offline',
            license: 'not_checked',
            licenseEdition: 'unknown',
        });

        mocks.serverUrl = 'http://user:secret@remote.internal:9000/private';
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        const invalid = await collectSupportDiagnostic({ isAuthenticated: async () => false });
        expect(invalid.safeEndpoint).toBe('invalid');
        expect(invalid.rest).toBe('invalid_configuration');
        expect(fetchMock).not.toHaveBeenCalled();
        vi.unstubAllGlobals();
    });

    it('detects malformed, misconfigured, and unsafe MCP files without exposing contents', () => {
        (workspace as any).workspaceFolders = [{ uri: { fsPath: 'C:\\SensitiveWorkspace' } }];
        vi.mocked(fs.existsSync).mockReturnValue(true);

        vi.mocked(fs.readFileSync).mockReturnValue('{ malformed secret-value');
        expect(inspectMcpState('http://localhost:9000')).toBe('malformed');

        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
            servers: { 'tia-connect': { type: 'sse', url: 'http://evil.invalid/mcp/sse' } },
        }));
        expect(inspectMcpState('http://localhost:9000')).toBe('misconfigured');

        vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify({
            servers: {
                'tia-connect': {
                    type: 'sse',
                    url: 'http://localhost:9000/mcp/sse',
                    headers: { 'X-API-Key': 'raw-secret-value' },
                },
            },
        }));
        expect(inspectMcpState('http://localhost:9000')).toBe('unsafe_secret_detected');
    });
});
