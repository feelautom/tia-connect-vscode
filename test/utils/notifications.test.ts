import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import {
    resetNotificationDeduplicationForTests,
    showBackgroundStatus,
    showDeduplicatedError,
    showDeduplicatedWarning,
} from '../../src/utils/notifications';

describe('notifications', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        resetNotificationDeduplicationForTests();
    });

    it('deduplicates identical errors inside the configured window', () => {
        const show = vi.spyOn(vscode.window, 'showErrorMessage');
        vi.spyOn(Date, 'now').mockReturnValueOnce(1_000).mockReturnValueOnce(1_100).mockReturnValueOnce(20_000);
        showDeduplicatedError('same error');
        showDeduplicatedError('same error');
        showDeduplicatedError('same error');
        expect(show).toHaveBeenCalledTimes(2);
    });

    it('does not merge distinct warning text', () => {
        const show = vi.spyOn(vscode.window, 'showWarningMessage');
        showDeduplicatedWarning('first');
        showDeduplicatedWarning('second');
        expect(show).toHaveBeenCalledTimes(2);
    });

    it('uses the status bar for background success messages', () => {
        const status = vi.spyOn(vscode.window, 'setStatusBarMessage');
        showBackgroundStatus('Saved', 2_000);
        expect(status).toHaveBeenCalledWith('$(check) Saved', 2_000);
    });
});
