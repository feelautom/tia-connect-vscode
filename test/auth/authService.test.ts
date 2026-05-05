import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock outputChannel before importing
vi.mock('../../src/views/outputChannel', () => ({
    log: () => {},
    logError: () => {},
}));

// Mock config
vi.mock('../../src/utils/config', () => ({
    setApiKey: vi.fn(),
    getServerUrl: () => 'http://localhost:9000',
}));

import { AuthService, UserProfile } from '../../src/auth/authService';
import { commands } from 'vscode';

// Create a mock ExtensionContext with SecretStorage
function createMockContext() {
    const store = new Map<string, string>();
    return {
        secrets: {
            get: vi.fn(async (key: string) => store.get(key)),
            store: vi.fn(async (key: string, value: string) => { store.set(key, value); }),
            delete: vi.fn(async (key: string) => { store.delete(key); }),
            onDidChange: () => ({ dispose: () => {} }),
        },
        subscriptions: [],
    } as any;
}

describe('AuthService', () => {
    let authService: AuthService;
    let context: ReturnType<typeof createMockContext>;

    beforeEach(() => {
        vi.restoreAllMocks();
        context = createMockContext();
        authService = new AuthService(context);
    });

    describe('isAuthenticated', () => {
        it('returns false when no token stored', async () => {
            expect(await authService.isAuthenticated()).toBe(false);
        });

        it('returns true when token is stored', async () => {
            await context.secrets.store('tiaConnect.authToken', 'test-token');
            expect(await authService.isAuthenticated()).toBe(true);
        });
    });

    describe('getToken', () => {
        it('returns undefined when no token stored', async () => {
            expect(await authService.getToken()).toBeUndefined();
        });

        it('returns stored token', async () => {
            await context.secrets.store('tiaConnect.authToken', 'my-jwt');
            expect(await authService.getToken()).toBe('my-jwt');
        });
    });

    describe('handleToken', () => {
        it('stores token and fetches profile on success', async () => {
            const mockProfile: UserProfile = {
                id: '123', email: 'test@example.com', name: 'Test User',
                licenseType: 'pro', apiKey: 'key-123', features: [],
            };

            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
                ok: true,
                json: async () => mockProfile,
            }));

            const result = await authService.handleToken('valid-token');
            expect(result).toBe(true);
            expect(authService.getProfile()?.email).toBe('test@example.com');
            expect(await authService.getToken()).toBe('valid-token');

            vi.unstubAllGlobals();
        });

        it('returns false when profile fetch fails', async () => {
            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
                ok: false,
                status: 500,
            }));

            const result = await authService.handleToken('bad-token');
            expect(result).toBe(false);
            expect(authService.getProfile()).toBeNull();

            vi.unstubAllGlobals();
        });
    });

    describe('handleAuthCallback', () => {
        it('rejects mismatched state', async () => {
            const result = await authService.handleAuthCallback('token', 'state-A', 'state-B');
            expect(result).toBe(false);
        });

        it('accepts matching state and stores token', async () => {
            const mockProfile: UserProfile = {
                id: '1', email: 'a@b.com', name: 'A',
                licenseType: 'free', apiKey: 'k', features: [],
            };

            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
                ok: true,
                json: async () => mockProfile,
            }));

            const result = await authService.handleAuthCallback('tok', 'state-X', 'state-X');
            expect(result).toBe(true);

            vi.unstubAllGlobals();
        });
    });

    describe('logout', () => {
        it('clears token and profile', async () => {
            // Setup: store a token first
            await context.secrets.store('tiaConnect.authToken', 'tok');

            await authService.logout();

            expect(await authService.getToken()).toBeUndefined();
            expect(authService.getProfile()).toBeNull();
        });
    });

    describe('validateSession', () => {
        it('returns false and fires event when no token', async () => {
            let authState: boolean | undefined;
            authService.onDidChangeAuth((v) => { authState = v; });

            const result = await authService.validateSession();
            expect(result).toBe(false);
            expect(authState).toBe(false);
        });

        it('returns true when token is valid', async () => {
            await context.secrets.store('tiaConnect.authToken', 'valid');

            const mockProfile: UserProfile = {
                id: '1', email: 'a@b.com', name: 'A',
                licenseType: 'free', apiKey: 'k', features: [],
            };

            vi.stubGlobal('fetch', vi.fn()
                .mockResolvedValueOnce({ ok: true, json: async () => ({ valid: true }) })
                .mockResolvedValueOnce({ ok: true, json: async () => mockProfile })
            );

            let authState: boolean | undefined;
            authService.onDidChangeAuth((v) => { authState = v; });

            const result = await authService.validateSession();
            expect(result).toBe(true);
            expect(authState).toBe(true);

            vi.unstubAllGlobals();
        });

        it('returns true on network error (offline mode)', async () => {
            await context.secrets.store('tiaConnect.authToken', 'tok');

            vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network error')));

            let authState: boolean | undefined;
            authService.onDidChangeAuth((v) => { authState = v; });

            const result = await authService.validateSession();
            expect(result).toBe(true);
            expect(authState).toBe(true);

            vi.unstubAllGlobals();
        });

        it('logs out when server says token is invalid', async () => {
            await context.secrets.store('tiaConnect.authToken', 'expired');

            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({ valid: false }),
            }));

            const result = await authService.validateSession();
            expect(result).toBe(false);
            expect(await authService.getToken()).toBeUndefined();

            vi.unstubAllGlobals();
        });
    });

    describe('onDidChangeAuth', () => {
        it('fires event on handleToken success', async () => {
            const mockProfile: UserProfile = {
                id: '1', email: 'a@b.com', name: 'A',
                licenseType: 'free', apiKey: 'k', features: [],
            };

            vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
                ok: true,
                json: async () => mockProfile,
            }));

            let fired = false;
            authService.onDidChangeAuth(() => { fired = true; });

            await authService.handleToken('tok');
            expect(fired).toBe(true);

            vi.unstubAllGlobals();
        });

        it('fires event on logout', async () => {
            let authState: boolean | undefined;
            authService.onDidChangeAuth((v) => { authState = v; });

            await authService.logout();
            expect(authState).toBe(false);
        });
    });

    describe('dispose', () => {
        it('does not throw', () => {
            expect(() => authService.dispose()).not.toThrow();
        });
    });
});
