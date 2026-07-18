import * as vscode from 'vscode';
import { getClientIdentityHeaders, getExtensionVersion } from '../api/clientIdentity';
import { getApiKey, getServerUrl } from '../utils/config';

export const TELEMETRY_ENDPOINT = '/api/telemetry/client-events';

export type TelemetryEventName =
    | 'VSCode_ExtensionActivated'
    | 'VSCode_ExtensionDeactivated'
    | 'VSCode_AuthSucceeded'
    | 'VSCode_AuthFailed'
    | 'VSCode_DesktopDetected'
    | 'VSCode_DesktopConnected'
    | 'VSCode_DesktopConnectionFailed'
    | 'VSCode_CommandExecuted'
    | 'VSCode_SignalRConnected'
    | 'VSCode_SignalRFailed'
    | 'VSCode_McpConfigured'
    | 'VSCode_McpConfigurationFailed';

export type TelemetryMode = 'REST' | 'MCP' | 'SignalR';
export type CommandCategory =
    | 'auth'
    | 'blocks'
    | 'copilot'
    | 'health'
    | 'hmi'
    | 'jobs'
    | 'licensing'
    | 'pipelines'
    | 'project'
    | 'tags'
    | 'tests'
    | 'vcs'
    | 'other';

export type TelemetryErrorCode =
    | 'cancelled'
    | 'forbidden'
    | 'invalid_response'
    | 'offline'
    | 'rate_limited'
    | 'rejected'
    | 'timeout'
    | 'unauthorized'
    | 'unknown'
    | 'unsupported';

export interface TelemetryProperties {
    success?: boolean;
    durationMs?: number;
    mode?: TelemetryMode;
    commandCategory?: CommandCategory;
    errorCode?: TelemetryErrorCode;
    desktopVersion?: string;
}

interface TelemetryPayload extends TelemetryProperties {
    eventName: TelemetryEventName;
    extensionVersion: string;
    vscodeVersion: string;
}

const EVENT_NAMES = new Set<TelemetryEventName>([
    'VSCode_ExtensionActivated',
    'VSCode_ExtensionDeactivated',
    'VSCode_AuthSucceeded',
    'VSCode_AuthFailed',
    'VSCode_DesktopDetected',
    'VSCode_DesktopConnected',
    'VSCode_DesktopConnectionFailed',
    'VSCode_CommandExecuted',
    'VSCode_SignalRConnected',
    'VSCode_SignalRFailed',
    'VSCode_McpConfigured',
    'VSCode_McpConfigurationFailed',
]);
const MODES = new Set<TelemetryMode>(['REST', 'MCP', 'SignalR']);
const COMMAND_CATEGORIES = new Set<CommandCategory>([
    'auth', 'blocks', 'copilot', 'health', 'hmi', 'jobs', 'licensing',
    'pipelines', 'project', 'tags', 'tests', 'vcs', 'other',
]);
const ERROR_CODES = new Set<TelemetryErrorCode>([
    'cancelled', 'forbidden', 'invalid_response', 'offline', 'rate_limited',
    'rejected', 'timeout', 'unauthorized', 'unknown', 'unsupported',
]);

let endpointSupported = true;

export async function trackTelemetry(
    eventName: TelemetryEventName,
    properties: TelemetryProperties = {},
): Promise<void> {
    if (!endpointSupported) { return; }

    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
        if (!EVENT_NAMES.has(eventName)) { return; }
        const payload = buildTelemetryPayload(eventName, properties);
        const apiKey = getApiKey();
        const controller = new AbortController();
        timeout = setTimeout(() => controller.abort(), 1000);
        const headers: Record<string, string> = {
            ...getClientIdentityHeaders(),
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        };
        if (apiKey) { headers['X-API-Key'] = apiKey; }

        const response = await fetch(`${getServerUrl().replace(/\/+$/, '')}${TELEMETRY_ENDPOINT}`, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload),
            signal: controller.signal,
        });

        if (response.status === 404 || response.status === 405 || response.status === 501) {
            endpointSupported = false;
        }
    } catch {
        // Best effort only: telemetry must never affect extension behavior.
    } finally {
        if (timeout) { clearTimeout(timeout); }
    }
}

export function buildTelemetryPayload(
    eventName: TelemetryEventName,
    properties: TelemetryProperties = {},
): TelemetryPayload {
    const payload: TelemetryPayload = {
        eventName,
        extensionVersion: getExtensionVersion(),
        vscodeVersion: vscode.version,
    };

    if (typeof properties.success === 'boolean') { payload.success = properties.success; }
    if (typeof properties.durationMs === 'number') { payload.durationMs = boundDuration(properties.durationMs); }
    if (properties.mode !== undefined && MODES.has(properties.mode)) { payload.mode = properties.mode; }
    if (properties.commandCategory !== undefined && COMMAND_CATEGORIES.has(properties.commandCategory)) {
        payload.commandCategory = properties.commandCategory;
    }
    if (properties.errorCode !== undefined && ERROR_CODES.has(properties.errorCode)) {
        payload.errorCode = properties.errorCode;
    }
    if (properties.desktopVersion !== undefined && /^\d+(?:\.\d+){1,3}$/.test(properties.desktopVersion)) {
        payload.desktopVersion = properties.desktopVersion;
    }

    return payload;
}

export function categorizeApiPath(path: string): CommandCategory {
    const normalized = path.toLowerCase();
    if (normalized.startsWith('/api/health')) { return 'health'; }
    if (normalized.includes('/auth/')) { return 'auth'; }
    if (normalized.includes('/copilot')) { return 'copilot'; }
    if (normalized.includes('/hmi/')) { return 'hmi'; }
    if (normalized.includes('/jobs/')) { return 'jobs'; }
    if (normalized.includes('/licens')) { return 'licensing'; }
    if (normalized.includes('/pipelines')) { return 'pipelines'; }
    if (normalized.includes('/source-control') || normalized.includes('/vcs')) { return 'vcs'; }
    if (normalized.includes('/test')) { return 'tests'; }
    if (normalized.includes('/tag') || normalized.includes('/udt') || normalized.includes('/watch-table')) { return 'tags'; }
    if (normalized.includes('/block') || normalized.includes('/external-source')) { return 'blocks'; }
    if (normalized.includes('/project') || normalized.includes('/device')) { return 'project'; }
    return 'other';
}

export function normalizeTelemetryError(error: unknown): TelemetryErrorCode {
    if (error instanceof DOMException && error.name === 'AbortError') { return 'timeout'; }
    if (!(error instanceof Error)) { return 'unknown'; }

    const message = error.message.toLowerCase();
    if (message.includes('cancel')) { return 'cancelled'; }
    if (message.includes('timeout') || message.includes('timed out')) { return 'timeout'; }
    if (message.includes('cannot reach') || message.includes('offline') || message.includes('fetch')) { return 'offline'; }
    if (message.includes('unauthor') || message.includes('authentication')) { return 'unauthorized'; }
    if (message.includes('forbidden') || message.includes('license edition')) { return 'forbidden'; }
    if (message.includes('rate limit') || message.includes('quota')) { return 'rate_limited'; }
    if (message.includes('invalid json') || error instanceof SyntaxError) { return 'invalid_response'; }
    return 'rejected';
}

export function resetTelemetrySupportForTests(): void {
    endpointSupported = true;
}

function boundDuration(value: number): number {
    if (!Number.isFinite(value) || value <= 0) { return 0; }
    return Math.min(60_000, Math.round(value));
}
