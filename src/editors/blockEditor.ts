import * as vscode from 'vscode';
import { exportBlockSource, importAndGenerate, compileBlock } from '../api/blocks';
import { BlockFileManager } from './blockFileManager';
import { TiaTreeItem } from '../providers/projectTreeProvider';
import { getAutoReimport, getAutoCompile } from '../utils/config';
import { log, logError } from '../views/outputChannel';

export class BlockEditor {
    private fileManager = new BlockFileManager();
    private saveListener: vscode.Disposable | undefined;

    activate(context: vscode.ExtensionContext): void {
        this.saveListener = vscode.workspace.onDidSaveTextDocument(
            (doc) => this.onDocumentSaved(doc)
        );
        context.subscriptions.push(this.saveListener);
    }

    /** Open a block for editing in VS Code */
    async openBlock(item: TiaTreeItem): Promise<void> {
        if (!item.deviceName || !item.blockName || !item.language) {
            vscode.window.showErrorMessage('Cannot open this block: missing metadata.');
            return;
        }

        try {
            const result = await vscode.window.withProgress(
                { location: vscode.ProgressLocation.Notification, title: `Exporting ${item.blockName}...` },
                () => exportBlockSource(item.deviceName!, item.blockName!)
            );

            const filePath = this.fileManager.writeBlock(
                item.deviceName,
                item.blockName,
                item.language,
                result.Content
            );

            const doc = await vscode.workspace.openTextDocument(filePath);
            await vscode.window.showTextDocument(doc);
            log(`Opened block ${item.blockName} from ${item.deviceName}`);
        } catch (err) {
            logError(`Failed to open block ${item.blockName}`, err);
            vscode.window.showErrorMessage(`Failed to open block: ${err instanceof Error ? err.message : err}`);
        }
    }

    /** Handle document save — reimport into TIA Portal */
    private async onDocumentSaved(doc: vscode.TextDocument): Promise<void> {
        if (!getAutoReimport()) { return; }
        if (!this.fileManager.isManagedFile(doc.uri.fsPath)) { return; }

        const meta = this.fileManager.readMetadata(doc.uri.fsPath);
        if (!meta) { return; }

        log(`Auto-reimporting ${meta.blockName} to ${meta.deviceName}...`);

        try {
            const content = doc.getText();
            const result = await importAndGenerate(meta.deviceName, content);

            if (result.Success) {
                vscode.window.showInformationMessage(`Block ${meta.blockName} reimported successfully.`);
                log(`Reimport OK: ${meta.blockName}`);

                if (getAutoCompile()) {
                    await this.autoCompile(meta.deviceName, meta.blockName);
                }
            } else {
                vscode.window.showWarningMessage(`Reimport warning: ${result.Message}`);
                log(`Reimport warning: ${result.Message}`);
            }
        } catch (err) {
            logError(`Reimport failed for ${meta.blockName}`, err);
            vscode.window.showErrorMessage(`Reimport failed: ${err instanceof Error ? err.message : err}`);
        }
    }

    private async autoCompile(deviceName: string, blockName: string): Promise<void> {
        try {
            log(`Auto-compiling ${blockName}...`);
            const result = await compileBlock(deviceName, blockName);
            if (result.ErrorCount === 0) {
                log(`Compilation OK: ${result.WarningCount} warning(s)`);
            } else {
                vscode.window.showWarningMessage(
                    `Compilation: ${result.ErrorCount} error(s), ${result.WarningCount} warning(s)`
                );
            }
        } catch (err) {
            logError('Auto-compile failed', err);
        }
    }

    dispose(): void {
        this.saveListener?.dispose();
        this.fileManager.cleanup();
    }
}
