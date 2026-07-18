import * as vscode from 'vscode';

export interface WorkspaceCommandOptions {
    allowUntrusted?: boolean;
}

export class WorkspaceTrustRequiredError extends Error {
    constructor() {
        super('This T-IA Connect operation requires a trusted workspace.');
        this.name = 'WorkspaceTrustRequiredError';
    }
}

let restrictedModeNoticeShown = false;

export function registerWorkspaceCommand(
    command: string,
    callback: (...args: any[]) => unknown,
    options: WorkspaceCommandOptions = {},
): vscode.Disposable {
    return vscode.commands.registerCommand(command, (...args: any[]) => {
        if (options.allowUntrusted || vscode.workspace.isTrusted) {
            return callback(...args);
        }
        void showRestrictedModeNoticeOnce();
        return undefined;
    });
}

export function assertWorkspaceTrusted(): void {
    if (vscode.workspace.isTrusted) { return; }
    void showRestrictedModeNoticeOnce();
    throw new WorkspaceTrustRequiredError();
}

export function isWorkspaceTrusted(): boolean {
    return vscode.workspace.isTrusted;
}

export async function showRestrictedModeNoticeOnce(): Promise<void> {
    if (restrictedModeNoticeShown) { return; }
    restrictedModeNoticeShown = true;
    const manage = vscode.l10n.t('Manage Workspace Trust');
    const choice = await vscode.window.showWarningMessage(
        vscode.l10n.t('T-IA Connect is limited in Restricted Mode. Trust this workspace to run industrial operations or write files.'),
        manage,
    );
    if (choice === manage) {
        await vscode.commands.executeCommand('workbench.trust.manage');
    }
}

export function resetWorkspaceTrustNoticeForTests(): void {
    restrictedModeNoticeShown = false;
}
