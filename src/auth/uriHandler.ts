import * as vscode from 'vscode';
import { AuthService } from './authService';
import { log, logError } from '../views/outputChannel';

/**
 * Handles the vscode://feelautom.tia-connect-vscode/auth-callback URI
 * when the browser redirects back after login.
 */
export class TiaUriHandler implements vscode.UriHandler {
    private authService: AuthService;
    private pendingState: string | null = null;

    constructor(authService: AuthService) {
        this.authService = authService;
    }

    /** Set the expected state for the next callback */
    setPendingState(state: string): void {
        this.pendingState = state;
    }

    async handleUri(uri: vscode.Uri): Promise<void> {
        log(`URI callback received: ${uri.path}`);

        if (uri.path !== '/auth-callback') {
            log(`Unknown URI path: ${uri.path}`);
            return;
        }

        const params = new URLSearchParams(uri.query);
        const token = params.get('token');
        const state = params.get('state');

        if (!token) {
            logError('Auth callback missing token parameter');
            vscode.window.showErrorMessage('Authentication failed: no token received.');
            return;
        }

        if (!state || !this.pendingState) {
            logError('Auth callback missing state parameter');
            vscode.window.showErrorMessage('Authentication failed: invalid state.');
            return;
        }

        const success = await this.authService.handleAuthCallback(token, state, this.pendingState);
        this.pendingState = null;

        if (success) {
            const profile = this.authService.getProfile();
            const name = profile?.name || profile?.email || '';
            vscode.window.showInformationMessage(`T-IA Connect: Connected as ${name}`);
        } else {
            vscode.window.showErrorMessage('Authentication failed. Please try again.');
        }
    }
}
