import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { getClientIdentityHeaders, getExtensionVersion } from '../api/clientIdentity';
import { getLicenseFeatures } from '../api/project';
import { getSignalRClient } from '../api/signalr';
import { isServerInstalled } from '../install/serverDetector';
import { getApiKey, getAutoConfigureMcp, getServerUrl } from '../utils/config';
import { normalizeTelemetryError } from '../telemetry/telemetry';

export type DiagnosticState = 'yes' | 'no' | 'unknown';
export type RestState = 'healthy' | 'unavailable' | 'invalid_configuration';
export type McpState =
    | 'configured'
    | 'disabled'
    | 'malformed'
    | 'misconfigured'
    | 'missing'
    | 'no_workspace'
    | 'unsafe_secret_detected';

export interface SupportDiagnosticSnapshot {
    generatedAt: string;
    extensionVersion: string;
    vscodeVersion: string;
    oauthAuthenticated: DiagnosticState;
    apiKeyConfigured: DiagnosticState;
    desktopInstalled: DiagnosticState;
    safeEndpoint: string;
    rest: RestState;
    restLatencyMs: number;
    restErrorCode: string;
    desktopVersion: string;
    signalR: 'connected' | 'disconnected';
    mcp: McpState;
    license: 'valid' | 'invalid' | 'unavailable' | 'not_checked';
    licenseEdition: string;
    enabledLicenseFeatures: number;
    licenseErrorCode: string;
}

export interface DiagnosticRuntimeState {
    isAuthenticated: () => Promise<boolean>;
}

interface HealthProbe {
    state: RestState;
    latencyMs: number;
    errorCode: string;
    desktopVersion: string;
}

export async function collectSupportDiagnostic(
    runtime: DiagnosticRuntimeState,
): Promise<SupportDiagnosticSnapshot> {
    const serverUrl = getServerUrl();
    const safeEndpoint = sanitizeServerUrl(serverUrl);
    const health = safeEndpoint === 'invalid'
        ? { state: 'invalid_configuration', latencyMs: 0, errorCode: 'invalid_configuration', desktopVersion: 'unknown' } as HealthProbe
        : await probeDesktopHealth(serverUrl);

    let authenticationState: DiagnosticState = 'unknown';
    try {
        authenticationState = await runtime.isAuthenticated() ? 'yes' : 'no';
    } catch {
        // Authentication diagnostics remain unknown rather than exposing an error.
    }

    const snapshot: SupportDiagnosticSnapshot = {
        generatedAt: new Date().toISOString(),
        extensionVersion: normalizeVersion(getExtensionVersion()),
        vscodeVersion: normalizeVersion(vscode.version),
        oauthAuthenticated: authenticationState,
        apiKeyConfigured: getApiKey() ? 'yes' : 'no',
        desktopInstalled: isServerInstalled().installed ? 'yes' : 'no',
        safeEndpoint,
        rest: health.state,
        restLatencyMs: boundLatency(health.latencyMs),
        restErrorCode: health.errorCode,
        desktopVersion: health.desktopVersion,
        signalR: getSignalRClient().connected ? 'connected' : 'disconnected',
        mcp: inspectMcpState(serverUrl),
        license: 'not_checked',
        licenseEdition: 'unknown',
        enabledLicenseFeatures: 0,
        licenseErrorCode: 'none',
    };

    if (health.state === 'healthy' && getApiKey()) {
        try {
            const license = await getLicenseFeatures();
            snapshot.license = license?.IsValid ? 'valid' : 'invalid';
            snapshot.licenseEdition = normalizeEdition(license?.Edition);
            snapshot.enabledLicenseFeatures = Math.min(
                999,
                Array.isArray(license?.Features) ? license.Features.filter(feature => feature?.Enabled === true).length : 0,
            );
        } catch (error) {
            snapshot.license = 'unavailable';
            snapshot.licenseErrorCode = normalizeTelemetryError(error);
        }
    }

    return snapshot;
}

export function formatSupportDiagnostic(snapshot: SupportDiagnosticSnapshot): string {
    return [
        '# T-IA Connect Diagnostic',
        '',
        `Generated: ${snapshot.generatedAt}`,
        '',
        '## Environment',
        '',
        `- Extension version: ${snapshot.extensionVersion}`,
        `- VS Code version: ${snapshot.vscodeVersion}`,
        `- OAuth authenticated: ${snapshot.oauthAuthenticated}`,
        `- Local API key configured: ${snapshot.apiKeyConfigured}`,
        '',
        '## Desktop connection',
        '',
        `- Desktop installed: ${snapshot.desktopInstalled}`,
        `- Safe endpoint: ${snapshot.safeEndpoint}`,
        `- REST: ${snapshot.rest}`,
        `- REST latency: ${snapshot.restLatencyMs} ms`,
        `- REST error code: ${snapshot.restErrorCode}`,
        `- Desktop version: ${snapshot.desktopVersion}`,
        `- SignalR: ${snapshot.signalR}`,
        `- MCP: ${snapshot.mcp}`,
        '',
        '## License',
        '',
        `- Status: ${snapshot.license}`,
        `- Edition: ${snapshot.licenseEdition}`,
        `- Enabled feature count: ${snapshot.enabledLicenseFeatures}`,
        `- Error code: ${snapshot.licenseErrorCode}`,
        '',
        '## Privacy',
        '',
        'This report intentionally excludes PLC content, project and file paths, account identifiers, hostnames for remote servers, tokens, API keys, raw responses, and user messages.',
        '',
    ].join('\n');
}

export function sanitizeServerUrl(value: string): string {
    try {
        const parsed = new URL(value);
        if (!['http:', 'https:'].includes(parsed.protocol)) { return 'invalid'; }
        if (parsed.username || parsed.password) { return 'invalid'; }

        const port = parsed.port || (parsed.protocol === 'https:' ? '443' : '80');
        const host = parsed.hostname.toLowerCase();
        const isLoopback = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
        return isLoopback
            ? `${parsed.protocol}//${host}:${port}`
            : `${parsed.protocol}//<remote-host>:${port}`;
    } catch {
        return 'invalid';
    }
}

export function inspectMcpState(serverUrl: string): McpState {
    if (!getAutoConfigureMcp()) { return 'disabled'; }
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!folder) { return 'no_workspace'; }

    const mcpPath = path.join(folder.uri.fsPath, '.vscode', 'mcp.json');
    if (!fs.existsSync(mcpPath)) { return 'missing'; }

    try {
        const config = JSON.parse(fs.readFileSync(mcpPath, 'utf-8')) as Record<string, unknown>;
        const servers = config.servers as Record<string, unknown> | undefined;
        const entry = servers?.['tia-connect'] as Record<string, unknown> | undefined;
        if (!entry || entry.type !== 'sse' || typeof entry.url !== 'string') { return 'misconfigured'; }

        const headers = entry.headers as Record<string, unknown> | undefined;
        const apiKeyHeader = headers?.['X-API-Key'];
        if (typeof apiKeyHeader === 'string' && apiKeyHeader !== '${input:tiaConnectApiKey}') {
            return 'unsafe_secret_detected';
        }

        const expected = new URL('/mcp/sse', `${serverUrl.replace(/\/+$/, '')}/`);
        const actual = new URL(entry.url);
        if (actual.origin !== expected.origin || actual.pathname !== expected.pathname) { return 'misconfigured'; }
        return 'configured';
    } catch (error) {
        return error instanceof SyntaxError ? 'malformed' : 'misconfigured';
    }
}

async function probeDesktopHealth(serverUrl: string): Promise<HealthProbe> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const startedAt = Date.now();
    try {
        const response = await fetch(`${serverUrl.replace(/\/+$/, '')}/api/health`, {
            headers: getClientIdentityHeaders(),
            signal: controller.signal,
        });
        const latencyMs = Date.now() - startedAt;
        if (!response.ok) {
            return { state: 'unavailable', latencyMs, errorCode: httpErrorCode(response.status), desktopVersion: 'unknown' };
        }

        const text = await response.text();
        if (text.length > 65_536) {
            return { state: 'unavailable', latencyMs, errorCode: 'invalid_response', desktopVersion: 'unknown' };
        }
        const body = JSON.parse(text) as unknown;
        return {
            state: 'healthy',
            latencyMs,
            errorCode: 'none',
            desktopVersion: normalizeVersion(findVersion(body, 0)),
        };
    } catch (error) {
        return {
            state: 'unavailable',
            latencyMs: Date.now() - startedAt,
            errorCode: normalizeTelemetryError(error),
            desktopVersion: 'unknown',
        };
    } finally {
        clearTimeout(timeout);
    }
}

function findVersion(value: unknown, depth: number): unknown {
    if (!value || typeof value !== 'object' || depth > 4) { return undefined; }
    for (const [key, child] of Object.entries(value)) {
        if (/^(buildVersion|desktopVersion)$/i.test(key)) { return child; }
    }
    for (const child of Object.values(value)) {
        const found = findVersion(child, depth + 1);
        if (found !== undefined) { return found; }
    }
    return undefined;
}

function normalizeVersion(value: unknown): string {
    return typeof value === 'string' && /^[0-9A-Za-z][0-9A-Za-z.+-]{0,31}$/.test(value)
        ? value
        : 'unknown';
}

function normalizeEdition(value: unknown): string {
    if (typeof value !== 'string') { return 'unknown'; }
    const normalized = value.toLowerCase();
    return ['free', 'trial', 'standard', 'pro', 'professional', 'premium', 'enterprise'].includes(normalized)
        ? normalized
        : 'unknown';
}

function boundLatency(value: number): number {
    if (!Number.isFinite(value) || value <= 0) { return 0; }
    return Math.min(9999, Math.round(value));
}

function httpErrorCode(status: number): string {
    if (status === 401) { return 'unauthorized'; }
    if (status === 403) { return 'forbidden'; }
    if (status === 429) { return 'rate_limited'; }
    return status >= 500 ? 'server_error' : 'rejected';
}
