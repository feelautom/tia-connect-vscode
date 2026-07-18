import { beforeEach, describe, expect, it, vi } from 'vitest';
import { env, window, workspace } from 'vscode';

vi.mock('../../src/diagnostics/supportDiagnostic', () => ({
    collectSupportDiagnostic: vi.fn(async () => ({ safe: true })),
    formatSupportDiagnostic: vi.fn(() => '# Safe diagnostic report'),
}));

import { offerReportCopy, runDiagnosticCommand } from '../../src/commands/diagnosticCommands';
import { collectSupportDiagnostic } from '../../src/diagnostics/supportDiagnostic';

describe('diagnostic command', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('opens the report and offers an explicit copy action', async () => {
        vi.spyOn(window, 'withProgress').mockImplementation(async (_options: any, task: any) => task());
        vi.spyOn(workspace, 'openTextDocument').mockResolvedValue({ uri: { scheme: 'untitled' } } as any);
        vi.spyOn(window, 'showTextDocument').mockResolvedValue(undefined as any);
        vi.spyOn(window, 'showInformationMessage')
            .mockResolvedValueOnce('Copy Report' as any)
            .mockResolvedValueOnce(undefined as any);
        const copy = vi.spyOn(env.clipboard, 'writeText').mockResolvedValue(undefined);

        await runDiagnosticCommand({ isAuthenticated: async () => true } as any);

        expect(workspace.openTextDocument).toHaveBeenCalledWith({
            content: '# Safe diagnostic report',
            language: 'markdown',
        });
        await vi.waitFor(() => expect(copy).toHaveBeenCalledWith('# Safe diagnostic report'));
    });

    it('does not copy when the user dismisses the action', async () => {
        vi.spyOn(window, 'withProgress').mockImplementation(async (_options: any, task: any) => task());
        vi.spyOn(workspace, 'openTextDocument').mockResolvedValue({ uri: { scheme: 'untitled' } } as any);
        vi.spyOn(window, 'showTextDocument').mockResolvedValue(undefined as any);
        vi.spyOn(window, 'showInformationMessage').mockResolvedValue(undefined as any);
        const copy = vi.spyOn(env.clipboard, 'writeText').mockResolvedValue(undefined);

        await offerReportCopy('# Safe diagnostic report');

        expect(copy).not.toHaveBeenCalled();
    });

    it('reports collection failures without exposing the raw error', async () => {
        vi.mocked(collectSupportDiagnostic).mockRejectedValueOnce(new Error('token=secret project=C:\\Private'));
        vi.spyOn(window, 'withProgress').mockImplementation(async (_options: any, task: any) => task());
        const showError = vi.spyOn(window, 'showErrorMessage').mockResolvedValue(undefined as any);
        const openDocument = vi.spyOn(workspace, 'openTextDocument');

        await runDiagnosticCommand({ isAuthenticated: async () => true } as any);

        expect(showError).toHaveBeenCalledWith('T-IA Connect diagnostic could not be generated.');
        expect(JSON.stringify(showError.mock.calls)).not.toContain('token=secret');
        expect(openDocument).not.toHaveBeenCalled();
    });
});
