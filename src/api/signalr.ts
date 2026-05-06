import { getServerUrl, getApiKey } from '../utils/config';
import { log } from '../views/outputChannel';

type MessageHandler = (hubName: string, method: string, args: unknown[]) => void;

/**
 * Lightweight ASP.NET SignalR (legacy) client using longPolling transport.
 * Compatible with Microsoft.AspNet.SignalR hubs.
 */
export class SignalRClient {
    private connectionToken: string | null = null;
    private messageId: string | null = null;
    private groupsToken: string | null = null;
    private polling = false;
    private abortController: AbortController | null = null;
    private handlers: MessageHandler[] = [];
    private hubs: string[];
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private _connected = false;

    constructor(hubs: string[]) {
        this.hubs = hubs;
    }

    get connected(): boolean {
        return this._connected;
    }

    onMessage(handler: MessageHandler): () => void {
        this.handlers.push(handler);
        return () => {
            const idx = this.handlers.indexOf(handler);
            if (idx >= 0) { this.handlers.splice(idx, 1); }
        };
    }

    async connect(): Promise<void> {
        if (this._connected) { return; }

        try {
            const token = await this.negotiate();
            if (!token) { return; }
            this.connectionToken = token;
            await this.startConnection();
            this._connected = true;
            this.polling = true;
            log('[SignalR] Connected.');
            this.pollLoop();
        } catch (err) {
            log(`[SignalR] Connection failed: ${err}`);
        }
    }

    disconnect(): void {
        this.polling = false;
        this._connected = false;
        this.abortController?.abort();
        this.abortController = null;
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        if (this.connectionToken) {
            // Fire and forget abort request
            this.sendAbort().catch(() => {});
            this.connectionToken = null;
        }
        log('[SignalR] Disconnected.');
    }

    private get baseUrl(): string {
        return getServerUrl().replace(/\/+$/, '');
    }

    private get connectionData(): string {
        return encodeURIComponent(JSON.stringify(this.hubs.map(h => ({ name: h }))));
    }

    private buildUrl(endpoint: string, extra: Record<string, string> = {}): string {
        const apiKey = getApiKey();
        const params = new URLSearchParams({
            connectionData: JSON.stringify(this.hubs.map(h => ({ name: h }))),
            ...extra,
        });
        if (apiKey) { params.set('apiKey', apiKey); }
        if (this.connectionToken) { params.set('connectionToken', this.connectionToken); }
        return `${this.baseUrl}/signalr/${endpoint}?${params.toString()}`;
    }

    private async negotiate(): Promise<string | null> {
        const url = this.buildUrl('negotiate');
        try {
            const resp = await fetch(url, { method: 'POST' });
            if (!resp.ok) {
                log(`[SignalR] Negotiate failed: HTTP ${resp.status}`);
                return null;
            }
            const data = await resp.json();
            this.messageId = data.MessageId ?? null;
            return data.ConnectionToken ?? null;
        } catch (err) {
            log(`[SignalR] Negotiate error: ${err}`);
            return null;
        }
    }

    private async startConnection(): Promise<void> {
        const url = this.buildUrl('start', { transport: 'longPolling' });
        const resp = await fetch(url);
        if (!resp.ok) {
            throw new Error(`Start failed: HTTP ${resp.status}`);
        }
    }

    private async sendAbort(): Promise<void> {
        const url = this.buildUrl('abort', { transport: 'longPolling' });
        await fetch(url, { method: 'POST' });
    }

    private async pollLoop(): Promise<void> {
        while (this.polling) {
            try {
                this.abortController = new AbortController();
                const params: Record<string, string> = { transport: 'longPolling' };
                if (this.messageId) { params['messageId'] = this.messageId; }
                if (this.groupsToken) { params['groupsToken'] = this.groupsToken; }

                const url = this.buildUrl('poll', params);
                const resp = await fetch(url, {
                    signal: this.abortController.signal,
                });

                if (!resp.ok) {
                    log(`[SignalR] Poll error: HTTP ${resp.status}`);
                    this.scheduleReconnect();
                    return;
                }

                const data = await resp.json();

                // Update cursors
                if (data.C) { this.messageId = data.C; }
                if (data.G) { this.groupsToken = data.G; }

                // Process messages
                if (data.M && Array.isArray(data.M)) {
                    for (const msg of data.M) {
                        if (msg.H && msg.M && msg.A) {
                            for (const handler of this.handlers) {
                                try {
                                    handler(msg.H.toLowerCase(), msg.M, msg.A);
                                } catch (err) {
                                    log(`[SignalR] Handler error: ${err}`);
                                }
                            }
                        }
                    }
                }
            } catch (err: any) {
                if (err?.name === 'AbortError') { return; }
                log(`[SignalR] Poll error: ${err}`);
                this.scheduleReconnect();
                return;
            }
        }
    }

    private scheduleReconnect(): void {
        if (!this.polling) { return; }
        this._connected = false;
        log('[SignalR] Reconnecting in 5s...');
        this.reconnectTimer = setTimeout(() => {
            this.connectionToken = null;
            this.connect();
        }, 5000);
    }
}

// ─── Singleton instance ──────────────────────────────────────────────

let instance: SignalRClient | null = null;

export function getSignalRClient(): SignalRClient {
    if (!instance) {
        instance = new SignalRClient(['jobhub', 'assistanthub']);
    }
    return instance;
}

export function disposeSignalR(): void {
    instance?.disconnect();
    instance = null;
}
