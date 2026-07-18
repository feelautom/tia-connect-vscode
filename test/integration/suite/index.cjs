const assert = require('node:assert/strict');
const vscode = require('vscode');

async function run() {
    const extension = vscode.extensions.getExtension('feelautom.tia-connect-vscode');
    assert.ok(extension, 'The T-IA Connect extension must be discoverable');

    const manifest = extension.packageJSON;
    const expectedTrust = process.env.WORKSPACE_TRUST_EXPECTED || 'trusted';
    const expectedLocale = process.env.VSCODE_TEST_LOCALE_EXPECTED;
    assert.equal(vscode.workspace.isTrusted, expectedTrust === 'trusted');
    if (expectedLocale) {
        assert.equal(vscode.env.language.toLowerCase().startsWith(expectedLocale.toLowerCase()), true);
    }
    assert.equal(manifest.capabilities.untrustedWorkspaces.supported, 'limited');
    assert.equal(manifest.name, 'tia-connect-vscode');
    assert.equal(manifest.publisher, 'FEELAUTOM');
    assert.equal(manifest.engines.vscode, '^1.85.0');
    assert.equal(manifest.icon, 'resources/icons/icon.png');

    const activityBar = manifest.contributes.viewsContainers.activitybar;
    const tiaContainer = activityBar.find((container) => container.id === 'tiaConnect');
    assert.ok(tiaContainer, 'The T-IA Connect Activity Bar container must exist');
    assert.equal(tiaContainer.icon, 'resources/icons/tia-portal.svg');

    await extension.activate();
    assert.equal(extension.isActive, true, 'The extension must activate successfully');

    const commands = new Set(await vscode.commands.getCommands(true));
    for (const command of [
        'tiaConnect.login',
        'tiaConnect.logout',
        'tiaConnect.connect',
        'tiaConnect.showDashboard',
        'tiaConnect.compileDevice',
        'tiaConnect.diagnostic',
    ]) {
        assert.ok(commands.has(command), `Command ${command} must be registered`);
    }

    const languages = new Set(await vscode.languages.getLanguages());
    assert.ok(languages.has('scl'), 'The SCL language contribution must be registered');
    assert.ok(languages.has('stl'), 'The STL language contribution must be registered');

    await vscode.commands.executeCommand('tiaConnect.diagnostic');
    const diagnosticText = vscode.window.activeTextEditor?.document.getText() ?? '';
    assert.match(diagnosticText, /^# T-IA Connect Diagnostic/m);
    assert.match(diagnosticText, /## Privacy/);
    assert.doesNotMatch(diagnosticText, /[A-Za-z]:\\/);
    assert.doesNotMatch(diagnosticText, /Bearer\s+[A-Za-z0-9._-]+/i);

    if (expectedTrust === 'untrusted') {
        await vscode.commands.executeCommand('tiaConnect.initWorkspace');
        const fs = require('node:fs');
        const path = require('node:path');
        assert.equal(fs.existsSync(path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, '.vscode', 'tia-connect.json')), false);
    }
}

module.exports = { run };
