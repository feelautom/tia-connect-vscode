export const EXTENSION_ID = 'tiaConnect';
export const OUTPUT_CHANNEL_NAME = 'T-IA Connect';
export const TEMP_DIR_NAME = '.tia-temp';
export const META_FILE_SUFFIX = '.tia-meta.json';
export const ORIGINAL_SCHEME = 'tia-original';

export const COMMANDS = {
    connect: 'tiaConnect.connect',
    disconnect: 'tiaConnect.disconnect',
    refreshProject: 'tiaConnect.refreshProject',
    openBlock: 'tiaConnect.openBlock',
    compileDevice: 'tiaConnect.compileDevice',
    compileBlock: 'tiaConnect.compileBlock',
    exportBlock: 'tiaConnect.exportBlock',
} as const;

export const CONTEXT_KEYS = {
    connected: 'tiaConnect.connected',
    vcsInitialized: 'tiaConnect.vcsInitialized',
    vcsHasRemote: 'tiaConnect.vcsHasRemote',
} as const;

export const EDITABLE_LANGUAGES = ['SCL', 'STL'] as const;

export type EditableLanguage = typeof EDITABLE_LANGUAGES[number];
