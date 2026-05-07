import { getServerUrl, getApiKey } from '../utils/config';
import { ApiResponse } from './types';
import { log, debug } from '../views/outputChannel';

/** Recursively convert first char of each key to uppercase (PascalCase)
 * @internal Exported for testing */
export function toPascalCaseKeys(obj: unknown): unknown {
    if (obj === null || obj === undefined || typeof obj !== 'object') {
        return obj;
    }
    if (Array.isArray(obj)) {
        return obj.map(toPascalCaseKeys);
    }
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
        const pascal = key.charAt(0).toUpperCase() + key.slice(1);
        result[pascal] = toPascalCaseKeys(value);
    }
    return result;
}

/** HTTP client for T-IA Connect REST API */
export class TiaClient {
    private abortControllers: Set<AbortController> = new Set();

    private get baseUrl(): string {
        return getServerUrl().replace(/\/+$/, '');
    }

    private get headers(): Record<string, string> {
        const h: Record<string, string> = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        };
        const key = getApiKey();
        if (key) {
            h['X-API-Key'] = key;
        }
        return h;
    }

    async get<T>(path: string): Promise<ApiResponse<T>> {
        return this.request<T>('GET', path);
    }

    async post<T>(path: string, body?: unknown): Promise<ApiResponse<T>> {
        return this.request<T>('POST', path, body);
    }

    async delete<T>(path: string): Promise<ApiResponse<T>> {
        return this.request<T>('DELETE', path);
    }

    /** Check if the server is reachable */
    async ping(): Promise<boolean> {
        try {
            const res = await this.get('/api/health');
            return res.Success;
        } catch {
            return false;
        }
    }

    /** Cancel all pending requests */
    cancelAll(): void {
        for (const c of this.abortControllers) {
            c.abort();
        }
        this.abortControllers.clear();
    }

    private async request<T>(method: string, path: string, body?: unknown): Promise<ApiResponse<T>> {
        const url = `${this.baseUrl}${path}`;
        const controller = new AbortController();
        this.abortControllers.add(controller);

        try {
            debug(`${method} ${path}`);
            let resp: Response;
            try {
                resp = await fetch(url, {
                    method,
                    headers: this.headers,
                    body: body ? JSON.stringify(body) : undefined,
                    signal: controller.signal,
                });
            } catch {
                if (controller.signal.aborted) {
                    throw new Error('Request cancelled.');
                }
                throw new Error(`Cannot reach T-IA Connect server at ${this.baseUrl}. Check that the server is running.`);
            }

            const text = await resp.text();
            let raw: any;
            if (!text || text.trim() === '') {
                // Empty response (e.g. server-side file export) — treat as success
                raw = { Success: resp.ok, Message: '' };
            } else {
                try {
                    raw = JSON.parse(text);
                } catch {
                    throw new Error(`Invalid JSON response from ${path}: ${text.substring(0, 200)}`);
                }
            }

            // Normalize entire response to PascalCase keys
            const normalized = toPascalCaseKeys(raw) as any;

            // T-IA Connect wraps responses in { Status, Response: { Success, Data }, Success, Message }
            // Extract the inner Response if present, otherwise use top-level
            const inner = normalized.Response ?? normalized;
            const json: ApiResponse<T> = {
                Success: inner.Success ?? normalized.Success ?? false,
                Message: inner.Message ?? normalized.Message ?? '',
                Data: inner.Data ?? normalized.Data ?? null,
                Timestamp: inner.Timestamp ?? normalized.Timestamp ?? '',
            };

            if (!resp.ok) {
                if (resp.status === 429) {
                    const resetHeader = resp.headers.get('X-RateLimit-Reset');
                    const resetInfo = resetHeader
                        ? ` Resets at ${new Date(Number(resetHeader) * 1000).toLocaleTimeString()}.`
                        : '';
                    const quotaMsg = json.Message || `API rate limit exceeded.${resetInfo} Upgrade your license to remove all limits.`;
                    log(`QUOTA ${method} ${path}: ${quotaMsg}`);
                    throw new Error(quotaMsg);
                }
                if (resp.status === 401) {
                    log(`AUTH ${method} ${path}: unauthorized`);
                    throw new Error('Authentication failed. Check your API key in T-IA Connect settings.');
                }
                if (resp.status === 403) {
                    const featureMsg = json.Message || 'This feature is not available in your license edition.';
                    log(`LICENSE ${method} ${path}: ${featureMsg}`);
                    throw new Error(featureMsg);
                }
                const msg = json.Message || `HTTP ${resp.status}`;
                // "Not connected" / "not available" are normal when no project is open — don't log as ERROR
                const isNotReady = /not connected|not available|aucun projet|no project/i.test(msg);
                if (isNotReady) {
                    debug(`${method} ${path}: ${msg}`);
                } else {
                    log(`ERROR ${method} ${path}: ${msg}`);
                }
                throw new Error(msg);
            }

            return json;
        } finally {
            this.abortControllers.delete(controller);
        }
    }
}

/** Singleton client instance */
export const client = new TiaClient();
