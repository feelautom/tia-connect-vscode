const path = require('node:path');
const { spawn } = require('node:child_process');
const { downloadAndUnzipVSCode, runTests } = require('@vscode/test-electron');

async function runUntrusted(options) {
    const executable = await downloadAndUnzipVSCode({ version: options.version });
    const args = [
        options.workspacePath,
        '--no-sandbox',
        '--disable-gpu-sandbox',
        '--disable-updates',
        '--disable-extensions',
        '--skip-welcome',
        '--skip-release-notes',
        '--user-data-dir', options.userDataPath,
        '--extensions-dir', path.join(options.userDataPath, 'extensions'),
        `--extensionDevelopmentPath=${options.extensionDevelopmentPath}`,
        `--extensionTestsPath=${options.extensionTestsPath}`,
    ];
    await new Promise((resolve, reject) => {
        const child = spawn(executable, args, {
            env: { ...process.env, WORKSPACE_TRUST_EXPECTED: 'untrusted' },
            stdio: 'inherit',
        });
        child.on('error', reject);
        child.on('exit', code => code === 0 ? resolve() : reject(new Error(`Extension Host exited with code ${code}`)));
    });
}

async function main() {
    const extensionDevelopmentPath = path.resolve(__dirname, '..', '..');
    const extensionTestsPath = path.resolve(__dirname, 'suite', 'index.cjs');
    const version = process.env.VSCODE_TEST_VERSION || 'stable';
    const locale = process.env.VSCODE_TEST_LOCALE || 'en';
    const untrusted = process.argv.includes('--untrusted');
    const workspacePath = path.resolve(__dirname, 'untrusted-workspace');
    const isolatedUserData = path.resolve(__dirname, '..', '..', '.vscode-test', `untrusted-user-${process.pid}`);
    const localizedProfileArgs = locale === 'fr' ? [
        '--extensions-dir', path.resolve(__dirname, '..', '..', '.vscode-test', 'fr-extensions'),
        '--user-data-dir', path.resolve(__dirname, '..', '..', '.vscode-test', 'fr-user-data'),
    ] : [];

    if (untrusted) {
        await runUntrusted({ version, extensionDevelopmentPath, extensionTestsPath, workspacePath, userDataPath: isolatedUserData });
        return;
    }

    await runTests({
        version,
        extensionDevelopmentPath,
        extensionTestsPath,
        extensionTestsEnv: { WORKSPACE_TRUST_EXPECTED: 'trusted', VSCODE_TEST_LOCALE_EXPECTED: locale },
        launchArgs: [
            '--disable-workspace-trust',
            `--locale=${locale}`,
            ...localizedProfileArgs,
            ...(locale === 'fr' ? [] : ['--disable-extensions']),
            '--skip-release-notes',
            '--skip-welcome',
        ],
    });
}

main().catch((error) => {
    console.error('Extension Host integration tests failed:', error);
    process.exitCode = 1;
});
