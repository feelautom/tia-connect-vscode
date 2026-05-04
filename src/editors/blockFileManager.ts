import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { BlockMetadata } from '../api/types';
import { TEMP_DIR_NAME, META_FILE_SUFFIX } from '../utils/constants';

/**
 * Manages temporary files for block editing.
 * Each block gets a .scl/.stl file + a .tia-meta.json metadata file.
 */
export class BlockFileManager {
    private readonly tempDir: string;

    constructor() {
        // Use workspace folder or fallback to OS temp
        const wsFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        this.tempDir = wsFolder
            ? path.join(wsFolder, TEMP_DIR_NAME)
            : path.join(require('os').tmpdir(), 'tia-connect');

        if (!fs.existsSync(this.tempDir)) {
            fs.mkdirSync(this.tempDir, { recursive: true });
        }
    }

    /** Get the file path for a block */
    getBlockFilePath(deviceName: string, blockName: string, language: string): string {
        const ext = language.toUpperCase() === 'STL' ? '.stl' : '.scl';
        const safeName = `${this.sanitize(deviceName)}_${this.sanitize(blockName)}${ext}`;
        return path.join(this.tempDir, safeName);
    }

    /** Get the metadata file path for a block file */
    getMetaFilePath(blockFilePath: string): string {
        return blockFilePath + META_FILE_SUFFIX;
    }

    /** Write block content and metadata to temp files */
    writeBlock(deviceName: string, blockName: string, language: string, content: string, modifiedDate?: string): string {
        const filePath = this.getBlockFilePath(deviceName, blockName, language);
        fs.writeFileSync(filePath, content, 'utf-8');

        const meta: BlockMetadata = {
            deviceName,
            blockName,
            blockType: '',
            language,
            exportedAt: new Date().toISOString(),
            modifiedDate,
        };
        fs.writeFileSync(this.getMetaFilePath(filePath), JSON.stringify(meta, null, 2), 'utf-8');

        return filePath;
    }

    /** Read metadata for a given block file */
    readMetadata(blockFilePath: string): BlockMetadata | null {
        const metaPath = this.getMetaFilePath(blockFilePath);
        if (!fs.existsSync(metaPath)) { return null; }

        try {
            const raw = fs.readFileSync(metaPath, 'utf-8');
            return JSON.parse(raw) as BlockMetadata;
        } catch {
            return null;
        }
    }

    /** Check if a file is a managed block file */
    isManagedFile(filePath: string): boolean {
        const normFile = path.normalize(filePath).toLowerCase();
        const normDir = path.normalize(this.tempDir).toLowerCase();
        return normFile.startsWith(normDir) && !normFile.endsWith(META_FILE_SUFFIX.toLowerCase());
    }

    /** Clean up all temp files */
    cleanup(): void {
        if (fs.existsSync(this.tempDir)) {
            const files = fs.readdirSync(this.tempDir);
            for (const file of files) {
                try {
                    fs.unlinkSync(path.join(this.tempDir, file));
                } catch { /* ignore cleanup errors */ }
            }
        }
    }

    private sanitize(name: string): string {
        return name.replace(/[^a-zA-Z0-9_-]/g, '_');
    }
}
