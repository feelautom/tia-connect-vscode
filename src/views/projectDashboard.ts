import * as vscode from 'vscode';
import { ProjectOverview } from '../api/types';
import { log } from './outputChannel';

let currentPanel: vscode.WebviewPanel | undefined;

export function showProjectDashboard(overview: ProjectOverview): void {
    if (currentPanel) {
        currentPanel.reveal(vscode.ViewColumn.One);
        currentPanel.webview.html = buildHtml(overview);
        return;
    }

    currentPanel = vscode.window.createWebviewPanel(
        'tiaProjectDashboard',
        `${overview.Name || overview.ProjectName} — Overview`,
        vscode.ViewColumn.One,
        { enableScripts: false },
    );

    currentPanel.webview.html = buildHtml(overview);

    currentPanel.onDidDispose(() => {
        currentPanel = undefined;
    });

    log('Project dashboard opened.');
}

export function disposeProjectDashboard(): void {
    currentPanel?.dispose();
    currentPanel = undefined;
}

function buildHtml(overview: ProjectOverview): string {
    const projectName = overview.Name || overview.ProjectName || 'Unknown';
    const projectPath = overview.Path || overview.ProjectPath || '';
    const devices = overview.Devices || [];

    const deviceRows = devices.map(dev => {
        const blocks = dev.Blocks || [];
        const tagTables = dev.TagTables || [];
        const udts = dev.Udts || [];
        const totalTags = tagTables.reduce((sum, t) => sum + (t.TagCount || 0), 0);

        const blocksByType: Record<string, number> = {};
        for (const b of blocks) {
            const t = b.Type || 'Unknown';
            blocksByType[t] = (blocksByType[t] || 0) + 1;
        }
        const blockSummary = Object.entries(blocksByType)
            .map(([type, count]) => `${count} ${type}`)
            .join(', ') || 'None';

        return `
            <tr>
                <td><strong>${esc(dev.Name)}</strong></td>
                <td>${esc(dev.Type || '')}</td>
                <td>${esc(dev.ArticleNumber || '')}</td>
                <td>${esc(dev.Version || '')}</td>
                <td>${blocks.length}</td>
                <td>${totalTags}</td>
                <td>${udts.length}</td>
            </tr>
            <tr class="detail-row">
                <td colspan="7">
                    <span class="label">Blocks:</span> ${esc(blockSummary)}
                    ${tagTables.length > 0 ? `<br><span class="label">Tag Tables:</span> ${tagTables.map(t => `${esc(t.Name)} (${t.TagCount || 0})`).join(', ')}` : ''}
                    ${udts.length > 0 ? `<br><span class="label">UDTs:</span> ${udts.map(u => esc(u.Name)).join(', ')}` : ''}
                </td>
            </tr>`;
    }).join('');

    const totalBlocks = devices.reduce((s, d) => s + (d.Blocks?.length || 0), 0);
    const totalTags = devices.reduce((s, d) => s + (d.TagTables?.reduce((st, t) => st + (t.TagCount || 0), 0) || 0), 0);

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
    body {
        font-family: var(--vscode-font-family, sans-serif);
        color: var(--vscode-foreground);
        background: var(--vscode-editor-background);
        padding: 20px 30px;
        line-height: 1.6;
    }
    h1 {
        font-size: 1.8em;
        margin-bottom: 4px;
        color: var(--vscode-textLink-foreground);
    }
    .path {
        font-size: 0.85em;
        color: var(--vscode-descriptionForeground);
        margin-bottom: 24px;
        word-break: break-all;
    }
    .stats {
        display: flex;
        gap: 24px;
        margin-bottom: 24px;
    }
    .stat-card {
        background: var(--vscode-editor-inactiveSelectionBackground, rgba(255,255,255,0.05));
        border: 1px solid var(--vscode-widget-border, rgba(255,255,255,0.1));
        border-radius: 6px;
        padding: 12px 20px;
        min-width: 100px;
        text-align: center;
    }
    .stat-card .value {
        font-size: 2em;
        font-weight: bold;
        color: var(--vscode-textLink-foreground);
    }
    .stat-card .label {
        font-size: 0.85em;
        color: var(--vscode-descriptionForeground);
    }
    h2 {
        font-size: 1.2em;
        margin-top: 24px;
        margin-bottom: 8px;
        border-bottom: 1px solid var(--vscode-widget-border, rgba(255,255,255,0.1));
        padding-bottom: 4px;
    }
    table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.9em;
    }
    th {
        text-align: left;
        padding: 8px 12px;
        background: var(--vscode-editor-inactiveSelectionBackground, rgba(255,255,255,0.05));
        border-bottom: 2px solid var(--vscode-widget-border, rgba(255,255,255,0.15));
        color: var(--vscode-foreground);
    }
    td {
        padding: 6px 12px;
        border-bottom: 1px solid var(--vscode-widget-border, rgba(255,255,255,0.05));
    }
    .detail-row td {
        padding: 4px 12px 10px;
        font-size: 0.85em;
        color: var(--vscode-descriptionForeground);
        border-bottom: 1px solid var(--vscode-widget-border, rgba(255,255,255,0.1));
    }
    .label {
        font-weight: 600;
        color: var(--vscode-foreground);
    }
</style>
</head>
<body>
    <h1>${esc(projectName)}</h1>
    <div class="path">${esc(projectPath)}</div>

    <div class="stats">
        <div class="stat-card">
            <div class="value">${devices.length}</div>
            <div class="label">Devices</div>
        </div>
        <div class="stat-card">
            <div class="value">${totalBlocks}</div>
            <div class="label">Blocks</div>
        </div>
        <div class="stat-card">
            <div class="value">${totalTags}</div>
            <div class="label">Tags</div>
        </div>
    </div>

    <h2>Devices</h2>
    <table>
        <thead>
            <tr>
                <th>Name</th>
                <th>Type</th>
                <th>Article</th>
                <th>Version</th>
                <th>Blocks</th>
                <th>Tags</th>
                <th>UDTs</th>
            </tr>
        </thead>
        <tbody>
            ${deviceRows || '<tr><td colspan="7">No devices found.</td></tr>'}
        </tbody>
    </table>
</body>
</html>`;
}

function esc(str: string): string {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
