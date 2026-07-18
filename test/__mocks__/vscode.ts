/** Minimal vscode mock for unit tests */

export class Uri {
    readonly scheme: string;
    readonly path: string;
    readonly fsPath: string;

    private constructor(scheme: string, path: string) {
        this.scheme = scheme;
        this.path = path;
        this.fsPath = path;
    }

    static from(components: { scheme: string; path: string }): Uri {
        return new Uri(components.scheme, components.path);
    }

    static file(path: string): Uri {
        return new Uri('file', path);
    }

    static parse(value: string): Uri {
        const [scheme, ...rest] = value.split(':');
        return new Uri(scheme, rest.join(':').replace(/^\/\//, ''));
    }
}

export enum TreeItemCollapsibleState {
    None = 0,
    Collapsed = 1,
    Expanded = 2,
}

export class TreeItem {
    label: string;
    collapsibleState: TreeItemCollapsibleState;
    iconPath?: any;
    contextValue?: string;
    description?: string;
    command?: any;

    constructor(label: string, collapsibleState?: TreeItemCollapsibleState) {
        this.label = label;
        this.collapsibleState = collapsibleState ?? TreeItemCollapsibleState.None;
    }
}

export class ThemeIcon {
    id: string;
    constructor(id: string) { this.id = id; }
}

export class EventEmitter<T> {
    private listeners: Array<(e: T) => void> = [];
    event = (listener: (e: T) => void) => {
        this.listeners.push(listener);
        return { dispose: () => { this.listeners = this.listeners.filter(l => l !== listener); } };
    };
    fire(data: T): void {
        for (const l of this.listeners) { l(data); }
    }
    dispose(): void { this.listeners = []; }
}

export enum ViewColumn {
    One = 1,
    Two = 2,
    Beside = -2,
}

export enum TextDocumentSaveReason {
    Manual = 1,
    AfterDelay = 2,
    FocusOut = 3,
}

export enum ConfigurationTarget {
    Global = 1,
    Workspace = 2,
    WorkspaceFolder = 3,
}

export enum ProgressLocation {
    Notification = 15,
    SourceControl = 1,
    Window = 10,
}

export const workspace = {
    getConfiguration: (_section?: string) => ({
        get: <T>(_key: string, defaultValue?: T) => defaultValue,
        inspect: <T>(_key: string) => undefined as any as { globalValue?: T; workspaceValue?: T; workspaceFolderValue?: T } | undefined,
        update: async () => {},
    }),
    workspaceFolders: undefined as any,
    textDocuments: [] as any[],
    onWillSaveTextDocument: () => ({ dispose: () => {} }),
    onDidSaveTextDocument: () => ({ dispose: () => {} }),
    onDidChangeConfiguration: () => ({ dispose: () => {} }),
    openTextDocument: async (opts: any) => opts,
    registerTextDocumentContentProvider: () => ({ dispose: () => {} }),
};

export const window = {
    createWebviewPanel: () => ({
        webview: { html: '' },
        reveal: () => {},
        onDidDispose: () => ({ dispose: () => {} }),
        dispose: () => {},
    }),
    showTextDocument: async () => {},
    showInformationMessage: async () => {},
    showWarningMessage: async () => {},
    showErrorMessage: async () => {},
    showInputBox: async () => '',
    showQuickPick: async () => undefined,
    withProgress: async (_opts: any, task: any) => task({ report: () => {} }),
    createTreeView: () => ({ dispose: () => {} }),
    createOutputChannel: () => ({
        appendLine: () => {},
        show: () => {},
        dispose: () => {},
    }),
};

export const commands = {
    registerCommand: () => ({ dispose: () => {} }),
    executeCommand: async () => {},
};

export const env = {
    language: 'en',
    openExternal: async () => true,
    clipboard: {
        writeText: async (_value: string) => {},
    },
};

export const l10n = {
    t: (value: string, ...args: unknown[]) => args.reduce(
        (result, arg, index) => result.replace(`{${index}}`, String(arg)),
        value,
    ),
};

export const version = '1.99.0-test';

export const extensions = {
    getExtension: (_id: string) => ({ packageJSON: { version: '1.0.3-test' } }),
};

export const scm = {
    createSourceControl: () => ({
        inputBox: { placeholder: '', value: '' },
        acceptInputCommand: undefined as any,
        quickDiffProvider: undefined as any,
        createResourceGroup: () => ({
            resourceStates: [],
            hideWhenEmpty: false,
        }),
        count: 0,
        statusBarCommands: [],
        dispose: () => {},
    }),
};

export const languages = {
    createDiagnosticCollection: () => ({
        set: () => {},
        delete: () => {},
        clear: () => {},
        dispose: () => {},
    }),
};

export enum DiagnosticSeverity {
    Error = 0,
    Warning = 1,
    Information = 2,
    Hint = 3,
}

export class Diagnostic {
    range: any;
    message: string;
    severity: DiagnosticSeverity;
    constructor(range: any, message: string, severity?: DiagnosticSeverity) {
        this.range = range;
        this.message = message;
        this.severity = severity ?? DiagnosticSeverity.Error;
    }
}

export class Range {
    start: any;
    end: any;
    constructor(startLine: number, startChar: number, endLine: number, endChar: number) {
        this.start = { line: startLine, character: startChar };
        this.end = { line: endLine, character: endChar };
    }
}

export class Position {
    line: number;
    character: number;
    constructor(line: number, character: number) {
        this.line = line;
        this.character = character;
    }
}
