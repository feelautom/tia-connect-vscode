import { describe, it, expect } from 'vitest';
import { ProjectTreeProvider, TiaTreeItem } from '../../src/providers/projectTreeProvider';
import { TreeItemCollapsibleState } from 'vscode';

describe('ProjectTreeProvider.getTreeItem', () => {
    const provider = new ProjectTreeProvider();

    it('creates collapsible item for project node', () => {
        const element: TiaTreeItem = { type: 'project', label: 'TestProject' };
        const item = provider.getTreeItem(element);
        expect(item.label).toBe('TestProject');
        expect(item.collapsibleState).toBe(TreeItemCollapsibleState.Collapsed);
        expect(item.contextValue).toBe('project');
    });

    it('creates collapsible item for device node', () => {
        const element: TiaTreeItem = { type: 'device', label: 'PLC_1', deviceName: 'PLC_1' };
        const item = provider.getTreeItem(element);
        expect(item.collapsibleState).toBe(TreeItemCollapsibleState.Collapsed);
        expect(item.contextValue).toBe('device');
    });

    it('creates collapsible item for section node', () => {
        const element: TiaTreeItem = { type: 'section', label: 'Program Blocks', deviceName: 'PLC_1', sectionKind: 'blocks' };
        const item = provider.getTreeItem(element);
        expect(item.collapsibleState).toBe(TreeItemCollapsibleState.Collapsed);
        expect(item.contextValue).toBe('section-blocks');
    });

    it('creates collapsible item for folder node', () => {
        const element: TiaTreeItem = { type: 'folder', label: 'Safety', deviceName: 'PLC_1', children: [] };
        const item = provider.getTreeItem(element);
        expect(item.collapsibleState).toBe(TreeItemCollapsibleState.Collapsed);
        expect(item.contextValue).toBe('folder');
    });

    it('creates leaf item for block node', () => {
        const element: TiaTreeItem = {
            type: 'block', label: 'FB_Motor', deviceName: 'PLC_1',
            blockName: 'FB_Motor', blockType: 'FB', language: 'SCL',
        };
        const item = provider.getTreeItem(element);
        expect(item.collapsibleState).toBe(TreeItemCollapsibleState.None);
        expect(item.contextValue).toBe('block-scl');
        expect(item.description).toBe('FB | SCL');
        expect(item.command).toBeDefined();
        expect(item.command!.command).toBe('tiaConnect.openBlock');
    });

    it('creates leaf item for STL block', () => {
        const element: TiaTreeItem = {
            type: 'block', label: 'FC_Calc', deviceName: 'PLC_1',
            blockName: 'FC_Calc', blockType: 'FC', language: 'STL',
        };
        const item = provider.getTreeItem(element);
        expect(item.contextValue).toBe('block-stl');
    });

    it('creates leaf item for LAD block (non-editable)', () => {
        const element: TiaTreeItem = {
            type: 'block', label: 'Main', deviceName: 'PLC_1',
            blockName: 'Main', blockType: 'OB', language: 'LAD',
        };
        const item = provider.getTreeItem(element);
        expect(item.contextValue).toBe('block-other');
    });

    it('shows inconsistent in description', () => {
        const element: TiaTreeItem = {
            type: 'block', label: 'FB1', deviceName: 'PLC_1',
            blockName: 'FB1', blockType: 'FB', language: 'SCL', isConsistent: false,
        };
        const item = provider.getTreeItem(element);
        expect(item.description).toContain('inconsistent');
    });

    it('creates leaf item for tagTable node with command', () => {
        const element: TiaTreeItem = {
            type: 'tagTable', label: 'Default tag table', deviceName: 'PLC_1',
            tagTableName: 'Default tag table',
        };
        const item = provider.getTreeItem(element);
        expect(item.collapsibleState).toBe(TreeItemCollapsibleState.None);
        expect(item.contextValue).toBe('tagTable');
        expect(item.command!.command).toBe('tiaConnect.openTagTable');
    });

    it('creates leaf item for UDT node with command and description', () => {
        const element: TiaTreeItem = {
            type: 'udt', label: 'UDT_Motor', deviceName: 'PLC_1',
            udtNumber: 1,
        };
        const item = provider.getTreeItem(element);
        expect(item.collapsibleState).toBe(TreeItemCollapsibleState.None);
        expect(item.contextValue).toBe('udt');
        expect(item.description).toBe('UDT 1');
        expect(item.command!.command).toBe('tiaConnect.openUdt');
    });
});
