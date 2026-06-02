/**
 * LAD (Ladder Diagram) SVG renderer.
 * Translates block details (networks with parts) into an SVG visualization.
 * Port of the WPF LadderNetworkControl rendering engine to SVG.
 */

// ─── Constants ──────────────────────────────────────────────────────
const CELL_W = 180;
const ROW_H = 165;
const WIRE_Y = 60;
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
    'Move', 'Add', 'Sub', 'Mul', 'Div', 'Mod',
    'CmpEq', 'CmpNe', 'CmpGt', 'CmpGe', 'CmpLt', 'CmpLe',
    'Eq', 'Ne', 'Gt', 'Ge', 'Lt', 'Le',
    'TON', 'TOF', 'TP', 'CTU', 'CTD', 'CTUD',
    'R_TRIG', 'F_TRIG', 'SR', 'RS',
    'And', 'Or', 'Xor', 'Not',
    'Shl', 'Shr', 'Rol', 'Ror',
    'Sqrt', 'Abs', 'Ln', 'Log', 'Exp', 'Sin', 'Cos', 'Tan',
    'Convert', 'RoundInt', 'Trunc', 'Scale', 'Norm',
    'Concat', 'Left', 'Right', 'Mid', 'Len',
    'Call',
]);

function isBoxType(type: string): boolean {
    return BOX_TYPES.has(type);
}

// ─── Pin Configuration ───────────────────────────────────────────────
interface PinConfig {
    in: string[];
    out: string[];
    label?: string;
    color?: string;
}

const PIN_CONFIG: Record<string, PinConfig> = {
    // Timers IEC
    'TON':  { in: ['IN', 'PT'],                     out: ['Q', 'ET'],           color: C_BOX_GREEN },
    'TOF':  { in: ['IN', 'PT'],                     out: ['Q', 'ET'],           color: C_BOX_GREEN },
    'TP':   { in: ['IN', 'PT'],                     out: ['Q', 'ET'],           color: C_BOX_GREEN },
    // Counters IEC
    'CTU':  { in: ['CU', 'R', 'PV'],               out: ['Q', 'CV'],           color: C_BOX_GREEN },
    'CTD':  { in: ['CD', 'LD', 'PV'],              out: ['Q', 'CV'],           color: C_BOX_GREEN },
    'CTUD': { in: ['CU', 'CD', 'R', 'LD', 'PV'],  out: ['QU', 'QD', 'CV'],   color: C_BOX_GREEN },
    // Edge detection
    'R_TRIG': { in: ['CLK'],  out: ['Q'], color: C_BOX_GREEN },
    'F_TRIG': { in: ['CLK'],  out: ['Q'], color: C_BOX_GREEN },
    // Flip-flops
    'SR': { in: ['S', 'R1'],  out: ['Q1'], color: C_BOX_GREEN },
    'RS': { in: ['R', 'S1'],  out: ['Q1'], color: C_BOX_GREEN },
    // Move / conversion
    'Move':     { in: ['IN'],           out: ['OUT'],   color: C_BOX_BLUE },
    'Convert':  { in: ['IN'],           out: ['OUT'],   color: C_BOX_BLUE },
    'RoundInt': { in: ['IN'],           out: ['OUT'],   color: C_BOX_BLUE },
    'Trunc':    { in: ['IN'],           out: ['OUT'],   color: C_BOX_BLUE },
    'Scale':    { in: ['VALUE'],        out: ['OUT'],   color: C_BOX_BLUE },
    'Norm':     { in: ['VALUE'],        out: ['OUT'],   color: C_BOX_BLUE },
    // Arithmetic
    'Add':  { in: ['IN1', 'IN2'], out: ['OUT'], color: C_BOX_BLUE },
    'Sub':  { in: ['IN1', 'IN2'], out: ['OUT'], color: C_BOX_BLUE },
    'Mul':  { in: ['IN1', 'IN2'], out: ['OUT'], color: C_BOX_BLUE },
    'Div':  { in: ['IN1', 'IN2'], out: ['OUT'], color: C_BOX_BLUE },
    'Mod':  { in: ['IN1', 'IN2'], out: ['OUT'], color: C_BOX_BLUE },
    // Comparison (no data output — pass/fail via ENO)
    'CmpEq': { in: ['IN1', 'IN2'], out: [], label: '==', color: C_BOX_PURPLE },
    'CmpNe': { in: ['IN1', 'IN2'], out: [], label: '<>', color: C_BOX_PURPLE },
    'CmpGt': { in: ['IN1', 'IN2'], out: [], label: '>',  color: C_BOX_PURPLE },
    'CmpGe': { in: ['IN1', 'IN2'], out: [], label: '>=', color: C_BOX_PURPLE },
    'CmpLt': { in: ['IN1', 'IN2'], out: [], label: '<',  color: C_BOX_PURPLE },
    'CmpLe': { in: ['IN1', 'IN2'], out: [], label: '<=', color: C_BOX_PURPLE },
    'Eq': { in: ['IN1', 'IN2'], out: [], label: '==', color: C_BOX_PURPLE },
    'Ne': { in: ['IN1', 'IN2'], out: [], label: '<>', color: C_BOX_PURPLE },
    'Gt': { in: ['IN1', 'IN2'], out: [], label: '>',  color: C_BOX_PURPLE },
    'Ge': { in: ['IN1', 'IN2'], out: [], label: '>=', color: C_BOX_PURPLE },
    'Lt': { in: ['IN1', 'IN2'], out: [], label: '<',  color: C_BOX_PURPLE },
    'Le': { in: ['IN1', 'IN2'], out: [], label: '<=', color: C_BOX_PURPLE },
    // Bitwise
    'And': { in: ['IN1', 'IN2'], out: ['OUT'], color: C_BOX_BLUE },
    'Or':  { in: ['IN1', 'IN2'], out: ['OUT'], color: C_BOX_BLUE },
    'Xor': { in: ['IN1', 'IN2'], out: ['OUT'], color: C_BOX_BLUE },
    'Not': { in: ['IN'],         out: ['OUT'], color: C_BOX_BLUE },
    // Shift/rotate
    'Shl': { in: ['IN', 'N'], out: ['OUT'], color: C_BOX_BLUE },
    'Shr': { in: ['IN', 'N'], out: ['OUT'], color: C_BOX_BLUE },
    'Rol': { in: ['IN', 'N'], out: ['OUT'], color: C_BOX_BLUE },
    'Ror': { in: ['IN', 'N'], out: ['OUT'], color: C_BOX_BLUE },
    // Math functions
    'Sqrt': { in: ['IN'], out: ['OUT'], color: C_BOX_BLUE },
    'Abs':  { in: ['IN'], out: ['OUT'], color: C_BOX_BLUE },
    'Ln':   { in: ['IN'], out: ['OUT'], color: C_BOX_BLUE },
    'Log':  { in: ['IN'], out: ['OUT'], color: C_BOX_BLUE },
    'Exp':  { in: ['IN'], out: ['OUT'], color: C_BOX_BLUE },
    'Sin':  { in: ['IN'], out: ['OUT'], color: C_BOX_BLUE },
    'Cos':  { in: ['IN'], out: ['OUT'], color: C_BOX_BLUE },
    'Tan':  { in: ['IN'], out: ['OUT'], color: C_BOX_BLUE },
    // String
    'Concat': { in: ['IN1', 'IN2'],    out: ['OUT'], color: C_BOX_TEAL },
    'Left':   { in: ['IN', 'L'],       out: ['OUT'], color: C_BOX_TEAL },
    'Right':  { in: ['IN', 'L'],       out: ['OUT'], color: C_BOX_TEAL },
    'Mid':    { in: ['IN', 'L', 'P'],  out: ['OUT'], color: C_BOX_TEAL },
    'Len':    { in: ['IN'],            out: ['OUT'], color: C_BOX_TEAL },
};

const FB_BLOCK_W = 112;
const FB_PIN_H = 26;
const FB_HEADER_H = 20;
const FB_INST_H = 14;

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

    // Find OR/AND merge columns: implicit gates define where branches converge
    const mergeGates = parts.filter(p => IMPLICIT_GATES.has(p.Type || ''));
    // Branch rows = rows that are NOT row 0 (row 0 is the main trunk)
    const branchRows = [...new Set(visible.map(p => p.Row))].filter(r => r > 0).sort((a, b) => a - b);
    // Merge column = column of the first implicit gate (where branches rejoin)
    const mergeCol = mergeGates.length > 0 ? mergeGates[0].Col : -1;

    // Horizontal wires per row
    const rowGroups = groupBy(visible, p => p.Row);
    for (const [row, rowParts] of rowGroups) {
        const minC = Math.min(...rowParts.map(p => p.Col));
        const hasOutput = rowParts.some(p => OUTPUT_TYPES.has(p.Type));
        let wireEnd: number;
        if (hasOutput) {
            wireEnd = rightRailX;
        } else if (row > 0 && mergeCol > 0) {
            // Branch rows extend to the merge column
            wireEnd = mergeCol * CELL_W;
        } else {
            wireEnd = (Math.max(...rowParts.map(p => p.Col)) + 1) * CELL_W;
        }
        const y = row * ROW_H + WIRE_Y;
        svg += hLine(minC * CELL_W, wireEnd, y, C_WIRE, WIRE_THICKNESS);
    }

    // Vertical connectors at branch points (visible parts)
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

    // Merge vertical connector where branches rejoin (at OR/AND gate column)
    if (mergeCol > 0 && branchRows.length > 0) {
        const mergeX = mergeCol * CELL_W;
        const y1 = 0 * ROW_H + WIRE_Y;
        const y2 = branchRows[branchRows.length - 1] * ROW_H + WIRE_Y;
        svg += vLine(mergeX, y1, y2, C_WIRE, WIRE_THICKNESS);
        svg += junctionDot(mergeX, y1);
        for (const r of branchRows) {
            svg += junctionDot(mergeX, r * ROW_H + WIRE_Y);
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
    const cx = x + 70;
    const symY = y + WIRE_Y;

    let svg = '';

    if (!isBox) {
        // Signal name above contacts/coils
        const signalY = y + 14;
        if (signal && signal !== 'OR' && signal !== 'AND') {
            svg += `<text x="${cx}" y="${signalY}" text-anchor="middle" fill="${C_SIGNAL}" font-size="11" font-family="Consolas, monospace">${escHtml(signal)}</text>`;
        } else if (!signal) {
            svg += `<text x="${cx}" y="${signalY}" text-anchor="middle" fill="${C_ERROR}" font-size="11" font-family="Consolas, monospace">???</text>`;
        }
        if (part.Address) {
            svg += `<text x="${cx}" y="${signalY + 13}" text-anchor="middle" fill="${C_ADDRESS}" font-size="9" font-family="Consolas, monospace">${escHtml(part.Address)}</text>`;
        }
    }

    switch (type) {
        case 'Contact':
            svg += part.Negated ? drawContactNC(cx, symY, C_SYMBOL) : drawContactNO(cx, symY, C_SYMBOL);
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
        case 'Call': {
            const blockLabel = part.BlockName || 'CALL';
            svg += drawFunctionBlock(cx, symY, blockLabel, signal, part.Parameters || {}, C_BOX_TEAL);
            break;
        }
        default:
            if (IMPLICIT_GATES.has(type)) break;
            if (isBox) {
                const cfg = PIN_CONFIG[type];
                const label = cfg?.label ?? type;
                const color = cfg?.color ?? C_ADDRESS;
                svg += drawFunctionBlock(cx, symY, label, signal, part.Parameters || {}, color);
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

function drawFunctionBlock(
    cx: number,
    wireY: number,
    label: string,
    instanceName: string,
    params: Record<string, string>,
    color: string,
): string {
    // Normalize param keys to UPPERCASE for case-insensitive lookup (API sends mixed case)
    const p: Record<string, string> = {};
    for (const [k, v] of Object.entries(params)) { p[k.toUpperCase()] = v; }

    const cfg = PIN_CONFIG[label] ?? { in: [], out: [] };
    const inputPins  = cfg.in;
    const outputPins = cfg.out;

    // For unknown FB calls, derive pins from params keys (heuristic: keys ending with no suffix = input)
    const resolvedIn  = inputPins.length  > 0 ? inputPins  : Object.keys(p).slice(0, 3);
    const resolvedOut = outputPins.length > 0 ? outputPins : [];

    const dataPinRows = Math.max(resolvedIn.length, resolvedOut.length);
    const blockH = FB_HEADER_H + FB_INST_H + FB_PIN_H + dataPinRows * FB_PIN_H + 6;

    const x0 = cx - FB_BLOCK_W / 2;
    // EN row sits at wireY; block header floats above it
    const blockTop = wireY - FB_HEADER_H - FB_INST_H - FB_PIN_H / 2;
    const enRowY   = wireY;

    let s = '';

    // ── Outer border ──
    s += `<rect x="${x0}" y="${blockTop}" width="${FB_BLOCK_W}" height="${blockH}" fill="${C_BG}" stroke="${color}" stroke-width="1.5" rx="3"/>`;

    // ── Tinted header band ──
    const hdrH = FB_HEADER_H + FB_INST_H;
    s += `<rect x="${x0}" y="${blockTop}" width="${FB_BLOCK_W}" height="${hdrH}" fill="${color}" fill-opacity="0.12" rx="3"/>`;
    s += `<line x1="${x0}" y1="${blockTop + hdrH}" x2="${x0 + FB_BLOCK_W}" y2="${blockTop + hdrH}" stroke="${color}" stroke-width="0.7" opacity="0.4"/>`;

    // ── Instruction type label ──
    s += `<text x="${cx}" y="${blockTop + 14}" text-anchor="middle" fill="${color}" font-size="11" font-weight="bold" font-family="Consolas, monospace">${escHtml(label)}</text>`;

    // ── Instance / DB name (skip if same as type label to avoid duplication) ──
    if (instanceName && instanceName.toLowerCase() !== label.toLowerCase()) {
        const disp = instanceName.length > 14 ? instanceName.substring(0, 13) + '…' : instanceName;
        s += `<text x="${cx}" y="${blockTop + hdrH - 3}" text-anchor="middle" fill="${C_SIGNAL}" font-size="9" font-family="Consolas, monospace">${escHtml(disp)}</text>`;
    }

    // ── EN pin (left) — power flow in ──
    s += `<text x="${x0 + 4}" y="${enRowY + 10}" fill="${C_ADDRESS}" font-size="9" font-family="Consolas, monospace">EN</text>`;
    // thin separator line at EN row
    s += `<line x1="${x0 + 1}" y1="${enRowY + FB_PIN_H / 2}" x2="${x0 + FB_BLOCK_W - 1}" y2="${enRowY + FB_PIN_H / 2}" stroke="${color}" stroke-width="0.5" opacity="0.25" stroke-dasharray="3,3"/>`;

    // ── ENO pin (right) — power flow out ──
    s += `<text x="${x0 + FB_BLOCK_W - 4}" y="${enRowY + 10}" text-anchor="end" fill="${C_ADDRESS}" font-size="9" font-family="Consolas, monospace">ENO</text>`;

    // ── Data input pins (left, below EN) ──
    for (let i = 0; i < resolvedIn.length; i++) {
        const pinY = enRowY + FB_PIN_H + i * FB_PIN_H;
        const pinName = resolvedIn[i];
        const pinVal  = p[pinName.toUpperCase()] ?? '';

        // stub wire from left
        s += `<line x1="${x0 - 14}" y1="${pinY + 6}" x2="${x0}" y2="${pinY + 6}" stroke="${C_WIRE}" stroke-width="1" stroke-dasharray="3,2" opacity="0.55"/>`;
        // pin name (line 1 inside)
        s += `<text x="${x0 + 4}" y="${pinY + 10}" fill="${C_ADDRESS}" font-size="9" font-family="Consolas, monospace">${escHtml(pinName)}</text>`;
        // connected value (line 2 inside, cyan)
        if (pinVal) {
            const valDisp = pinVal.length > 13 ? pinVal.substring(0, 12) + '…' : pinVal;
            s += `<text x="${x0 + 4}" y="${pinY + 22}" fill="${C_SIGNAL}" font-size="8" font-family="Consolas, monospace">${escHtml(valDisp)}</text>`;
        }
    }

    // ── Data output pins (right, below ENO) ──
    for (let i = 0; i < resolvedOut.length; i++) {
        const pinY = enRowY + FB_PIN_H + i * FB_PIN_H;
        const pinName = resolvedOut[i];
        const pinVal  = p[pinName.toUpperCase()] ?? '';

        // stub wire to right
        s += `<line x1="${x0 + FB_BLOCK_W}" y1="${pinY + 6}" x2="${x0 + FB_BLOCK_W + 14}" y2="${pinY + 6}" stroke="${C_WIRE}" stroke-width="1" stroke-dasharray="3,2" opacity="0.55"/>`;
        // pin name (line 1 inside, right-aligned)
        s += `<text x="${x0 + FB_BLOCK_W - 4}" y="${pinY + 10}" text-anchor="end" fill="${C_ADDRESS}" font-size="9" font-family="Consolas, monospace">${escHtml(pinName)}</text>`;
        // connected value (line 2 inside, cyan, right-aligned)
        if (pinVal) {
            const valDisp = pinVal.length > 13 ? pinVal.substring(0, 12) + '…' : pinVal;
            s += `<text x="${x0 + FB_BLOCK_W - 4}" y="${pinY + 22}" text-anchor="end" fill="${C_SIGNAL}" font-size="8" font-family="Consolas, monospace">${escHtml(valDisp)}</text>`;
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
