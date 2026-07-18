import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    get: vi.fn(),
    signalr: {
        connected: true,
        onMessage: vi.fn(),
    },
}));

vi.mock('../../src/api/client', () => ({ client: { get: mocks.get } }));
vi.mock('../../src/api/signalr', () => ({ getSignalRClient: () => mocks.signalr }));

import { JobPollingCancelledError, pollJob } from '../../src/api/jobs';

class CancellationToken {
    isCancellationRequested = false;
    private listeners: Array<() => void> = [];
    onCancellationRequested = (listener: () => void) => {
        this.listeners.push(listener);
        return { dispose: () => { this.listeners = this.listeners.filter(value => value !== listener); } };
    };
    cancel(): void {
        this.isCancellationRequested = true;
        this.listeners.slice().forEach(listener => listener());
    }
}

describe('pollJob cancellation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.signalr.connected = true;
        mocks.signalr.onMessage.mockReturnValue(vi.fn());
    });

    it('interrupts SignalR waiting as soon as VS Code cancels the run', async () => {
        mocks.get.mockReturnValue(new Promise(() => {}));
        const cancellation = new CancellationToken();
        const pending = pollJob('job-1', undefined, 10_000, 60_000, cancellation);

        cancellation.cancel();

        await expect(pending).rejects.toBeInstanceOf(JobPollingCancelledError);
        expect(mocks.signalr.onMessage.mock.results[0].value).toHaveBeenCalledOnce();
    });

    it('interrupts the HTTP polling delay instead of waiting for the next interval', async () => {
        mocks.signalr.connected = false;
        mocks.get.mockResolvedValue({
            Data: { JobId: 'job-1', Status: 'Running', Message: '', Result: null, Progress: 1, CreatedAt: '' },
        });
        const cancellation = new CancellationToken();
        const pending = pollJob('job-1', undefined, 10_000, 60_000, cancellation);
        await Promise.resolve();

        cancellation.cancel();

        await expect(pending).rejects.toBeInstanceOf(JobPollingCancelledError);
        expect(mocks.get).toHaveBeenCalledOnce();
    });
});
