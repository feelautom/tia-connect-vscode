import * as vscode from 'vscode';
import { AuthService } from '../auth/authService';
import { collectSupportDiagnostic, formatSupportDiagnostic } from '../diagnostics/supportDiagnostic';

export function registerDiagnosticCommands(
    context: vscode.ExtensionContext,
    authService: AuthService,
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('tiaConnect.diagnostic', () => runDiagnosticCommand(authService)),
    );
}

export async function runDiagnosticCommand(authService: AuthService): Promise<void> {
    let report: string;
    try {
        report = await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: vscode.l10n.t('Collecting T-IA Connect diagnostic...'),
                cancellable: false,
            },
            async () => formatSupportDiagnostic(await collectSupportDiagnostic({
                isAuthenticated: () => authService.isAuthenticated(),
            })),
        );
    } catch {
        vscode.window.showErrorMessage(vscode.l10n.t('T-IA Connect diagnostic could not be generated.'));
        return;
    }

    const document = await vscode.workspace.openTextDocument({
        content: report,
        language: 'markdown',
    });
    await vscode.window.showTextDocument(document, { preview: true });

    void offerReportCopy(report);
}

export async function offerReportCopy(report: string): Promise<void> {
    try {
        const copy = vscode.l10n.t('Copy Report');
        const choice = await vscode.window.showInformationMessage(
            vscode.l10n.t('T-IA Connect diagnostic report generated.'),
            copy,
        );
        if (choice === copy) {
            await vscode.env.clipboard.writeText(report);
            vscode.window.showInformationMessage(vscode.l10n.t('Diagnostic report copied.'));
        }
    } catch {
        vscode.window.showErrorMessage(vscode.l10n.t('Diagnostic report could not be copied.'));
    }
}
