import * as vscode from 'vscode';
import { getBlockContent, importAndGenerate, compileBlock, exportBlockXml } from '../api/blocks';
import { BlockFileManager } from './blockFileManager';
import { TiaTreeItem } from '../providers/projectTreeProvider';
import { getAutoReimport, getAutoCompile } from '../utils/config';
import { EDITABLE_LANGUAGES } from '../utils/constants';
import { log, logError } from '../views/outputChannel';
import { updateDiagnostics, clearDiagnostics } from '../views/diagnostics';

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

        const isEditable = EDITABLE_LANGUAGES.includes(item.language.toUpperCase() as any);

        try {
            if (isEditable) {
                await this.openEditableBlock(item);
            } else {
                await this.openReadOnlyBlock(item);
            }
        } catch (err) {
            logError(`Failed to open block ${item.blockName}`, err);
            vscode.window.showErrorMessage(`Failed to open block: ${err instanceof Error ? err.message : err}`);
        }
    }

    /** Open SCL/STL block for editing */
    private async openEditableBlock(item: TiaTreeItem): Promise<void> {
        const content = await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: `Loading ${item.blockName}...` },
            async () => {
                const dto = await getBlockContent(item.deviceName!, item.blockName!);

                if (dto.SourceText) {
                    return dto.SourceText;
                }

                // Fallback: try to extract SCL from RawXml
                if (dto.RawXml) {
                    log(`No SourceText for ${item.blockName}, showing RawXml as fallback.`);
                    return dto.RawXml;
                }

                throw new Error(`No source code available for ${item.blockName}. The block may need compilation first.`);
            }
        );

        const filePath = this.fileManager.writeBlock(
            item.deviceName!,
            item.blockName!,
            item.language!,
            content
        );

        const doc = await vscode.workspace.openTextDocument(filePath);
        await vscode.window.showTextDocument(doc);
        log(`Opened block ${item.blockName} from ${item.deviceName}`);
    }

    /** Open LAD/FBD/GRAPH block as read-only XML */
    private async openReadOnlyBlock(item: TiaTreeItem): Promise<void> {
        const xml = await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: `Exporting ${item.blockName} (XML)...` },
            () => exportBlockXml(item.deviceName!, item.blockName!)
        );

        const filePath = this.fileManager.writeBlock(
            item.deviceName!,
            item.blockName!,
            'xml',
            xml
        );

        const doc = await vscode.workspace.openTextDocument(filePath);
        await vscode.window.showTextDocument(doc, { preview: true });
        log(`Opened block ${item.blockName} as read-only XML`);
    }

    /** Handle document save — reimport into TIA Portal */
    private async onDocumentSaved(doc: vscode.TextDocument): Promise<void> {
        if (!getAutoReimport()) { return; }
        if (!this.fileManager.isManagedFile(doc.uri.fsPath)) { return; }

        const meta = this.fileManager.readMetadata(doc.uri.fsPath);
        if (!meta) { return; }

        // Only reimport editable languages
        if (!EDITABLE_LANGUAGES.includes(meta.language.toUpperCase() as any)) { return; }

        log(`Reimporting ${meta.blockName} to ${meta.deviceName}...`);

        try {
            const content = doc.getText();
            const result = await importAndGenerate(meta.deviceName, content, `${meta.blockName}_vscode`);

            if (result.Success) {
                clearDiagnostics(doc.uri);
                vscode.window.showInformationMessage(`Block ${meta.blockName} reimported successfully.`);
                log(`Reimport OK: ${meta.blockName}`);

                if (getAutoCompile()) {
                    await this.autoCompile(meta.deviceName, meta.blockName, doc.uri);
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

    private async autoCompile(deviceName: string, blockName: string, fileUri?: vscode.Uri): Promise<void> {
        try {
            log(`Auto-compiling ${blockName}...`);
            const result = await compileBlock(deviceName, blockName);

            // Update diagnostics in editor
            if (fileUri && result.Messages?.length) {
                updateDiagnostics(fileUri, result.Messages);
            } else if (fileUri) {
                clearDiagnostics(fileUri);
            }

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
