/**
 * LAD (Ladder Diagram) SVG renderer.
 * Translates block details (networks with parts) into an SVG visualization.
 * Port of the WPF LadderNetworkControl rendering engine to SVG.
 */

// ─── Constants ──────────────────────────────────────────────────────
const CELL_W = 140;
const ROW_H = 90;
const WIRE_Y = 45;
const WIRE_THICKNESS = 1.5;
const RAIL_WIDTH = 2;
const RAIL_PADDING = 15;
const JUNCTION_R = 2.5;

// Colors (dark theme, matching WPF)
const C_WIRE = '#C8C8C8';
const C_SYMBOL = '#D4D4D4';
const C_ADDRESS = '#808080';
const C_SIGNAL = '#9CDCFE';
const C_ERROR = '#EF4444';
const C_COIL = '#EAB308';
const C_SET = '#22C55E';
const C_RESET = '#EF4444';
const C_BOX_BLUE = '#569CD6';
const C_BOX_PURPLE = '#A855F7';
const C_BOX_GREEN = '#22C55E';
const C_BOX_TEAL = '#4EC9B0';
const C_BG = '#1E1E1E';
const C_BORDER = '#3E3E42';
const C_HEADER_BG = '#252526';
const C_TITLE = '#CCCCCC';
const C_NETWORK_NUM = '#808080';

const OUTPUT_TYPES = new Set(['Coil', 'SCoil', 'RCoil']);
const IMPLICIT_GATES = new Set(['O', 'A']);
const BOX_TYPES = new Set([
    'Move', 'Add', 'Sub', 'Mul', 'Div',
    'CmpEq', 'CmpNe', 'CmpGt', 'CmpGe', 'CmpLt', 'CmpLe',
    'Eq', 'Ne', 'Gt', 'Ge', 'Lt', 'Le',
    'TON', 'TOF', 'TP', 'CTU', 'CTD', 'CTUD',
    'Call',
]);

function isBoxType(type: string): boolean {
    return BOX_TYPES.has(type);
}

interface LadPart {
    UId: string;
    Type: string;
    Signal?: string;
    Negated?: boolean;
    IsGlobal?: boolean;
    BlockName?: string;
    Address?: string;
    Parameters?: Record<string, string>;
    Row: number;
    Col: number;
}

interface LadNetwork {
    Number: number;
    Title?: string;
    Comment?: string;
    Language?: string;
    Parts?: any[];
}

// ─── Public API ─────────────────────────────────────────────────────

export function renderBlockToHtml(blockDetails: any): string {
    const name = blockDetails.Name || 'Block';
    const blockType = blockDetails.BlockType || '';
    const language = blockDetails.ProgrammingLanguage || '';
    const networks: LadNetwork[] = blockDetails.Networks || [];
    const iface = blockDetails.Interface || [];

    let svgContent = '';
    for (const net of networks) {
        svgContent += renderNetwork(net);
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:;">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
    body {
        background: ${C_BG};
        color: ${C_SYMBOL};
        font-family: 'Segoe UI', Consolas, monospace;
        margin: 0;
        padding: 16px;
    }
    .block-header {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 16px;
        padding: 10px 14px;
        background: ${C_HEADER_BG};
        border: 1px solid ${C_BORDER};
        border-radius: 4px;
    }
    .block-name {
        font-size: 16px;
        font-weight: bold;
        color: ${C_SIGNAL};
    }
    .block-badge {
        padding: 2px 8px;
        border-radius: 3px;
        font-size: 11px;
        font-weight: bold;
        color: white;
    }
    .badge-ob { background: #D97706; }
    .badge-fb { background: #2563EB; }
    .badge-fc { background: #7C3AED; }
    .badge-db { background: #059669; }
    .badge-lang { background: #4B5563; }
    .interface-section {
        margin-bottom: 16px;
        padding: 10px 14px;
        background: ${C_HEADER_BG};
        border: 1px solid ${C_BORDER};
        border-radius: 4px;
    }
    .interface-title {
        font-size: 12px;
        font-weight: bold;
        color: ${C_ADDRESS};
        margin-bottom: 6px;
        text-transform: uppercase;
    }
    .interface-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
    }
    .interface-table th {
        text-align: left;
        color: ${C_ADDRESS};
        padding: 3px 8px;
        border-bottom: 1px solid ${C_BORDER};
    }
    .interface-table td {
        padding: 3px 8px;
        border-bottom: 1px solid #2A2A2E;
    }
    .interface-table .var-name { color: ${C_SIGNAL}; }
    .interface-table .var-type { color: ${C_BOX_TEAL}; }
    .interface-table .var-section { color: ${C_ADDRESS}; }
    .network-container {
        margin-bottom: 12px;
        border: 1px solid ${C_BORDER};
        border-radius: 4px;
        overflow: hidden;
    }
    .network-header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 12px;
        background: ${C_HEADER_BG};
        border-bottom: 1px solid ${C_BORDER};
        cursor: default;
    }
    .network-number {
        color: ${C_NETWORK_NUM};
        font-size: 12px;
        font-weight: bold;
    }
    .network-title {
        color: ${C_TITLE};
        font-size: 12px;
    }
    .network-body {
        padding: 8px;
        overflow-x: auto;
    }
    .network-empty {
        color: ${C_ADDRESS};
        font-style: italic;
        padding: 12px;
        font-size: 12px;
    }
</style>
</head>
<body>
    <div class="block-header">
        <span class="block-badge badge-${blockType.toLowerCase()}">${blockType}</span>
        <span class="block-name">${escHtml(name)}</span>
        <span class="block-badge badge-lang">${language}</span>
    </div>
    ${renderInterface(iface)}
    ${svgContent}
</body>
</html>`;
}

// ─── Interface Table ────────────────────────────────────────────────

function renderInterface(iface: any[]): string {
    if (!iface || iface.length === 0) return '';

    const sections = ['Input', 'Output', 'InOut', 'Static', 'Temp'];
    const grouped: Record<string, any[]> = {};
    for (const m of iface) {
        const s = m.Section || 'Unknown';
        if (!grouped[s]) grouped[s] = [];
        grouped[s].push(m);
    }

    let rows = '';
    for (const section of sections) {
        const members = grouped[section];
        if (!members || members.length === 0) continue;
        for (const m of members) {
            rows += `<tr>
                <td class="var-section">${section}</td>
                <td class="var-name">${escHtml(m.Name)}</td>
                <td class="var-type">${escHtml(m.DataType)}</td>
            </tr>`;
        }
    }

    if (!rows) return '';

    return `<div class="interface-section">
        <div class="interface-title">Interface</div>
        <table class="interface-table">
            <tr><th>Section</th><th>Name</th><th>Type</th></tr>
            ${rows}
        </table>
    </div>`;
}

// ─── Network Rendering ──────────────────────────────────────────────

function renderNetwork(net: LadNetwork): string {
    const rawParts = net.Parts || [];
    if (rawParts.length === 0) {
        return `<div class="network-container">
            <div class="network-header">
                <span class="network-number">Network ${net.Number}:</span>
                <span class="network-title">${escHtml(net.Title || '')}</span>
            </div>
            <div class="network-empty">Empty network</div>
        </div>`;
    }

    // Prepare parts with Row/Col
    const parts: LadPart[] = rawParts.map(p => ({
        ...p,
        Row: 0,
        Col: 0,
    }));

    // Assign topology
    assignTopology(parts);

    // Filter out implicit gates (O, A) for rendering
    const visible = parts.filter(p => !IMPLICIT_GATES.has(p.Type || ''));
    if (visible.length === 0) {
        return `<div class="network-container">
            <div class="network-header">
                <span class="network-number">Network ${net.Number}:</span>
                <span class="network-title">${escHtml(net.Title || '')}</span>
            </div>
            <div class="network-empty">Empty network</div>
        </div>`;
    }

    const maxRow = Math.max(...visible.map(p => p.Row));
    const maxCol = Math.max(...visible.map(p => p.Col));
    const rightRailX = (maxCol + 2) * CELL_W;
    const totalW = rightRailX + RAIL_WIDTH + 10;
    const totalH = (maxRow + 1) * ROW_H;

    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}">`;

    // Left rail
    const railTop = WIRE_Y - RAIL_PADDING;
    const railBot = maxRow * ROW_H + WIRE_Y + RAIL_PADDING;
    svg += vLine(0, railTop, railBot, C_WIRE, RAIL_WIDTH);

    // Right rail (only where there are outputs)
    const outputRows = [...new Set(visible.filter(p => OUTPUT_TYPES.has(p.Type)).map(p => p.Row))].sort();
    if (outputRows.length > 0) {
        const rTop = outputRows[0] * ROW_H + WIRE_Y - RAIL_PADDING;
        const rBot = outputRows[outputRows.length - 1] * ROW_H + WIRE_Y + RAIL_PADDING;
        svg += vLine(rightRailX, rTop, rBot, C_WIRE, RAIL_WIDTH);
    }

    // Horizontal wires per row
    const rowGroups = groupBy(visible, p => p.Row);
    for (const [row, rowParts] of rowGroups) {
        const minC = Math.min(...rowParts.map(p => p.Col));
        const hasOutput = rowParts.some(p => OUTPUT_TYPES.has(p.Type));
        const wireEnd = hasOutput ? rightRailX : (Math.max(...rowParts.map(p => p.Col)) + 1) * CELL_W;
        const y = row * ROW_H + WIRE_Y;
        svg += hLine(minC * CELL_W, wireEnd, y, C_WIRE, WIRE_THICKNESS);
    }

    // Vertical connectors at branch points
    const colGroups = groupBy(visible, p => p.Col);
    for (const [col, colParts] of colGroups) {
        const rows = [...new Set(colParts.map(p => p.Row))].sort((a, b) => a - b);
        if (rows.length <= 1) continue;
        const x = col * CELL_W;
        const y1 = rows[0] * ROW_H + WIRE_Y;
        const y2 = rows[rows.length - 1] * ROW_H + WIRE_Y;
        svg += vLine(x, y1, y2, C_WIRE, WIRE_THICKNESS);
        for (const r of rows) {
            svg += junctionDot(x, r * ROW_H + WIRE_Y);
        }
    }

    // Parts
    for (const part of visible) {
        const x = part.Col * CELL_W + 5;
        const y = part.Row * ROW_H;
        svg += renderPart(part, x, y);
    }

    svg += '</svg>';

    return `<div class="network-container">
        <div class="network-header">
            <span class="network-number">Network ${net.Number}:</span>
            <span class="network-title">${escHtml(net.Title || '')}</span>
        </div>
        <div class="network-body">${svg}</div>
    </div>`;
}

// ─── Topology Assignment ────────────────────────────────────────────

function assignTopology(parts: LadPart[]): void {
    // Try to detect parallel structures
    const orIdx = parts.findIndex(p => p.Type === 'O');
    if (orIdx > 1) {
        // OR gate: inputs go to separate rows, rest on row 0
        for (let i = 0; i < orIdx; i++) {
            parts[i].Row = i;
            parts[i].Col = 0;
        }
        let col = 1;
        for (let i = orIdx; i < parts.length; i++) {
            parts[i].Row = 0;
            parts[i].Col = col++;
        }
        return;
    }

    // Check for multiple outputs
    const outputs = parts.filter(p => OUTPUT_TYPES.has(p.Type));
    if (outputs.length > 1) {
        const firstCoilIdx = parts.indexOf(outputs[0]);
        const allCoilsAtEnd = parts.slice(firstCoilIdx).every(p => OUTPUT_TYPES.has(p.Type));

        if (allCoilsAtEnd) {
            // Parallel outputs
            for (let i = 0; i < firstCoilIdx; i++) {
                parts[i].Row = 0;
                parts[i].Col = i;
            }
            for (let i = 0; i < outputs.length; i++) {
                outputs[i].Row = i;
                outputs[i].Col = firstCoilIdx;
            }
            return;
        }
    }

    // Simple flat layout
    let col = 0;
    for (const p of parts) {
        p.Row = 0;
        p.Col = col++;
    }
}

// ─── Part Rendering ─────────────────────────────────────────────────

function renderPart(part: LadPart, x: number, y: number): string {
    const type = part.Type || '';
    const signal = part.Signal || '';
    const isBox = isBoxType(type);
    const signalDisplay = type === 'Call' && part.BlockName ? part.BlockName : signal;
    const cx = x + 60; // center of the 120px element
    const symY = y + WIRE_Y; // vertical center (wire line)

    let svg = '';

    // Signal name above (skip for box instructions without a meaningful signal)
    const signalX = cx;
    const signalY = y + 12;
    if (signalDisplay && signalDisplay !== 'OR' && signalDisplay !== 'AND') {
        svg += `<text x="${signalX}" y="${signalY}" text-anchor="middle" fill="${C_SIGNAL}" font-size="11" font-family="Consolas, monospace">${escHtml(signalDisplay)}</text>`;
    } else if (!isBox && !signalDisplay) {
        svg += `<text x="${signalX}" y="${signalY}" text-anchor="middle" fill="${C_ERROR}" font-size="11" font-family="Consolas, monospace">???</text>`;
    }

    // Address below signal (if present)
    if (part.Address) {
        svg += `<text x="${signalX}" y="${signalY + 13}" text-anchor="middle" fill="${C_ADDRESS}" font-size="9" font-family="Consolas, monospace">${escHtml(part.Address)}</text>`;
    }

    switch (type) {
        case 'Contact':
            if (part.Negated) {
                svg += drawContactNC(cx, symY, C_SYMBOL);
            } else {
                svg += drawContactNO(cx, symY, C_SYMBOL);
            }
            break;
        case 'ContactNC':
            svg += drawContactNC(cx, symY, C_SYMBOL);
            break;
        case 'ContactP':
            svg += drawContactLabel(cx, symY, 'P', C_SYMBOL);
            break;
        case 'ContactN':
            svg += drawContactLabel(cx, symY, 'N', C_SYMBOL);
            break;
        case 'Coil':
            svg += drawCoil(cx, symY, C_COIL, null);
            break;
        case 'SCoil':
            svg += drawCoil(cx, symY, C_SET, 'S');
            break;
        case 'RCoil':
            svg += drawCoil(cx, symY, C_RESET, 'R');
            break;
        case 'Move': case 'Add': case 'Sub': case 'Mul': case 'Div':
            svg += drawBox(cx, symY, type.toUpperCase(), C_BOX_BLUE, part.Parameters);
            break;
        case 'CmpEq': case 'Eq': svg += drawBox(cx, symY, '==', C_BOX_PURPLE, part.Parameters); break;
        case 'CmpNe': case 'Ne': svg += drawBox(cx, symY, '<>', C_BOX_PURPLE, part.Parameters); break;
        case 'CmpGt': case 'Gt': svg += drawBox(cx, symY, '>', C_BOX_PURPLE, part.Parameters); break;
        case 'CmpGe': case 'Ge': svg += drawBox(cx, symY, '>=', C_BOX_PURPLE, part.Parameters); break;
        case 'CmpLt': case 'Lt': svg += drawBox(cx, symY, '<', C_BOX_PURPLE, part.Parameters); break;
        case 'CmpLe': case 'Le': svg += drawBox(cx, symY, '<=', C_BOX_PURPLE, part.Parameters); break;
        case 'TON': case 'TOF': case 'TP':
        case 'CTU': case 'CTD': case 'CTUD':
            svg += drawBox(cx, symY, type, C_BOX_GREEN, part.Parameters);
            break;
        case 'Call':
            svg += drawBox(cx, symY, 'CALL', C_BOX_TEAL, part.Parameters);
            break;
        default:
            if (!IMPLICIT_GATES.has(type)) {
                svg += drawBox(cx, symY, type, C_ADDRESS, part.Parameters);
            }
            break;
    }

    return svg;
}

// ─── Symbol Primitives ──────────────────────────────────────────────

function drawContactNO(cx: number, cy: number, color: string): string {
    const bh = 18, hw = 11;
    const y0 = cy - bh / 2;
    let s = '';
    // Background rect to hide wire
    s += `<rect x="${cx - hw}" y="${y0}" width="${hw * 2}" height="${bh}" fill="${C_BG}"/>`;
    // Two vertical bars
    s += `<line x1="${cx - hw}" y1="${y0}" x2="${cx - hw}" y2="${y0 + bh}" stroke="${color}" stroke-width="2" stroke-linecap="round"/>`;
    s += `<line x1="${cx + hw}" y1="${y0}" x2="${cx + hw}" y2="${y0 + bh}" stroke="${color}" stroke-width="2" stroke-linecap="round"/>`;
    return s;
}

function drawContactNC(cx: number, cy: number, color: string): string {
    const bh = 18;
    const y0 = cy - bh / 2;
    let s = drawContactNO(cx, cy, color);
    // Diagonal slash
    s += `<line x1="${cx + 6}" y1="${y0 + 1}" x2="${cx - 6}" y2="${y0 + bh - 1}" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/>`;
    return s;
}

function drawContactLabel(cx: number, cy: number, label: string, color: string): string {
    let s = drawContactNO(cx, cy, color);
    s += `<text x="${cx}" y="${cy + 4}" text-anchor="middle" fill="${color}" font-size="10" font-weight="bold" font-family="Consolas, monospace">${label}</text>`;
    return s;
}

function drawCoil(cx: number, cy: number, color: string, label: string | null): string {
    const r = 9;
    let s = '';
    // Background rect
    s += `<rect x="${cx - 14}" y="${cy - r}" width="28" height="${r * 2}" fill="${C_BG}"/>`;
    // Left arc (
    s += `<path d="M ${cx - 4},${cy - r} A 6,${r} 0 0 0 ${cx - 4},${cy + r}" fill="none" stroke="${color}" stroke-width="1.8"/>`;
    // Right arc )
    s += `<path d="M ${cx + 4},${cy - r} A 6,${r} 0 0 1 ${cx + 4},${cy + r}" fill="none" stroke="${color}" stroke-width="1.8"/>`;
    if (label) {
        s += `<text x="${cx}" y="${cy + 4}" text-anchor="middle" fill="${color}" font-size="10" font-weight="bold" font-family="Consolas, monospace">${label}</text>`;
    }
    return s;
}

function drawBox(cx: number, cy: number, label: string, color: string, params?: Record<string, string>): string {
    const bw = 56, bh = 26;
    const x0 = cx - bw / 2;
    const y0 = cy - bh / 2;
    let s = '';
    s += `<rect x="${x0}" y="${y0}" width="${bw}" height="${bh}" fill="${C_BG}" stroke="${color}" stroke-width="1.5" rx="2"/>`;
    s += `<text x="${cx}" y="${cy + 4}" text-anchor="middle" fill="${color}" font-size="11" font-weight="bold" font-family="Consolas, monospace">${escHtml(label)}</text>`;

    // Parameters below the box
    if (params && Object.keys(params).length > 0) {
        let py = cy + bh / 2 + 14;
        for (const [key, val] of Object.entries(params)) {
            s += `<text x="${cx}" y="${py}" text-anchor="middle" fill="${C_ADDRESS}" font-size="9" font-family="Consolas, monospace">${escHtml(key)}: ${escHtml(val)}</text>`;
            py += 12;
        }
    }

    return s;
}

// ─── Drawing Helpers ────────────────────────────────────────────────

function hLine(x1: number, x2: number, y: number, color: string, width: number): string {
    return `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${color}" stroke-width="${width}"/>`;
}

function vLine(x: number, y1: number, y2: number, color: string, width: number): string {
    return `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${color}" stroke-width="${width}"/>`;
}

function junctionDot(x: number, y: number): string {
    return `<circle cx="${x}" cy="${y}" r="${JUNCTION_R}" fill="${C_WIRE}"/>`;
}

// ─── Utilities ──────────────────────────────────────────────────────

function escHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function groupBy<T>(arr: T[], keyFn: (item: T) => number): Map<number, T[]> {
    const map = new Map<number, T[]>();
    for (const item of arr) {
        const key = keyFn(item);
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(item);
    }
    return map;
}
