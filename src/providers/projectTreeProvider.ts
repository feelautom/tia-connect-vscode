import * as vscode from 'vscode';
import * as path from 'path';
import { getProjectOverview } from '../api/project';
import { getBlockTree } from '../api/blocks';
import { getTagTables, getUdts, getWatchTables } from '../api/tags';
import { BlockTreeNode, ProjectOverview } from '../api/types';
import { log, logError } from '../views/outputChannel';

export type TreeNodeType =
    | 'project' | 'device'
    | 'section'                          // "Program Blocks", "Tag Tables", "UDTs", "Watch Tables"
    | 'folder' | 'block'
    | 'tagTable'
    | 'udt'
    | 'watchTable'
    | 'loading';

export interface TiaTreeItem {
    type: TreeNodeType;
    label: string;
    deviceName?: string;
    blockName?: string;
    blockType?: string;
    language?: string;
    children?: TiaTreeItem[];
    isConsistent?: boolean;
    /** Section kind for 'section' nodes */
    sectionKind?: 'blocks' | 'tagTables' | 'udts' | 'watchTables';
    /** Tag table name (for tag nodes) */
    tagTableName?: string;
    /** UDT number */
    udtNumber?: number;
    /** Watch table name */
    watchTableName?: string;
}

export class ProjectTreeProvider implements vscode.TreeDataProvider<TiaTreeItem> {
    private _onDidChangeTreeData = new vscode.EventEmitter<TiaTreeItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private _onProjectLoaded = new vscode.EventEmitter<ProjectOverview>();
    /** Fires when a project is successfully loaded (emits full overview) */
    readonly onProjectLoaded = this._onProjectLoaded.event;

    private projectData: ProjectOverview | null = null;
    private blockTreeCache = new Map<string, BlockTreeNode[]>();
    private iconsDir: string | undefined;
    private busyMessage: string | null = null;
    private _authenticated = false;

    setExtensionPath(extensionPath: string): void {
        this.iconsDir = path.join(extensionPath, 'resources', 'icons');
    }

    /** Get the current project overview (for dashboard) */
    getProjectOverview(): ProjectOverview | null {
        return this.projectData;
    }

    /** Update authenticated state — tree won't load data until true */
    setAuthenticated(value: boolean): void {
        this._authenticated = value;
        this._onDidChangeTreeData.fire(undefined);
    }

    private _connected = false;

    /** Update connected state — tree returns empty when disconnected */
    setConnected(value: boolean): void {
        this._connected = value;
        if (!value) {
            this.projectData = null;
            this.blockTreeCache.clear();
        }
        this._onDidChangeTreeData.fire(undefined);
    }

    refresh(): void {
        this.projectData = null;
        this.blockTreeCache.clear();
        this._onDidChangeTreeData.fire(undefined);
    }

    setBusy(message: string): void {
        this.busyMessage = message;
        this._onDidChangeTreeData.fire(undefined);
    }

    clearBusy(): void {
        this.busyMessage = null;
    }

    getTreeItem(element: TiaTreeItem): vscode.TreeItem {
        const isCollapsible = element.type === 'project'
            || element.type === 'device'
            || element.type === 'section'
            || element.type === 'folder';

        const item = new vscode.TreeItem(
            element.label,
            isCollapsible
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None
        );

        switch (element.type) {
            case 'loading':
                item.iconPath = new vscode.ThemeIcon('loading~spin');
                item.description = 'Please wait...';
                break;
            case 'project':
                item.iconPath = new vscode.ThemeIcon('project');
                item.contextValue = 'project';
                item.command = {
                    command: 'tiaConnect.showDashboard',
                    title: 'Show Project Dashboard',
                };
                break;
            case 'device':
                item.iconPath = new vscode.ThemeIcon('server');
                item.contextValue = 'device';
                break;
            case 'section':
                item.iconPath = this.getSectionIcon(element.sectionKind);
                item.contextValue = `section-${element.sectionKind}`;
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
            case 'tagTable':
                item.iconPath = new vscode.ThemeIcon('tag');
                item.contextValue = 'tagTable';
                item.command = {
                    command: 'tiaConnect.openTagTable',
                    title: 'Open Tag Table',
                    arguments: [element],
                };
                break;
            case 'udt':
                item.iconPath = new vscode.ThemeIcon('symbol-struct');
                item.contextValue = 'udt';
                if (element.udtNumber !== undefined) {
                    item.description = `UDT ${element.udtNumber}`;
                }
                item.command = {
                    command: 'tiaConnect.openUdt',
                    title: 'Open UDT',
                    arguments: [element],
                };
                break;
            case 'watchTable':
                item.iconPath = new vscode.ThemeIcon('eye');
                item.contextValue = 'watchTable';
                item.command = {
                    command: 'tiaConnect.openWatchTable',
                    title: 'Open Watch Table',
                    arguments: [element],
                };
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
                return this.getDeviceSections(element.deviceName!);
            case 'section':
                return this.getSectionChildren(element);
            case 'folder':
                return element.children || [];
            case 'udt':
                return []; // UDTs are leaf nodes (detail shown on click later)
            default:
                return [];
        }
    }

    private async getRootChildren(): Promise<TiaTreeItem[]> {
        if (this.busyMessage) {
            return [{
                type: 'loading' as TreeNodeType,
                label: this.busyMessage,
            }];
        }

        // Don't try to load if not authenticated or disconnected — let welcome view show
        if (!this._authenticated || !this._connected) {
            return [];
        }

        try {
            this.projectData = await getProjectOverview();
            if (!this.projectData?.Name) {
                log('No project open in TIA Portal.');
                return [];
            }
            log(`Project loaded: ${this.projectData.Name}`);
            this._onProjectLoaded.fire(this.projectData);
            return [{
                type: 'project',
                label: this.projectData.Name,
            }];
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            if (/not connected|not available|aucun projet|no project/i.test(msg)) {
                log('No project open in TIA Portal.');
            } else {
                logError('Failed to load project', err);
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

    /** Returns the 3 section folders under a device */
    private getDeviceSections(deviceName: string): TiaTreeItem[] {
        return [
            {
                type: 'section',
                label: 'Program Blocks',
                deviceName,
                sectionKind: 'blocks',
            },
            {
                type: 'section',
                label: 'Tag Tables',
                deviceName,
                sectionKind: 'tagTables',
            },
            {
                type: 'section',
                label: 'UDTs',
                deviceName,
                sectionKind: 'udts',
            },
            {
                type: 'section',
                label: 'Watch Tables',
                deviceName,
                sectionKind: 'watchTables',
            },
        ];
    }

    private async getSectionChildren(section: TiaTreeItem): Promise<TiaTreeItem[]> {
        const deviceName = section.deviceName!;
        switch (section.sectionKind) {
            case 'blocks':
                return this.getBlockTreeChildren(deviceName);
            case 'tagTables':
                return this.getTagTableNodes(deviceName);
            case 'udts':
                return this.getUdtNodes(deviceName);
            case 'watchTables':
                return this.getWatchTableNodes(deviceName);
            default:
                return [];
        }
    }

    // ─── Program Blocks ─────────────────────────────────────────────

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

    /** Find a block by name across all devices (searches cache first, then fetches) */
    async findBlockByName(blockName: string): Promise<TiaTreeItem | undefined> {
        // Search in cache first
        for (const [deviceName, tree] of this.blockTreeCache.entries()) {
            const found = this.searchBlockTree(tree, deviceName, blockName);
            if (found) { return found; }
        }

        // Ensure we have project data (may not be loaded yet)
        if (!this.projectData) {
            try {
                this.projectData = await getProjectOverview();
            } catch {
                return undefined;
            }
        }

        // Fetch block tree for devices not yet cached
        if (this.projectData?.Devices) {
            for (const dev of this.projectData.Devices) {
                if (!this.blockTreeCache.has(dev.Name)) {
                    try {
                        const tree = await getBlockTree(dev.Name);
                        this.blockTreeCache.set(dev.Name, tree);
                        const found = this.searchBlockTree(tree, dev.Name, blockName);
                        if (found) { return found; }
                    } catch { /* skip device */ }
                }
            }
        }
        return undefined;
    }

    /** Find a UDT, tag table, or watch table by name across all devices */
    async findItemByName(name: string): Promise<TiaTreeItem | undefined> {
        if (!this.projectData) {
            try { this.projectData = await getProjectOverview(); } catch { return undefined; }
        }
        if (!this.projectData?.Devices) { return undefined; }

        for (const dev of this.projectData.Devices) {
            const udts = await this.getUdtNodes(dev.Name);
            const udt = udts.find(u => u.label === name);
            if (udt) { return udt; }

            const tags = await this.getTagTableNodes(dev.Name);
            const tag = tags.find(t => t.label === name);
            if (tag) { return tag; }

            const watches = await this.getWatchTableNodes(dev.Name);
            const watch = watches.find(w => w.label === name);
            if (watch) { return watch; }
        }
        return undefined;
    }

    private searchBlockTree(nodes: BlockTreeNode[], deviceName: string, blockName: string): TiaTreeItem | undefined {
        for (const node of nodes) {
            const isFolder = node.IsFolder || node.NodeType === 'Folder' || node.NodeType === 'UserFolder' || node.Type === 'Folder';
            if (!isFolder && node.Name === blockName) {
                log(`[findBlock] FOUND "${blockName}" in device "${deviceName}"`);
                return this.convertBlockNode(node, deviceName);
            }
            if (node.Children) {
                const found = this.searchBlockTree(node.Children, deviceName, blockName);
                if (found) { return found; }
            }
        }
        return undefined;
    }

    // ─── Tag Tables ─────────────────────────────────────────────────

    private async getTagTableNodes(deviceName: string): Promise<TiaTreeItem[]> {
        try {
            const tables = await getTagTables(deviceName);
            return tables.map(t => ({
                type: 'tagTable' as const,
                label: t.Name,
                deviceName,
                tagTableName: t.Name,
            }));
        } catch (err) {
            logError(`Failed to load tag tables for ${deviceName}`, err);
            return [];
        }
    }

    // ─── UDTs ───────────────────────────────────────────────────────

    private async getUdtNodes(deviceName: string): Promise<TiaTreeItem[]> {
        try {
            const udts = await getUdts(deviceName);
            return udts.map(u => ({
                type: 'udt' as const,
                label: u.Name,
                deviceName,
                udtNumber: u.Number,
                isConsistent: u.IsConsistent,
            }));
        } catch (err) {
            logError(`Failed to load UDTs for ${deviceName}`, err);
            return [];
        }
    }

    // ─── Watch Tables ─────────────────────────────────────────────────

    private async getWatchTableNodes(deviceName: string): Promise<TiaTreeItem[]> {
        try {
            const tables = await getWatchTables(deviceName);
            return tables.map(t => ({
                type: 'watchTable' as const,
                label: t.Name,
                deviceName,
                watchTableName: t.Name,
            }));
        } catch (err) {
            logError(`Failed to load watch tables for ${deviceName}`, err);
            return [];
        }
    }

    // ─── Icons & descriptions ───────────────────────────────────────

    private getSectionIcon(kind?: string): vscode.ThemeIcon {
        switch (kind) {
            case 'blocks': return new vscode.ThemeIcon('symbol-method');
            case 'tagTables': return new vscode.ThemeIcon('tag');
            case 'udts': return new vscode.ThemeIcon('symbol-struct');
            case 'watchTables': return new vscode.ThemeIcon('eye');
            default: return new vscode.ThemeIcon('folder');
        }
    }

    private getBlockIcon(blockType?: string, _language?: string): vscode.ThemeIcon | { light: vscode.Uri; dark: vscode.Uri } {
        if (this.iconsDir) {
            const svgMap: Record<string, string> = {
                'OB': 'block-ob.svg',
                'FB': 'block-fb.svg',
                'FC': 'block-fc.svg',
                'DB': 'block-db.svg',
            };
            const svg = blockType ? svgMap[blockType] : undefined;
            if (svg) {
                const uri = vscode.Uri.file(path.join(this.iconsDir, svg));
                return { light: uri, dark: uri };
            }
        }
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
