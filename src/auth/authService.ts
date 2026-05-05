import * as vscode from 'vscode';
import { log, logError } from '../views/outputChannel';
import { CONTEXT_KEYS } from '../utils/constants';
import { setApiKey } from '../utils/config';

const TOKEN_KEY = 'tiaConnect.authToken';
const AUTH_BASE_URL = 'https://t-ia-connect.com';

export interface UserProfile {
    id: string;
    email: string;
    name: string;
    company?: string;
    licenseType: string;
    licenseExpiry?: string;
    apiKey: string;
    features: string[];
}

export class AuthService implements vscode.Disposable {
    private secrets: vscode.SecretStorage;
    private profile: UserProfile | null = null;
    private _onDidChangeAuth = new vscode.EventEmitter<boolean>();
    readonly onDidChangeAuth = this._onDidChangeAuth.event;

    constructor(context: vscode.ExtensionContext) {
        this.secrets = context.secrets;
    }

    /** Check if user is authenticated (has a stored token) */
    async isAuthenticated(): Promise<boolean> {
        const token = await this.getToken();
        return !!token;
    }

    /** Get the stored JWT token */
    async getToken(): Promise<string | undefined> {
        return this.secrets.get(TOKEN_KEY);
    }

    /** Store token received from OAuth callback */
    async handleAuthCallback(token: string, state: string, expectedState: string): Promise<boolean> {
        if (state !== expectedState) {
            logError('Auth callback state mismatch — possible CSRF attack');
            vscode.window.showErrorMessage('Authentication failed: invalid state parameter.');
            return false;
        }

        await this.secrets.store(TOKEN_KEY, token);
        log('Auth token stored successfully.');

        // Fetch profile and set API key
        const profile = await this.fetchProfile(token);
        if (profile) {
            this.profile = profile;
            await setApiKey(profile.apiKey);
            log(`Authenticated as ${profile.email} (${profile.licenseType})`);
            vscode.commands.executeCommand('setContext', CONTEXT_KEYS.authenticated, true);
            this._onDidChangeAuth.fire(true);
            return true;
        }

        return false;
    }

    /** Initiate login by opening the browser */
    async login(): Promise<string> {
        const state = generateState();
        const redirectUri = 'vscode://feelautom.tia-connect-vscode/auth-callback';
        const url = `${AUTH_BASE_URL}/auth/vscode?state=${state}&redirect_uri=${encodeURIComponent(redirectUri)}`;

        await vscode.env.openExternal(vscode.Uri.parse(url));
        log('Opened browser for authentication...');
        return state;
    }

    /** Open the registration page */
    async register(): Promise<void> {
        const url = `${AUTH_BASE_URL}/auth/vscode?mode=register`;
        await vscode.env.openExternal(vscode.Uri.parse(url));
        log('Opened browser for registration...');
    }

    /** Logout — clear token and profile */
    async logout(): Promise<void> {
        await this.secrets.delete(TOKEN_KEY);
        this.profile = null;
        vscode.commands.executeCommand('setContext', CONTEXT_KEYS.authenticated, false);
        this._onDidChangeAuth.fire(false);
        log('Logged out.');
    }

    /** Validate stored token and refresh profile on startup */
    async validateSession(): Promise<boolean> {
        const token = await this.getToken();
        if (!token) {
            vscode.commands.executeCommand('setContext', CONTEXT_KEYS.authenticated, false);
            return false;
        }

        try {
            const resp = await fetch(`${AUTH_BASE_URL}/api/auth/validate-token`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });

            if (!resp.ok) {
                log('Stored token is invalid or expired. Please login again.');
                await this.logout();
                return false;
            }

            const data = await resp.json() as { valid: boolean };
            if (!data.valid) {
                await this.logout();
                return false;
            }

            // Token is valid — fetch profile
            const profile = await this.fetchProfile(token);
            if (profile) {
                this.profile = profile;
                await setApiKey(profile.apiKey);
                vscode.commands.executeCommand('setContext', CONTEXT_KEYS.authenticated, true);
                this._onDidChangeAuth.fire(true);
                return true;
            }

            return false;
        } catch {
            // Network error — don't logout, just can't validate right now
            log('Cannot reach auth server to validate token (offline?)');
            vscode.commands.executeCommand('setContext', CONTEXT_KEYS.authenticated, true);
            return true;
        }
    }

    /** Get cached profile */
    getProfile(): UserProfile | null {
        return this.profile;
    }

    private async fetchProfile(token: string): Promise<UserProfile | null> {
        try {
            const resp = await fetch(`${AUTH_BASE_URL}/api/account/profile`, {
                headers: { 'Authorization': `Bearer ${token}` },
            });

            if (!resp.ok) {
                logError('Failed to fetch user profile', new Error(`HTTP ${resp.status}`));
                return null;
            }

            return await resp.json() as UserProfile;
        } catch (err) {
            logError('Failed to fetch user profile', err);
            return null;
        }
    }

    dispose(): void {
        this._onDidChangeAuth.dispose();
    }
}

function generateState(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < 32; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}
