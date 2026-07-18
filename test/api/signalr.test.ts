import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/utils/config', () => ({
    getServerUrl: () => 'http://localhost:9000',
    getApiKey: () => 'Opaque+Secret/Key=',
}));
vi.mock('../../src/views/outputChannel', () => ({ log: vi.fn() }));

import { SignalRClient } from '../../src/api/signalr';

describe('SignalRClient authentication', () => {
    it('keeps the API key out of query strings and sends it as a header', () => {
        const client = new SignalRClient(['jobhub']);
        const url = (client as any).buildUrl('negotiate');
        const headers = (client as any).headers;

        expect(url).not.toContain('Opaque');
        expect(url).not.toContain('apiKey');
        expect(headers).toEqual({ 'X-API-Key': 'Opaque+Secret/Key=' });
    });
});
