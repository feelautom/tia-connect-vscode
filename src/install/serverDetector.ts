import * as fs from 'fs';
import * as path from 'path';
import { getServerUrl } from '../utils/config';
import { log } from '../views/outputChannel';

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
