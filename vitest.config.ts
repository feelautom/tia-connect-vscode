import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        include: ['test/**/*.test.ts'],
        globals: true,
    },
    resolve: {
        alias: {
            vscode: './test/__mocks__/vscode.ts',
        },
    },
});
