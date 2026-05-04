import * as vscode from 'vscode';
import { getProjectOverview } from '../api/project';
import { getBlockTree } from '../api/blocks';
import { BlockTreeNode, ProjectOverview } from '../api/types';
import { log, logError } from '../views/outputChannel';

export type TreeNodeType = 'project' | 'device' | 'folder' | 'block';

export interface TiaTreeItem {
    type: TreeNodeType;
    label: string;
    deviceName?: string;
    blockName?: string;
    blockType?: string;
    language?: string;
    children?: TiaTreeItem[];
    isConsistent?: boolean;
}

export class ProjectTreeProvider implements vscode.TreeDataProvider<TiaTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<TiaTreeItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private projectData: ProjectOverview | null = null;
    private blockTreeCache = new Map<string, BlockTreeNode[]>();

    refresh(): void {
        this.projectData = null;
        this.blockTreeCache.clear();
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: TiaTreeItem): vscode.TreeItem {
        const item = new vscode.TreeItem(
            element.label,
            element.children !== undefined || element.type === 'device' || element.type === 'project' || element.type === 'folder'
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None
        );

        switch (element.type) {
            case 'project':
                item.iconPath = new vscode.ThemeIcon('project');
                item.contextValue = 'project';
                break;
            case 'device':
                item.iconPath = new vscode.ThemeIcon('server');
                item.contextValue = 'device';
                break;
            case 'folder':
                item.iconPath = new vscode.ThemeIcon('folder');
                item.contextValue = 'folder';
                break;
            case 'block':
                item.iconPath = this.getBlockIcon(element.blockType, element.language);
                item.contextValue = this.getBlockContextValue(element.language);
                item.description = this.getBlockDescription(element);
                if (element.language) {
                    item.command = {
                        command: 'tiaConnect.openBlock',
                        title: 'Open Block',
                        arguments: [element],
                    };
                }
                break;
        }

        return item;
    }

    async getChildren(element?: TiaTreeItem): Promise<TiaTreeItem[]> {
        if (!element) {
            return this.getRootChildren();
        }

        switch (element.type) {
            case 'project':
                return this.getDeviceChildren();
            case 'device':
                return this.getBlockTreeChildren(element.deviceName!);
            case 'folder':
                return element.children || [];
            default:
                return [];
        }
    }

    private async getRootChildren(): Promise<TiaTreeItem[]> {
        try {
            this.projectData = await getProjectOverview();
            if (!this.projectData?.Name) {
                log('No project open in TIA Portal.');
                return [];
            }
            log(`Project loaded: ${this.projectData.Name}`);
            return [{
                type: 'project',
                label: this.projectData.Name,
            }];
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            logError('Failed to load project', err);
            if (msg.toLowerCase().includes('no project') || msg.toLowerCase().includes('aucun projet')) {
                log('No project is currently open in TIA Portal.');
            }
            return [];
        }
    }

    private async getDeviceChildren(): Promise<TiaTreeItem[]> {
        if (!this.projectData?.Devices) { return []; }

        return this.projectData.Devices.map(d => ({
            type: 'device' as const,
            label: d.Name,
            deviceName: d.Name,
        }));
    }

    private async getBlockTreeChildren(deviceName: string): Promise<TiaTreeItem[]> {
        try {
            if (!this.blockTreeCache.has(deviceName)) {
                const tree = await getBlockTree(deviceName);
                this.blockTreeCache.set(deviceName, tree);
            }
            const tree = this.blockTreeCache.get(deviceName)!;
            return tree.map(node => this.convertBlockNode(node, deviceName));
        } catch (err) {
            logError(`Failed to load blocks for ${deviceName}`, err);
            return [];
        }
    }

    private convertBlockNode(node: BlockTreeNode, deviceName: string): TiaTreeItem {
        const isFolder = node.IsFolder || node.NodeType === 'Folder' || node.NodeType === 'UserFolder' || node.Type === 'Folder';

        if (isFolder) {
            return {
                type: 'folder',
                label: node.Name,
                deviceName,
                children: node.Children?.map(c => this.convertBlockNode(c, deviceName)) || [],
            };
        }

        // Block info can be nested in BlockInfo or flat on the node
        const blockType = node.BlockInfo?.Type || node.NodeType || node.Type || '';
        const language = node.BlockInfo?.Language || node.ProgrammingLanguage || '';
        const isConsistent = node.BlockInfo?.IsConsistent ?? node.IsConsistent;

        return {
            type: 'block',
            label: node.Name,
            deviceName,
            blockName: node.Name,
            blockType,
            language,
            isConsistent,
        };
    }

    private getBlockIcon(blockType?: string, _language?: string): vscode.ThemeIcon {
        switch (blockType) {
            case 'OB': return new vscode.ThemeIcon('symbol-event');
            case 'FB': return new vscode.ThemeIcon('symbol-class');
            case 'FC': return new vscode.ThemeIcon('symbol-function');
            case 'DB': return new vscode.ThemeIcon('database');
            case 'UDT': return new vscode.ThemeIcon('symbol-struct');
            default: return new vscode.ThemeIcon('file-code');
        }
    }

    private getBlockContextValue(language?: string): string {
        if (!language) { return 'block-other'; }
        const lang = language.toUpperCase();
        if (lang === 'SCL') { return 'block-scl'; }
        if (lang === 'STL') { return 'block-stl'; }
        return 'block-other';
    }

    private getBlockDescription(element: TiaTreeItem): string {
        const parts: string[] = [];
        if (element.blockType) { parts.push(element.blockType); }
        if (element.language) { parts.push(element.language); }
        if (element.isConsistent === false) { parts.push('inconsistent'); }
        return parts.join(' | ');
    }
}
