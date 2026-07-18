import * as vscode from 'vscode';
import { randomBytes, timingSafeEqual } from 'crypto';
import { log, logError } from '../views/outputChannel';
import { CONTEXT_KEYS } from '../utils/constants';
import { getClientIdentityHeaders } from '../api/clientIdentity';
import { normalizeTelemetryError, trackTelemetry } from '../telemetry/telemetry';

const TOKEN_KEY = 'tiaConnect.authToken';
const AUTH_BASE_URL = 'https://t-ia-connect.com';
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

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
    private pollTimer: ReturnType<typeof setInterval> | undefined;
    private pollRequestInFlight = false;
    private activeState: string | null = null;

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

    /** Validate the token before persisting it (used by polling and URI callback). */
    async handleToken(token: string): Promise<boolean> {
        const profile = await this.fetchProfile(token);
        if (profile) {
            await this.secrets.store(TOKEN_KEY, token);
            this.profile = profile;
            log(`Authenticated as ${profile.email}${profile.licenseType ? ` (${profile.licenseType})` : ''}`);
            vscode.commands.executeCommand('setContext', CONTEXT_KEYS.authenticated, true);
            this._onDidChangeAuth.fire(true);
            void trackTelemetry('VSCode_AuthSucceeded', { success: true, mode: 'REST' });
            return true;
        }

        void trackTelemetry('VSCode_AuthFailed', { success: false, mode: 'REST', errorCode: 'unauthorized' });
        return false;
    }

    /** Store token received from OAuth URI callback (fallback) */
    async handleAuthCallback(token: string, state: string, expectedState: string): Promise<boolean> {
        if (!secureStateEquals(state, expectedState) || !this.claimAuthState(state)) {
            logError('Auth callback state mismatch — possible CSRF attack');
            vscode.window.showErrorMessage('Authentication failed: invalid state parameter.');
            return false;
        }

        this.stopPolling();
        return this.handleToken(token);
    }

    /** Initiate login */
    async login(): Promise<string> {
        return this.openAuthPage('login');
    }

    /** Initiate registration — same OAuth flow, website shows register page */
    async register(): Promise<string> {
        return this.openAuthPage('register');
    }

    /** Open auth page in the external browser */
    private async openAuthPage(mode: 'login' | 'register'): Promise<string> {
        // Already polling → stop previous attempt and start fresh
        this.stopPolling();


        const state = generateState();
        this.activeState = state;
        const redirectUri = 'vscode://feelautom.tia-connect-vscode/auth-callback';
        const modeParam = mode === 'register' ? '&mode=register' : '';
        const url = `${AUTH_BASE_URL}/auth/vscode?state=${state}&redirect_uri=${encodeURIComponent(redirectUri)}${modeParam}`;

        await vscode.env.openExternal(vscode.Uri.parse(url));
        log(`Opened ${mode} page in external browser.`);

        this.startPolling(state);
        return state;
    }

    /** Logout — clear token and profile */
    async logout(): Promise<void> {
        await this.secrets.delete(TOKEN_KEY);
        this.profile = null;
        this.activeState = null;
        this.stopPolling();
        vscode.commands.executeCommand('setContext', CONTEXT_KEYS.authenticated, false);
        this._onDidChangeAuth.fire(false);
        log('Logged out.');
    }

    /** Validate stored token and refresh profile on startup.
     *  If a token exists, trust it immediately (fast UI) and validate in background. */
    async validateSession(): Promise<boolean> {
        const token = await this.getToken();
        if (!token) {
            vscode.commands.executeCommand('setContext', CONTEXT_KEYS.authenticated, false);
            this._onDidChangeAuth.fire(false);
            return false;
        }

        // Token exists → trust immediately for fast startup
        vscode.commands.executeCommand('setContext', CONTEXT_KEYS.authenticated, true);
        this._onDidChangeAuth.fire(true);
        log('Token found — authenticated (validating in background...)');

        // Validate + fetch profile in background (don't block startup)
        this.validateTokenInBackground(token);
        return true;
    }

    /** Background validation — logout only if server explicitly rejects the token */
    private async validateTokenInBackground(token: string): Promise<void> {
        try {
            const resp = await fetch(`${AUTH_BASE_URL}/api/auth/validate-token`, {
                headers: { ...getClientIdentityHeaders(), 'Authorization': `Bearer ${token}` },
            });

            if (resp.status === 401 || resp.status === 403) {
                log('Stored token is invalid or expired.');
                await this.logout();
                void trackTelemetry('VSCode_AuthFailed', { success: false, mode: 'REST', errorCode: 'unauthorized' });
                vscode.window.showWarningMessage('T-IA Connect: Session expired. Please sign in again.');
                return;
            }

            if (!resp.ok) {
                log(`Auth validation temporarily unavailable (HTTP ${resp.status}) — keeping session.`);
                return;
            }

            const data = await resp.json() as { valid: boolean };
            if (!data.valid) {
                log('Token rejected by server.');
                await this.logout();
                vscode.window.showWarningMessage('T-IA Connect: Session expired. Please sign in again.');
                return;
            }

            // Fetch profile
            const profile = await this.fetchProfile(token);
            if (profile) {
                this.profile = profile;
                log(`Profile loaded: ${profile.email}${profile.licenseType ? ` (${profile.licenseType})` : ''}`);
            }
        } catch {
            log('Cannot reach auth server (offline?) — keeping session.');
        }
    }

    /** Get cached profile */
    getProfile(): UserProfile | null {
        return this.profile;
    }

    /** Poll the server for a completed auth token */
    private startPolling(state: string): void {
        this.stopPolling();
        const startTime = Date.now();
        log('Polling for auth token...');


        this.pollTimer = setInterval(async () => {
            if (this.pollRequestInFlight || !secureStateEquals(this.activeState, state)) { return; }
            if (Date.now() - startTime > POLL_TIMEOUT_MS) {
                log('Auth polling timed out after 5 minutes.');
                this.activeState = null;
                this.stopPolling();
                vscode.window.showWarningMessage('T-IA Connect: Authentication timed out. Please try again.');
                return;
            }

            const pollUrl = `${AUTH_BASE_URL}/api/auth/vscode-poll?state=${encodeURIComponent(state)}`;

            try {
                this.pollRequestInFlight = true;
                const resp = await fetch(pollUrl, { headers: getClientIdentityHeaders() });
                const text = await resp.text();
                log(`Auth poll response: HTTP ${resp.status}`);

                if (!resp.ok) { return; }

                const data = JSON.parse(text) as { status: string; token?: string };

                if (data.status === 'complete' && data.token) {
                    if (!this.claimAuthState(state)) { return; }
                    this.stopPolling();

                    const success = await this.handleToken(data.token);
                    if (success) {
                        const name = this.profile?.name || this.profile?.email || '';
                        vscode.window.showInformationMessage(`T-IA Connect: Connected as ${name}`);
                    } else {
                        vscode.window.showErrorMessage('Authentication failed. Please try again.');
                    }
                }
            } catch (err) {
                log(`Auth poll request failed${err instanceof SyntaxError ? ': invalid response format' : ''}.`);
                void trackTelemetry('VSCode_AuthFailed', {
                    success: false,
                    mode: 'REST',
                    errorCode: normalizeTelemetryError(err),
                });
            } finally {
                this.pollRequestInFlight = false;
            }
        }, POLL_INTERVAL_MS);
    }

    private stopPolling(): void {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = undefined;
        }
    }

    private claimAuthState(state: string): boolean {
        if (!secureStateEquals(this.activeState, state)) { return false; }
        this.activeState = null;
        return true;
    }

    private async fetchProfile(token: string): Promise<UserProfile | null> {
        try {
            const resp = await fetch(`${AUTH_BASE_URL}/api/account/profile`, {
                headers: { ...getClientIdentityHeaders(), 'Authorization': `Bearer ${token}` },
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
        this.activeState = null;
        this.stopPolling();
        this._onDidChangeAuth.dispose();
    }
}

function generateState(): string {
    return randomBytes(32).toString('base64url');
}

function secureStateEquals(left: string | null, right: string | null): boolean {
    if (left === null || right === null) { return false; }
    const leftBytes = Buffer.from(left, 'utf8');
    const rightBytes = Buffer.from(right, 'utf8');
    return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}
