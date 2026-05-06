/**
 * Workspace Scaffolding — initialize a TIA workspace with .gitignore,
 * copilot instructions, and CLAUDE.md.
 */

import * as vscode from 'vscode';
import { l10n } from 'vscode';
import { getProjectOverview } from '../api/project';
import { log } from '../views/outputChannel';

export function registerWorkspaceCommands(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('tiaConnect.initWorkspace', () => doInitWorkspace()),
    );
}

const TIA_GITIGNORE = `# TIA Portal project files (binary, not for VCS)
*.ap*
*.zap*
*.tiap
*.tmp
*.bak

# TIA Portal temp folders
/UserFiles/
/System/
/AdditionalFiles/

# VS Code extension temp
.tia-temp/

# OS
Thumbs.db
Desktop.ini
.DS_Store
`;

function generateCopilotInstructions(projectName: string, devices: string[]): string {
    return `# Copilot Instructions — ${projectName}

## Project Context
This is a Siemens TIA Portal automation project managed via T-IA Connect.
- **Project**: ${projectName}
- **Devices**: ${devices.join(', ')}

## Coding Conventions
- PLC programs use IEC 61131-3 languages (SCL, LAD, FBD, STL, GRAPH)
- SCL follows Siemens STEP 7 syntax (not IEC 61131-3 ST)
- Variable names use camelCase for local vars, PascalCase for FB interfaces
- Block names: FB_ prefix for Function Blocks, FC_ for Functions, DB_ for Data Blocks
- Tag names: use descriptive names with type prefix (b=Bool, i=Int, r=Real, s=String)

## Available Tools
The @tia chat participant provides 30+ tools for TIA Portal operations.
Use \`@tia\` in GitHub Copilot Chat to interact with the PLC project.
`;
}

function generateClaudeMd(projectName: string, devices: string[]): string {
    return `# CLAUDE.md — ${projectName}

## Project
Siemens TIA Portal project managed via T-IA Connect extension.
- **Project**: ${projectName}
- **Devices**: ${devices.join(', ')}

## Key Files
- \`.github/copilot-instructions.md\` — Copilot context and conventions
- SCL/STL source files in \`.tia-temp/\` — auto-managed by the extension

## Commands
- Compile: Ctrl+Shift+B
- Open block: double-click in T-IA Connect sidebar
- Export: right-click device → Export All
`;
}

async function doInitWorkspace(): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showWarningMessage(l10n.t('No workspace folder open.'));
        return;
    }

    const rootUri = workspaceFolders[0].uri;
    const fs = vscode.workspace.fs;

    let projectName = 'TIA Project';
    let devices: string[] = [];
    try {
        const overview = await getProjectOverview();
        if (overview) {
            projectName = overview.Name || overview.ProjectName || projectName;
            devices = overview.Devices?.map(d => d.Name) || [];
        }
    } catch {
        // Not connected — use defaults
    }

    const created: string[] = [];

    // .gitignore
    const gitignorePath = vscode.Uri.joinPath(rootUri, '.gitignore');
    try {
        await fs.stat(gitignorePath);
        // File exists — don't overwrite
    } catch {
        await fs.writeFile(gitignorePath, Buffer.from(TIA_GITIGNORE, 'utf-8'));
        created.push('.gitignore');
    }

    // .github/copilot-instructions.md
    const githubDir = vscode.Uri.joinPath(rootUri, '.github');
    const copilotPath = vscode.Uri.joinPath(githubDir, 'copilot-instructions.md');
    try {
        await fs.stat(copilotPath);
    } catch {
        await fs.createDirectory(githubDir);
        await fs.writeFile(copilotPath, Buffer.from(generateCopilotInstructions(projectName, devices), 'utf-8'));
        created.push('.github/copilot-instructions.md');
    }

    // CLAUDE.md
    const claudePath = vscode.Uri.joinPath(rootUri, 'CLAUDE.md');
    try {
        await fs.stat(claudePath);
    } catch {
        await fs.writeFile(claudePath, Buffer.from(generateClaudeMd(projectName, devices), 'utf-8'));
        created.push('CLAUDE.md');
    }

    if (created.length === 0) {
        vscode.window.showInformationMessage(l10n.t('Workspace already initialized. No files created.'));
    } else {
        log(`[Workspace] Created: ${created.join(', ')}`);
        vscode.window.showInformationMessage(
            l10n.t('Workspace initialized: {0}', created.join(', '))
        );
    }
}
