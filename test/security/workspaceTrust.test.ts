import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import {
    assertWorkspaceTrusted,
    registerWorkspaceCommand,
    resetWorkspaceTrustNoticeForTests,
    WorkspaceTrustRequiredError,
} from '../../src/security/workspaceTrust';

describe('workspace trust guard', () => {
    beforeEach(() => {
        (vscode.workspace as any).isTrusted = true;
        resetWorkspaceTrustNoticeForTests();
        vi.restoreAllMocks();
    });

    it('runs guarded commands in trusted workspaces', async () => {
        let handler: (...args: unknown[]) => unknown = () => undefined;
        vi.spyOn(vscode.commands, 'registerCommand').mockImplementation(((_name, callback) => {
            handler = callback;
            return { dispose: vi.fn() };
        }) as any);
        const callback = vi.fn();
        registerWorkspaceCommand('test.command', callback);
        await handler('value');
        expect(callback).toHaveBeenCalledWith('value');
    });

    it('blocks guarded commands and shows one notice in restricted mode', async () => {
        (vscode.workspace as any).isTrusted = false;
        let handler: (...args: unknown[]) => unknown = () => undefined;
        vi.spyOn(vscode.commands, 'registerCommand').mockImplementation(((_name, callback) => {
            handler = callback;
            return { dispose: vi.fn() };
        }) as any);
        const warning = vi.spyOn(vscode.window, 'showWarningMessage');
        const callback = vi.fn();
        registerWorkspaceCommand('test.command', callback);
        await handler();
        await handler();
        expect(callback).not.toHaveBeenCalled();
        expect(warning).toHaveBeenCalledTimes(1);
    });

    it('allows explicitly safe commands in restricted mode', async () => {
        (vscode.workspace as any).isTrusted = false;
        let handler: (...args: unknown[]) => unknown = () => undefined;
        vi.spyOn(vscode.commands, 'registerCommand').mockImplementation(((_name, callback) => {
            handler = callback;
            return { dispose: vi.fn() };
        }) as any);
        const callback = vi.fn();
        registerWorkspaceCommand('test.safe', callback, { allowUntrusted: true });
        await handler();
        expect(callback).toHaveBeenCalledOnce();
    });

    it('rejects programmatic mutations in restricted mode', () => {
        (vscode.workspace as any).isTrusted = false;
        expect(() => assertWorkspaceTrusted()).toThrow(WorkspaceTrustRequiredError);
    });
});
