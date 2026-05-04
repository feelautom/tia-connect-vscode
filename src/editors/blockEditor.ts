import * as vscode from 'vscode';
import { getBlockContent, importAndGenerate, compileBlock } from '../api/blocks';
import { openLadWebview } from './ladWebview';
import { BlockFileManager } from './blockFileManager';
import { BlockMetadata } from '../api/types';
import { TiaTreeItem } from '../providers/projectTreeProvider';
import { getAutoReimport, getAutoCompile, getAutoSaveInterval } from '../utils/config';
import { EDITABLE_LANGUAGES } from '../utils/constants';
import { log, logError, showOutput } from '../views/outputChannel';
import { updateDiagnostics, clearDiagnostics } from '../views/diagnostics';

export class BlockEditor {
    private fileManager = new BlockFileManager();
    private saveListener: vscode.Disposable | undefined;
    private willSaveListener: vscode.Disposable | undefined;
    private configListener: vscode.Disposable | undefined;
    private reimportInProgress = new Set<string>();
    private manualSavePaths = new Set<string>();
    private autoSaveTimer: NodeJS.Timeout | undefined;

    private _onBlockReimported = new vscode.EventEmitter<void>();
    /** Fires after a successful block reimport (signals tree to refresh) */
    readonly onBlockReimported = this._onBlockReimported.event;

    activate(context: vscode.ExtensionContext): void {
        // Track manual saves (Ctrl+S) vs auto-saves
        this.willSaveListener = vscode.workspace.onWillSaveTextDocument((e) => {
            if (e.reason === vscode.TextDocumentSaveReason.Manual) {
                this.manualSavePaths.add(e.document.uri.fsPath);
            }
        });
        this.saveListener = vscode.workspace.onDidSaveTextDocument(
            (doc) => this.onDocumentSaved(doc)
        );
        // React to setting changes
        this.configListener = vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('tiaConnect.autoSaveInterval')) {
                this.startAutoSaveTimer();
            }
        });
        context.subscriptions.push(this.willSaveListener, this.saveListener, this.configListener);
        this.startAutoSaveTimer();
    }

    /** Start/restart the auto-save timer based on settings */
    private startAutoSaveTimer(): void {
        if (this.autoSaveTimer) {
            clearInterval(this.autoSaveTimer);
            this.autoSaveTimer = undefined;
        }

        const minutes = getAutoSaveInterval();
        if (minutes <= 0) {
            log('Auto-save disabled.');
            return;
        }

        log(`Auto-save enabled: every ${minutes} minute(s).`);
        this.autoSaveTimer = setInterval(() => {
            this.autoSaveAllDirtyBlocks();
        }, minutes * 60 * 1000);
    }

    /** Save all dirty managed block files (safety backup only, no reimport) */
    private autoSaveAllDirtyBlocks(): void {
        for (const doc of vscode.workspace.textDocuments) {
            if (doc.isDirty && this.fileManager.isManagedFile(doc.uri.fsPath)) {
                doc.save();
                log(`Auto-saved ${doc.fileName}`);
            }
        }
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

    /** Open LAD/FBD/GRAPH block as Webview with SVG rendering */
    private async openReadOnlyBlock(item: TiaTreeItem): Promise<void> {
        await openLadWebview(item.deviceName!, item.blockName!, item.language!);
    }

    /** Handle document save — reimport into TIA Portal only on manual save (Ctrl+S) */
    private async onDocumentSaved(doc: vscode.TextDocument): Promise<void> {
        if (!getAutoReimport()) { return; }

        const key = doc.uri.fsPath;

        // Only reimport on manual save (Ctrl+S), ignore auto-save and focus-out saves
        if (!this.manualSavePaths.has(key)) { return; }
        this.manualSavePaths.delete(key);

        if (!this.fileManager.isManagedFile(key)) { return; }

        const meta = this.fileManager.readMetadata(key);
        if (!meta) { return; }
        if (!EDITABLE_LANGUAGES.includes(meta.language.toUpperCase() as any)) { return; }

        // Skip if a reimport is already in progress for this file
        if (this.reimportInProgress.has(key)) {
            log(`Reimport already in progress for ${meta.blockName}, skipping.`);
            return;
        }

        this.doReimport(doc, meta, key);
    }

    /**
     * Extract block name from SCL source header.
     * Matches: FUNCTION "Name", FUNCTION_BLOCK "Name", DATA_BLOCK "Name", ORGANIZATION_BLOCK "Name"
     */
    private extractBlockNameFromSource(source: string): string | undefined {
        const match = source.match(/^\s*(?:FUNCTION_BLOCK|FUNCTION|DATA_BLOCK|ORGANIZATION_BLOCK)\s+"([^"]+)"/im);
        return match?.[1];
    }

    private async doReimport(doc: vscode.TextDocument, meta: BlockMetadata, key: string): Promise<void> {
        this.reimportInProgress.add(key);
        log(`Reimporting ${meta.blockName} to ${meta.deviceName}...`);

        try {
            const content = doc.getText();

            // Safety check: verify the block name in source matches the expected block
            const sourceBlockName = this.extractBlockNameFromSource(content);
            if (sourceBlockName && sourceBlockName !== meta.blockName) {
                const choice = await vscode.window.showWarningMessage(
                    `Block name mismatch: source declares "${sourceBlockName}" but you are editing "${meta.blockName}". ` +
                    `Reimporting will create a NEW block "${sourceBlockName}" instead of updating "${meta.blockName}".`,
                    'Reimport Anyway',
                    'Cancel'
                );
                if (choice !== 'Reimport Anyway') {
                    log(`Reimport cancelled: name mismatch (source="${sourceBlockName}", expected="${meta.blockName}")`);
                    this.reimportInProgress.delete(key);
                    return;
                }
            }

            const res = await importAndGenerate(meta.deviceName, content, `${meta.blockName}_vscode`);

            if (res.Success) {
                clearDiagnostics(doc.uri);
                vscode.window.showInformationMessage(`Block ${meta.blockName} reimported successfully.`);
                log(`Reimport OK: ${meta.blockName}`);
                this._onBlockReimported.fire();

                if (getAutoCompile()) {
                    await this.autoCompile(meta.deviceName, meta.blockName, doc.uri);
                }
            } else {
                vscode.window.showWarningMessage(`Reimport warning: ${res.Message}`);
                log(`Reimport warning: ${res.Message}`);
            }
        } catch (err) {
            logError(`Reimport failed for ${meta.blockName}`, err);
            showOutput();
            vscode.window.showErrorMessage(`Reimport failed: ${err instanceof Error ? err.message : err}`);
        } finally {
            this.reimportInProgress.delete(key);
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

            const msg = `${blockName}: ${result.ErrorCount} error(s), ${result.WarningCount} warning(s)`;
            log(msg);

            for (const m of result.Messages ?? []) {
                log(`  [${m.ErrorLevel}] ${m.Path}: ${m.Description}`);
            }

            if (result.ErrorCount > 0) {
                showOutput();
                vscode.window.showWarningMessage(msg);
            }
        } catch (err) {
            logError('Auto-compile failed', err);
        }
    }

    dispose(): void {
        if (this.autoSaveTimer) { clearInterval(this.autoSaveTimer); }
        this.configListener?.dispose();
        this.willSaveListener?.dispose();
        this.saveListener?.dispose();
        this.fileManager.cleanup();
    }
}
