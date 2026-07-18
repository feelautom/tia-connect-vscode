import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/utils/config', () => ({
    getServerUrl: () => 'http://localhost:9000/',
    getApiKey: () => 'Opaque+Secret/Key=',
}));

import {
    buildTelemetryPayload,
    categorizeApiPath,
    normalizeTelemetryError,
    resetTelemetrySupportForTests,
    trackTelemetry,
} from '../../src/telemetry/telemetry';

describe('privacy-safe telemetry', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        resetTelemetrySupportForTests();
    });

    it('serializes only allowlisted fields and bounds durations', () => {
        const payload = buildTelemetryPayload('VSCode_CommandExecuted', {
            success: false,
            durationMs: 999_999,
            mode: 'REST',
            commandCategory: 'blocks',
            errorCode: 'rejected',
            desktopVersion: '2.2.840',
            token: 'secret-token',
            path: 'D:\\Sensitive\\Project.ap20',
            message: 'raw PLC response',
        } as any);

        expect(payload).toEqual({
            eventName: 'VSCode_CommandExecuted',
            extensionVersion: '1.0.3-test',
            vscodeVersion: '1.99.0-test',
            success: false,
            durationMs: 60_000,
            mode: 'REST',
            commandCategory: 'blocks',
            errorCode: 'rejected',
            desktopVersion: '2.2.840',
        });
        expect(JSON.stringify(payload)).not.toContain('secret-token');
        expect(JSON.stringify(payload)).not.toContain('Sensitive');
        expect(JSON.stringify(payload)).not.toContain('raw PLC');
    });

    it('drops runtime values outside the allowlists', () => {
        const payload = buildTelemetryPayload('VSCode_CommandExecuted', {
            success: 'yes',
            durationMs: 'forever',
            mode: 'raw-mode',
            commandCategory: 'D:\\Sensitive',
            errorCode: 'token=secret',
            desktopVersion: '2.2.840\r\nX-Injected: yes',
        } as any);

        expect(payload).toEqual({
            eventName: 'VSCode_CommandExecuted',
            extensionVersion: '1.0.3-test',
            vscodeVersion: '1.99.0-test',
        });
    });

    it('keeps authentication material in headers and out of the payload', async () => {
        const fetchMock = vi.fn().mockResolvedValue({ status: 202 });
        vi.stubGlobal('fetch', fetchMock);

        await trackTelemetry('VSCode_SignalRConnected', { success: true, mode: 'SignalR' });

        const [url, options] = fetchMock.mock.calls[0];
        expect(url).toBe('http://localhost:9000/api/telemetry/client-events');
        expect(options.headers).toMatchObject({
            'X-API-Key': 'Opaque+Secret/Key=',
            'X-Client-Id': 'vscode/1.0.3-test',
        });
        expect(options.body).not.toContain('Opaque+Secret/Key=');
        vi.unstubAllGlobals();
    });

    it('is non-blocking and disables an unsupported endpoint for the session', async () => {
        const fetchMock = vi.fn().mockRejectedValueOnce(new Error('offline'))
            .mockResolvedValueOnce({ status: 404 });
        vi.stubGlobal('fetch', fetchMock);

        await expect(trackTelemetry('VSCode_ExtensionActivated')).resolves.toBeUndefined();
        await expect(trackTelemetry('VSCode_DesktopDetected')).resolves.toBeUndefined();
        await expect(trackTelemetry('VSCode_DesktopConnected')).resolves.toBeUndefined();

        expect(fetchMock).toHaveBeenCalledTimes(2);
        vi.unstubAllGlobals();
    });

    it('does not send an unknown runtime event name', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);

        await trackTelemetry('SecretRawEvent' as any, { success: true });

        expect(fetchMock).not.toHaveBeenCalled();
        vi.unstubAllGlobals();
    });

    it('normalizes paths and errors without returning raw messages', () => {
        expect(categorizeApiPath('/api/devices/PLC_1/blocks/SecretBlock')).toBe('blocks');
        expect(categorizeApiPath('/api/source-control/status')).toBe('vcs');
        expect(normalizeTelemetryError(new Error('Cannot reach server at a private URL'))).toBe('offline');
        expect(normalizeTelemetryError(new Error('Authentication failed for token abc'))).toBe('unauthorized');
    });
});
