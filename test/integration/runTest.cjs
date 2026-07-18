const path = require('node:path');
const { runTests } = require('@vscode/test-electron');

async function main() {
    const extensionDevelopmentPath = path.resolve(__dirname, '..', '..');
    const extensionTestsPath = path.resolve(__dirname, 'suite', 'index.cjs');
    const version = process.env.VSCODE_TEST_VERSION || 'stable';

    await runTests({
        version,
        extensionDevelopmentPath,
        extensionTestsPath,
        launchArgs: [
            '--disable-extensions',
            '--disable-workspace-trust',
            '--skip-release-notes',
            '--skip-welcome',
        ],
    });
}

main().catch((error) => {
    console.error('Extension Host integration tests failed:', error);
    process.exitCode = 1;
});
