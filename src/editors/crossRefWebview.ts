import * as vscode from 'vscode';
import { getCrossReferences } from '../api/blocks';
import { CrossReferenceResult } from '../api/types';
import { log, logError } from '../views/outputChannel';
import { createWebviewWithHeartbeat } from '../utils/webviewHelper';

const openPanels = new Map<string, vscode.WebviewPanel>();

export async function openCrossRefWebview(
    deviceName: string,
    blockName: string,
): Promise<void> {
    const panelKey = `xref:${deviceName}:${blockName}`;

    const existing = openPanels.get(panelKey);
    if (existing) {
        existing.reveal(vscode.ViewColumn.Beside);
        return;
    }

    // Load data BEFORE creating the panel to avoid service worker issues
    let contentHtml: string;
    try {
        const xref = await getCrossReferences(deviceName, blockName);
        contentHtml = renderCrossRefHtml(blockName, xref);
        log(`Opened cross-references for ${blockName}`);
    } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logError(`Failed to load cross-references for ${blockName}`, err);
        contentHtml = errorHtml(blockName, msg);
    }

    const panel = await createWebviewWithHeartbeat(
        'tiaCrossRef',
        `Cross-Ref: ${blockName}`,
        (nonce) => injectHeartbeat(contentHtml, nonce),
        vscode.ViewColumn.Beside,
    );
    if (!panel) { return; }

    openPanels.set(panelKey, panel);
    panel.onDidDispose(() => openPanels.delete(panelKey));
}

function renderCrossRefHtml(blockName: string, xref: CrossReferenceResult): string {
    if (!xref || xref.SourceCount === 0) {
        return `<!DOCTYPE html><html><head>${styles()}</head><body>
            <div class="header">
                <h1>Cross-References: ${esc(blockName)}</h1>
                <span class="badge empty">No references found</span>
            </div>
            <p class="muted">This block is not referenced by any other block or tag.</p>
        </body></html>`;
    }

    let sourcesHtml = '';
    for (const src of xref.Sources) {
        let objectsHtml = '';
        for (const obj of src.ReferenceObjects) {
            let locationsHtml = '';
            for (const loc of obj.Locations) {
                const accessClass = loc.Access === 'Write' ? 'access-write'
                    : loc.Access === 'Read' ? 'access-read'
                    : 'access-other';
                locationsHtml += `
                    <div class="location">
                        <span class="tag ${accessClass}">${esc(loc.Access)}</span>
                        <span class="loc-detail">${esc(loc.ReferenceLocation)}</span>
                        <span class="loc-type">${esc(loc.ReferenceType)}</span>
                    </div>`;
            }

            objectsHtml += `
                <div class="ref-object">
                    <div class="ref-object-header">
                        <span class="icon">→</span>
                        <span class="type-badge">${esc(obj.TypeName)}</span>
                        <span class="ref-name">${esc(obj.Name)}</span>
                        ${obj.Address ? `<span class="address">[${esc(obj.Address)}]</span>` : ''}
                    </div>
                    ${locationsHtml ? `<div class="locations">${locationsHtml}</div>` : ''}
                </div>`;
        }

        sourcesHtml += `
            <div class="source-card">
                <div class="source-header">
                    <span class="source-icon">📦</span>
                    <span class="type-badge source-type">${esc(src.TypeName)}</span>
                    <span class="source-name">${esc(src.Name)}</span>
                    ${src.Address ? `<span class="address">[${esc(src.Address)}]</span>` : ''}
                    <span class="ref-count">${src.ReferenceObjects.length} ref(s)</span>
                </div>
                <div class="ref-objects">${objectsHtml}</div>
            </div>`;
    }

    return `<!DOCTYPE html><html><head>${styles()}</head><body>
        <div class="header">
            <h1>Cross-References: ${esc(blockName)}</h1>
            <span class="badge">${xref.SourceCount} source(s)</span>
            <span class="badge">${xref.TotalReferenceCount} reference(s)</span>
        </div>
        <div class="sources">${sourcesHtml}</div>
    </body></html>`;
}

function styles(): string {
    return `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            background: #1E1E1E; color: #C8C8C8;
            font-family: 'Segoe UI', -apple-system, sans-serif;
            font-size: 13px; padding: 16px; line-height: 1.5;
        }
        .header {
            display: flex; align-items: center; gap: 10px;
            margin-bottom: 16px; padding-bottom: 12px;
            border-bottom: 1px solid #3E3E42;
        }
        h1 { font-size: 16px; font-weight: 600; color: #E0E0E0; }
        .badge {
            background: #264F78; color: #9CDCFE;
            padding: 2px 8px; border-radius: 10px; font-size: 11px;
        }
        .badge.empty { background: #3E3E42; color: #808080; }
        .muted { color: #808080; font-style: italic; padding: 20px 0; }

        .source-card {
            background: #252526; border: 1px solid #3E3E42;
            border-radius: 6px; margin-bottom: 12px; overflow: hidden;
        }
        .source-header {
            display: flex; align-items: center; gap: 8px;
            padding: 10px 14px; background: #2D2D30;
            border-bottom: 1px solid #3E3E42;
        }
        .source-icon { font-size: 14px; }
        .source-name { font-weight: 600; color: #E0E0E0; }
        .type-badge {
            background: #1E3A5F; color: #569CD6;
            padding: 1px 6px; border-radius: 3px; font-size: 11px;
            font-family: 'Consolas', monospace;
        }
        .source-type { background: #3B2F1F; color: #CE9178; }
        .address {
            color: #808080; font-family: 'Consolas', monospace; font-size: 12px;
        }
        .ref-count {
            margin-left: auto; color: #606060; font-size: 11px;
        }

        .ref-objects { padding: 6px 14px 10px 14px; }
        .ref-object { margin: 6px 0; }
        .ref-object-header {
            display: flex; align-items: center; gap: 6px;
            padding: 4px 0;
        }
        .icon { color: #569CD6; font-weight: bold; }
        .ref-name { color: #DCDCAA; }

        .locations { padding-left: 28px; }
        .location {
            display: flex; align-items: center; gap: 8px;
            padding: 2px 0; font-size: 12px;
        }
        .tag {
            padding: 1px 6px; border-radius: 3px; font-size: 10px;
            font-weight: 600; text-transform: uppercase;
        }
        .access-read { background: #1A3A1A; color: #4EC9B0; }
        .access-write { background: #3A1A1A; color: #EF4444; }
        .access-other { background: #2D2D30; color: #808080; }
        .loc-detail { color: #C8C8C8; }
        .loc-type { color: #606060; font-style: italic; }
    </style>`;
}

function errorHtml(blockName: string, message: string): string {
    return `<!DOCTYPE html><html><head>
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
        <style>
        body { background: #1E1E1E; color: #C8C8C8; font-family: 'Segoe UI', sans-serif; padding: 24px; }
        .error { color: #EF4444; margin-top: 8px; }
    </style></head><body>
        <h2>Failed to load cross-references for ${esc(blockName)}</h2>
        <p class="error">${esc(message)}</p>
    </body></html>`;
}

function injectHeartbeat(html: string, nonce: string): string {
    html = html.replace(
        /content="default-src 'none'; style-src 'unsafe-inline';?"/,
        `content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';"`,
    );
    const heartbeat = `<script nonce="${nonce}">const vscode=acquireVsCodeApi();vscode.postMessage({type:'webview-ready'});</script>`;
    return html.replace('</body>', `${heartbeat}</body>`);
}

function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
