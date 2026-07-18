import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getServerUrl, getApiKey, setApiKey } from '../utils/config';
import { log } from '../views/outputChannel';

export interface InstanceInfo {
    Pid: number;
    Port: number;
    Url: string;
    InstanceId?: string;
    ProjectName?: string;
}

/**
 * Reads the instance registry file written by T-IA Connect on startup.
 * Located at %APPDATA%\FeelAutomCorp\T-IA-Connect\instances.json
 * Returns the first live instance found, or null.
 */
export function discoverRunningInstance(): InstanceInfo | null {
    try {
        const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
        const filePath = path.join(appData, 'FeelAutomCorp', 'T-IA-Connect', 'instances.json');
        if (!fs.existsSync(filePath)) return null;
        const raw = fs.readFileSync(filePath, 'utf-8');
        const instances = JSON.parse(raw) as InstanceInfo[];
        if (!Array.isArray(instances) || instances.length === 0) return null;
        const instance = instances[0];
        log(`Instance registry: found instance on port ${instance.Port} (PID ${instance.Pid})`);
        return instance;
    } catch {
        return null;
    }
}

const DEFAULT_INSTALL_PATHS = [
    'C:\\Program Files\\FeelAutomCorp\\TiaConnect\\TiaPortalApi.App.exe',
    'C:\\Program Files\\FEELAUTOM\\TIA Connect\\TiaConnect.exe',
    'C:\\Program Files (x86)\\FEELAUTOM\\TIA Connect\\TiaConnect.exe',
];

export interface ServerStatus {
    /** Server is responding to health check */
    running: boolean;
    /** Server executable found on disk */
    installed: boolean;
    /** Path to the executable (if found) */
    exePath?: string;
}

/** Detect whether T-IA Connect server is running and/or installed */
export async function detectServer(): Promise<ServerStatus> {
    const running = await isServerRunning();
    const { installed, exePath } = isServerInstalled();

    log(`Server detection: running=${running}, installed=${installed}${exePath ? ` (${exePath})` : ''}`);

    return { running, installed, exePath };
}

/** Ping the server health endpoint */
export async function isServerRunning(): Promise<boolean> {
    const url = getServerUrl().replace(/\/+$/, '');
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);

        const resp = await fetch(`${url}/api/health`, {
            signal: controller.signal,
        });
        clearTimeout(timeout);
        return resp.ok;
    } catch {
        return false;
    }
}

/** Check if the server executable exists on disk */
export function isServerInstalled(): { installed: boolean; exePath?: string } {
    for (const p of DEFAULT_INSTALL_PATHS) {
        if (fs.existsSync(p)) {
            return { installed: true, exePath: p };
        }
    }

    // Also check if there's a custom path in a known location
    const appDataPath = process.env.LOCALAPPDATA;
    if (appDataPath) {
        const candidates = [
            path.join(appDataPath, 'FeelAutomCorp', 'TiaConnect', 'TiaPortalApi.App.exe'),
            path.join(appDataPath, 'FEELAUTOM', 'TIA Connect', 'TiaConnect.exe'),
        ];
        for (const localPath of candidates) {
            if (fs.existsSync(localPath)) {
                return { installed: true, exePath: localPath };
            }
        }
    }

    // Check the user-configured path from settings
    try {
        const vscode = require('vscode');
        const configPath: string = vscode.workspace.getConfiguration('tiaConnect').get('executablePath', '');
        if (configPath && fs.existsSync(configPath)) {
            return { installed: true, exePath: configPath };
        }
    } catch {
        // Not in VS Code context
    }

    return { installed: false };
}

/** Fetch the API key from the local server (localhost-only endpoint, no auth required).
 *  Stores it in VS Code SecretStorage if the current key is empty or different. */
export async function fetchLocalApiKey(): Promise<boolean> {
    const url = getServerUrl().replace(/\/+$/, '');
    if (!isLoopbackServerUrl(url)) {
        log('Local API key request refused: server URL is not loopback.');
        return false;
    }
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);

        const resp = await fetch(`${url}/api/auth/local-key`, {
            signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!resp.ok) {
            log(`Failed to fetch local API key: HTTP ${resp.status}`);
            return false;
        }

        const body = await resp.json() as Record<string, unknown>;
        // Handle nested response format: { response: { data: { apiKey } } } or flat { apiKey }
        const nested = (body.response as Record<string, unknown>)?.data as Record<string, string> | undefined;
        const flat = body as Record<string, string>;
        const key = nested?.apiKey || nested?.ApiKey || flat.apiKey || flat.ApiKey;
        if (!key) {
            log('Local API key endpoint returned empty key.');
            return false;
        }

        const currentKey = getApiKey();
        if (currentKey !== key) {
            await setApiKey(key);
            log('API key auto-configured from local server.');
        }
        return true;
    } catch {
        // Endpoint not available (older server version)
        return false;
    }
}

/** Only the literal loopback hosts may use the unauthenticated local-key endpoint. */
export function isLoopbackServerUrl(value: string): boolean {
    try {
        const parsed = new URL(value);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') { return false; }
        if (parsed.username !== '' || parsed.password !== '') { return false; }
        return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '[::1]';
    } catch {
        return false;
    }
}
