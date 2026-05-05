import * as vscode from 'vscode';
import { TestRunResult } from '../api/types';
import { log } from '../views/outputChannel';

const openPanels = new Map<string, vscode.WebviewPanel>();

export async function openTestResultWebview(result: TestRunResult): Promise<void> {
    const panelKey = `test:${result.TestName}`;

    const existing = openPanels.get(panelKey);
    if (existing) {
        existing.webview.html = renderResultHtml(result);
        existing.reveal(vscode.ViewColumn.Beside);
        return;
    }

    const panel = vscode.window.createWebviewPanel(
        'tiaTestResult',
        `Test: ${result.TestName}`,
        vscode.ViewColumn.Beside,
        { enableScripts: false, retainContextWhenHidden: false },
    );
    panel.webview.html = renderResultHtml(result);

    openPanels.set(panelKey, panel);
    panel.onDidDispose(() => openPanels.delete(panelKey));
    log(`Opened test results for ${result.TestName}`);
}

function renderResultHtml(result: TestRunResult): string {
    const statusClass = result.Passed ? 'passed' : 'failed';
    const statusLabel = result.Passed ? 'PASSED' : 'FAILED';
    const statusIcon = result.Passed ? '\u2714' : '\u2718';

    let stepsHtml = '';
    for (const step of result.Steps || []) {
        const stepStatus = step.Passed ? 'passed' : 'failed';
        const stepIcon = step.Passed ? '\u2714' : '\u2718';
        const desc = step.Description || `Step ${step.StepIndex + 1}`;

        let assertionsHtml = '';
        for (const a of step.Assertions || []) {
            const aClass = a.Passed ? 'assertion-passed' : 'assertion-failed';
            const aIcon = a.Passed ? '\u2714' : '\u2718';
            assertionsHtml += `
                <tr class="${aClass}">
                    <td class="a-icon">${aIcon}</td>
                    <td class="a-tag">${esc(a.TagName)}</td>
                    <td class="a-expected">${esc(formatValue(a.ExpectedValue))}</td>
                    <td class="a-actual">${esc(formatValue(a.ActualValue))}</td>
                    <td class="a-message">${a.Message ? esc(a.Message) : ''}</td>
                </tr>`;
        }

        stepsHtml += `
            <div class="step-card ${stepStatus}">
                <div class="step-header">
                    <span class="step-icon ${stepStatus}">${stepIcon}</span>
                    <span class="step-name">${esc(desc)}</span>
                    <span class="step-index">Step ${step.StepIndex + 1}</span>
                </div>
                ${(step.Assertions || []).length > 0 ? `
                <table class="assertions">
                    <thead>
                        <tr>
                            <th></th>
                            <th>Tag</th>
                            <th>Expected</th>
                            <th>Actual</th>
                            <th>Message</th>
                        </tr>
                    </thead>
                    <tbody>${assertionsHtml}</tbody>
                </table>` : '<div class="no-assertions">No assertions</div>'}
            </div>`;
    }

    const duration = result.DurationMs != null ? `${result.DurationMs}ms` : '';
    const startTime = result.StartedAt ? new Date(result.StartedAt).toLocaleString() : '';

    return `<!DOCTYPE html><html><head>${styles()}</head><body>
        <div class="header">
            <div class="header-main">
                <span class="status-icon ${statusClass}">${statusIcon}</span>
                <h1>${esc(result.TestName)}</h1>
                <span class="status-badge ${statusClass}">${statusLabel}</span>
            </div>
            <div class="header-meta">
                ${duration ? `<span class="meta-item">\u23F1 ${duration}</span>` : ''}
                ${startTime ? `<span class="meta-item">\u{1F4C5} ${startTime}</span>` : ''}
                <span class="meta-item">${(result.Steps || []).length} step(s)</span>
            </div>
            ${result.Description ? `<p class="description">${esc(result.Description)}</p>` : ''}
            ${result.Error ? `<div class="error-banner">${esc(result.Error)}</div>` : ''}
        </div>
        <div class="steps">${stepsHtml}</div>
    </body></html>`;
}

function styles(): string {
    return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            background: var(--vscode-editor-background, #1E1E1E);
            color: var(--vscode-editor-foreground, #C8C8C8);
            font-family: var(--vscode-font-family, 'Segoe UI', sans-serif);
            font-size: 13px; padding: 16px; line-height: 1.5;
        }

        .header {
            margin-bottom: 20px; padding-bottom: 14px;
            border-bottom: 1px solid var(--vscode-panel-border, #3E3E42);
        }
        .header-main {
            display: flex; align-items: center; gap: 10px; margin-bottom: 8px;
        }
        h1 { font-size: 18px; font-weight: 600; }
        .status-icon { font-size: 22px; }
        .status-icon.passed { color: #4EC9B0; }
        .status-icon.failed { color: #EF4444; }
        .status-badge {
            padding: 3px 10px; border-radius: 12px; font-size: 11px;
            font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;
        }
        .status-badge.passed { background: #1A3A1A; color: #4EC9B0; }
        .status-badge.failed { background: #3A1A1A; color: #EF4444; }

        .header-meta {
            display: flex; gap: 16px; color: #808080; font-size: 12px;
        }
        .description { color: #A0A0A0; margin-top: 8px; font-style: italic; }
        .error-banner {
            background: #3A1A1A; color: #EF4444; border: 1px solid #5A2A2A;
            padding: 8px 12px; border-radius: 4px; margin-top: 10px; font-size: 12px;
        }

        .step-card {
            background: var(--vscode-editorWidget-background, #252526);
            border: 1px solid var(--vscode-panel-border, #3E3E42);
            border-radius: 6px; margin-bottom: 10px; overflow: hidden;
        }
        .step-card.failed { border-left: 3px solid #EF4444; }
        .step-card.passed { border-left: 3px solid #4EC9B0; }

        .step-header {
            display: flex; align-items: center; gap: 8px;
            padding: 10px 14px;
            background: var(--vscode-editorGroupHeader-tabsBackground, #2D2D30);
            border-bottom: 1px solid var(--vscode-panel-border, #3E3E42);
        }
        .step-icon { font-size: 14px; }
        .step-icon.passed { color: #4EC9B0; }
        .step-icon.failed { color: #EF4444; }
        .step-name { font-weight: 600; }
        .step-index { margin-left: auto; color: #606060; font-size: 11px; }

        .assertions {
            width: 100%; border-collapse: collapse; font-size: 12px;
        }
        .assertions th {
            text-align: left; padding: 6px 12px; font-weight: 600;
            color: #808080; font-size: 11px; text-transform: uppercase;
            border-bottom: 1px solid var(--vscode-panel-border, #3E3E42);
        }
        .assertions td {
            padding: 6px 12px;
            border-bottom: 1px solid var(--vscode-panel-border, #2A2A2A);
        }
        .a-icon { width: 24px; text-align: center; }
        .assertion-passed .a-icon { color: #4EC9B0; }
        .assertion-failed .a-icon { color: #EF4444; }
        .assertion-failed { background: rgba(239, 68, 68, 0.06); }
        .a-tag { color: #DCDCAA; font-family: 'Consolas', monospace; }
        .a-expected { color: #9CDCFE; font-family: 'Consolas', monospace; }
        .a-actual { font-family: 'Consolas', monospace; }
        .assertion-passed .a-actual { color: #4EC9B0; }
        .assertion-failed .a-actual { color: #EF4444; font-weight: 600; }
        .a-message { color: #808080; font-style: italic; }
        .no-assertions { padding: 8px 14px; color: #606060; font-style: italic; }
    </style>`;
}

function formatValue(v: unknown): string {
    if (v === null || v === undefined) { return 'null'; }
    if (typeof v === 'object') { return JSON.stringify(v); }
    return String(v);
}

function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
