import { getServerUrl, getApiKey } from '../utils/config';
import { ApiResponse } from './types';
import { log } from '../views/outputChannel';

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
            log(`${method} ${path}`);
            const resp = await fetch(url, {
                method,
                headers: this.headers,
                body: body ? JSON.stringify(body) : undefined,
                signal: controller.signal,
            });

            const text = await resp.text();
            let json: ApiResponse<T>;
            try {
                json = JSON.parse(text);
            } catch {
                throw new Error(`Invalid JSON response from ${path}: ${text.substring(0, 200)}`);
            }

            if (!resp.ok) {
                const msg = json.Message || `HTTP ${resp.status}`;
                log(`ERROR ${method} ${path}: ${msg}`);
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
