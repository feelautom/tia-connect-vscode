import * as vscode from 'vscode';
import { getBlockContent, importAndGenerate, compileBlock, exportBlockSource } from '../api/blocks';
import { openLadWebview } from './ladWebview';
import { BlockFileManager } from './blockFileManager';
import { BlockMetadata } from '../api/types';
import { OriginalContentProvider } from '../providers/originalContentProvider';
import { TiaTreeItem } from '../providers/projectTreeProvider';
import { getAutoReimport, getAutoCompile, getAutoSaveInterval } from '../utils/config';
import { EDITABLE_LANGUAGES } from '../utils/constants';
import { log, logError, showOutput } from '../views/outputChannel';
import { updateDiagnostics, clearDiagnostics } from '../views/diagnostics';
import { l10n } from 'vscode';

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

    private originalProvider: OriginalContentProvider | undefined;

    /** Set the original content provider for QuickDiff gutter decorations */
    setOriginalContentProvider(provider: OriginalContentProvider): void {
        this.originalProvider = provider;
    }

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
            vscode.window.showErrorMessage(l10n.t('Cannot open this block: missing metadata.'));
            return;
        }

        const isEditable = EDITABLE_LANGUAGES.includes(item.language.toUpperCase() as any);

        try {
            await vscode.window.withProgress(
                { location: { viewId: 'tiaProjectExplorer' }, title: l10n.t('Loading {0}...', item.blockName) },
                async () => {
                    if (isEditable) {
                        await this.openEditableBlock(item);
                    } else {
                        await this.openReadOnlyBlock(item);
                    }
                }
            );
        } catch (err) {
            logError(`Failed to open block ${item.blockName}`, err);
            vscode.window.showErrorMessage(l10n.t('Failed to open block: {0}', err instanceof Error ? err.message : String(err)));
        }
    }

    /** Open SCL/STL block for editing */
    private async openEditableBlock(item: TiaTreeItem): Promise<void> {
        const { content, modifiedDate } = await vscode.window.withProgress(
            { location: vscode.ProgressLocation.Notification, title: l10n.t('Loading {0}...', item.blockName!) },
            async () => {
                const dto = await getBlockContent(item.deviceName!, item.blockName!);

                if (dto.SourceText) {
                    return { content: dto.SourceText, modifiedDate: dto.ModifiedDate };
                }

                // Fallback: try export-source endpoint (works for STL and some SCL blocks)
                try {
                    const source = await exportBlockSource(item.deviceName!, item.blockName!);
                    if (source) {
                        log(`Got source via export-source for ${item.blockName}`);
                        return { content: source, modifiedDate: dto.ModifiedDate };
                    }
                } catch {
                    log(`export-source not available for ${item.blockName}, trying RawXml fallback.`);
                }

                // Last resort: show RawXml (but not for STL — XML is not useful as STL source)
                if (dto.RawXml && item.language!.toUpperCase() !== 'STL') {
                    log(`No SourceText for ${item.blockName}, showing RawXml as fallback.`);
                    return { content: dto.RawXml, modifiedDate: dto.ModifiedDate };
                }

                throw new Error(`No source code available for ${item.blockName}. The block may need compilation first.`);
            }
        );

        const filePath = this.fileManager.writeBlock(
            item.deviceName!,
            item.blockName!,
            item.language!,
            content,
            modifiedDate
        );

        // Store original content for QuickDiff gutter decorations
        this.originalProvider?.setOriginal(filePath, content);

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
                    l10n.t('Block name mismatch: source declares "{0}" but you are editing "{1}". Reimporting will create a NEW block "{0}" instead of updating "{1}".', sourceBlockName, meta.blockName),
                    l10n.t('Reimport Anyway'),
                    l10n.t('Cancel')
                );
                if (choice !== l10n.t('Reimport Anyway')) {
                    log(`Reimport cancelled: name mismatch (source="${sourceBlockName}", expected="${meta.blockName}")`);
                    this.reimportInProgress.delete(key);
                    return;
                }
            }

            // Check for concurrent modification in TIA Portal
            if (meta.modifiedDate) {
                try {
                    const current = await getBlockContent(meta.deviceName, meta.blockName);
                    if (current.ModifiedDate && current.ModifiedDate !== meta.modifiedDate) {
                        const choice = await vscode.window.showWarningMessage(
                            l10n.t('Block "{0}" was modified in TIA Portal since you opened it. Reimporting will overwrite those changes.', meta.blockName),
                            l10n.t('Overwrite'),
                            l10n.t('Cancel')
                        );
                        if (choice !== l10n.t('Overwrite')) {
                            log(`Reimport cancelled: block modified in TIA Portal (opened: ${meta.modifiedDate}, current: ${current.ModifiedDate})`);
                            this.reimportInProgress.delete(key);
                            return;
                        }
                    }
                } catch {
                    // If we can't check, proceed anyway
                }
            }

            const res = await importAndGenerate(meta.deviceName, content, `${meta.blockName}_vscode`);

            if (res.Success) {
                clearDiagnostics(doc.uri);
                vscode.window.showInformationMessage(l10n.t('Block {0} reimported successfully.', meta.blockName));
                log(`Reimport OK: ${meta.blockName}`);
                // Update QuickDiff original to current content (now synced with TIA)
                this.originalProvider?.setOriginal(key, content);
                this._onBlockReimported.fire();

                if (getAutoCompile()) {
                    await this.autoCompile(meta.deviceName, meta.blockName, doc.uri);
                }
            } else {
                vscode.window.showWarningMessage(l10n.t('Reimport warning: {0}', res.Message));
                log(`Reimport warning: ${res.Message}`);
            }
        } catch (err) {
            logError(`Reimport failed for ${meta.blockName}`, err);
            showOutput();
            vscode.window.showErrorMessage(l10n.t('Reimport failed: {0}', err instanceof Error ? err.message : String(err)));
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
