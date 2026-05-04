import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { BlockFileManager } from '../../src/editors/blockFileManager';

describe('BlockFileManager', () => {
    let manager: BlockFileManager;
    let tempDir: string;

    beforeEach(() => {
        // BlockFileManager uses vscode.workspace.workspaceFolders which is undefined in tests,
        // so it falls back to os.tmpdir()/tia-connect
        manager = new BlockFileManager();
        tempDir = path.join(os.tmpdir(), 'tia-connect');
    });

    afterEach(() => {
        manager.cleanup();
    });

    it('creates temp directory on construction', () => {
        expect(fs.existsSync(tempDir)).toBe(true);
    });

    it('getBlockFilePath returns correct SCL path', () => {
        const p = manager.getBlockFilePath('PLC_1', 'FB_Motor', 'SCL');
        expect(p).toBe(path.join(tempDir, 'PLC_1_FB_Motor.scl'));
    });

    it('getBlockFilePath returns correct STL path', () => {
        const p = manager.getBlockFilePath('PLC_1', 'FC_Calc', 'STL');
        expect(p).toBe(path.join(tempDir, 'PLC_1_FC_Calc.stl'));
    });

    it('getBlockFilePath defaults to .scl for unknown languages', () => {
        const p = manager.getBlockFilePath('PLC_1', 'Main', 'LAD');
        expect(p).toBe(path.join(tempDir, 'PLC_1_Main.scl'));
    });

    it('getBlockFilePath sanitizes special characters', () => {
        const p = manager.getBlockFilePath('PLC 1', 'FB/Motor', 'SCL');
        expect(p).toBe(path.join(tempDir, 'PLC_1_FB_Motor.scl'));
    });

    it('getMetaFilePath appends .tia-meta.json', () => {
        const blockPath = path.join(tempDir, 'PLC_1_FB_Motor.scl');
        const metaPath = manager.getMetaFilePath(blockPath);
        expect(metaPath).toBe(blockPath + '.tia-meta.json');
    });

    it('writeBlock creates file and metadata', () => {
        const filePath = manager.writeBlock('PLC_1', 'FB_Test', 'SCL', 'FUNCTION_BLOCK "FB_Test"\nEND_FUNCTION_BLOCK');
        expect(fs.existsSync(filePath)).toBe(true);
        expect(fs.readFileSync(filePath, 'utf-8')).toContain('FB_Test');

        const metaPath = manager.getMetaFilePath(filePath);
        expect(fs.existsSync(metaPath)).toBe(true);

        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        expect(meta.deviceName).toBe('PLC_1');
        expect(meta.blockName).toBe('FB_Test');
        expect(meta.language).toBe('SCL');
    });

    it('writeBlock stores modifiedDate in metadata', () => {
        const date = '2026-01-15T10:00:00Z';
        const filePath = manager.writeBlock('PLC_1', 'FB_Test', 'SCL', 'code', date);
        const meta = JSON.parse(fs.readFileSync(manager.getMetaFilePath(filePath), 'utf-8'));
        expect(meta.modifiedDate).toBe(date);
    });

    it('readMetadata returns stored metadata', () => {
        const filePath = manager.writeBlock('PLC_1', 'FC_Read', 'STL', 'code');
        const meta = manager.readMetadata(filePath);
        expect(meta).not.toBeNull();
        expect(meta!.blockName).toBe('FC_Read');
        expect(meta!.deviceName).toBe('PLC_1');
        expect(meta!.language).toBe('STL');
    });

    it('readMetadata returns null for non-existent file', () => {
        expect(manager.readMetadata('/tmp/nonexistent.scl')).toBeNull();
    });

    it('isManagedFile returns true for files in temp dir', () => {
        const filePath = manager.writeBlock('PLC_1', 'FB_Managed', 'SCL', 'code');
        expect(manager.isManagedFile(filePath)).toBe(true);
    });

    it('isManagedFile returns false for meta files', () => {
        const filePath = manager.writeBlock('PLC_1', 'FB_Meta', 'SCL', 'code');
        const metaPath = manager.getMetaFilePath(filePath);
        expect(manager.isManagedFile(metaPath)).toBe(false);
    });

    it('isManagedFile returns false for external files', () => {
        expect(manager.isManagedFile('/some/other/path/file.scl')).toBe(false);
    });

    it('cleanup removes all files in temp dir', () => {
        manager.writeBlock('PLC_1', 'FB_Clean1', 'SCL', 'code1');
        manager.writeBlock('PLC_1', 'FB_Clean2', 'SCL', 'code2');

        const filesBefore = fs.readdirSync(tempDir);
        expect(filesBefore.length).toBeGreaterThan(0);

        manager.cleanup();

        const filesAfter = fs.readdirSync(tempDir);
        expect(filesAfter).toHaveLength(0);
    });
});
