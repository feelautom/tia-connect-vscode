/**
 * Lightweight SCL/STL parser for extracting symbols from source code.
 * Used by completion, hover, go-to-definition, and document symbol providers.
 */

export interface SclVariable {
    name: string;
    dataType: string;
    section: string;        // Input, Output, InOut, Static, Temp, Constant, Var
    line: number;           // 0-based line number of declaration
    endLine: number;
    comment?: string;
    initialValue?: string;
}

export interface SclBlockHeader {
    kind: 'FUNCTION_BLOCK' | 'FUNCTION' | 'DATA_BLOCK' | 'ORGANIZATION_BLOCK' | 'TYPE';
    name: string;
    returnType?: string;    // For FUNCTION only
    line: number;
}

export interface SclRegion {
    kind: string;           // 'VAR_INPUT', 'VAR_OUTPUT', 'VAR', 'BEGIN', etc.
    startLine: number;
    endLine: number;
}

export interface SclParseResult {
    header?: SclBlockHeader;
    variables: SclVariable[];
    regions: SclRegion[];
}

const BLOCK_HEADER_RE = /^\s*(?:(?:FUNCTION_BLOCK|FUNCTION|DATA_BLOCK|ORGANIZATION_BLOCK|TYPE))\s+"([^"]+)"/i;
const BLOCK_KIND_RE = /^\s*(FUNCTION_BLOCK|FUNCTION|DATA_BLOCK|ORGANIZATION_BLOCK|TYPE)\b/i;
const FUNCTION_RETURN_RE = /^\s*FUNCTION\s+"[^"]+"\s*:\s*(\S+)/i;

const SECTION_START_RE = /^\s*(VAR_INPUT|VAR_OUTPUT|VAR_IN_OUT|VAR_TEMP|VAR_STATIC|VAR_CONSTANT|VAR)\b/i;
const SECTION_END_RE = /^\s*END_VAR\b/i;

// Variable declaration: name : DataType [:= value] ; // comment
const VAR_DECL_RE = /^\s*(\w+)\s*:\s*([^;:=]+?)(?:\s*:=\s*([^;]+?))?\s*;(?:\s*\/\/\s*(.*))?$/;

// SCL region keywords
const REGION_KEYWORDS = [
    'VAR_INPUT', 'VAR_OUTPUT', 'VAR_IN_OUT', 'VAR_TEMP', 'VAR_STATIC', 'VAR_CONSTANT', 'VAR',
    'BEGIN', 'END_VAR', 'END_FUNCTION_BLOCK', 'END_FUNCTION', 'END_DATA_BLOCK',
    'END_ORGANIZATION_BLOCK', 'END_TYPE',
];

const SECTION_NAME_MAP: Record<string, string> = {
    'VAR_INPUT': 'Input',
    'VAR_OUTPUT': 'Output',
    'VAR_IN_OUT': 'InOut',
    'VAR_TEMP': 'Temp',
    'VAR_STATIC': 'Static',
    'VAR_CONSTANT': 'Constant',
    'VAR': 'Var',
};

export function parseSclDocument(text: string): SclParseResult {
    const lines = text.split(/\r?\n/);
    const variables: SclVariable[] = [];
    const regions: SclRegion[] = [];
    let header: SclBlockHeader | undefined;

    let currentSection: string | null = null;
    let sectionStartLine = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();

        // Skip empty lines and pure comments
        if (!trimmed || trimmed.startsWith('//')) { continue; }

        // Block header
        if (!header) {
            const kindMatch = line.match(BLOCK_KIND_RE);
            const nameMatch = line.match(BLOCK_HEADER_RE);
            if (kindMatch && nameMatch) {
                const kind = kindMatch[1].toUpperCase().replace(/ /g, '_') as SclBlockHeader['kind'];
                header = { kind, name: nameMatch[1], line: i };

                const retMatch = line.match(FUNCTION_RETURN_RE);
                if (retMatch) {
                    header.returnType = retMatch[1].trim();
                }
                continue;
            }
        }

        // Section start (VAR_INPUT, VAR_OUTPUT, etc.)
        const sectionMatch = trimmed.match(SECTION_START_RE);
        if (sectionMatch) {
            const sectionKey = sectionMatch[1].toUpperCase().replace(/ /g, '_');
            currentSection = SECTION_NAME_MAP[sectionKey] || sectionKey;
            sectionStartLine = i;
            regions.push({ kind: sectionKey, startLine: i, endLine: i });
            continue;
        }

        // Section end
        if (SECTION_END_RE.test(trimmed)) {
            if (regions.length > 0) {
                regions[regions.length - 1].endLine = i;
            }
            currentSection = null;
            continue;
        }

        // Variable declaration inside a section
        if (currentSection) {
            const varMatch = line.match(VAR_DECL_RE);
            if (varMatch) {
                variables.push({
                    name: varMatch[1],
                    dataType: varMatch[2].trim(),
                    section: currentSection,
                    line: i,
                    endLine: i,
                    initialValue: varMatch[3]?.trim(),
                    comment: varMatch[4]?.trim(),
                });
            }
        }
    }

    return { header, variables, regions };
}

// ─── STL-specific parser ─────────────────────────────────────────────

export interface StlInstruction {
    opcode: string;
    operand?: string;
    line: number;
    comment?: string;
}

export interface StlParseResult {
    header?: SclBlockHeader;
    variables: SclVariable[];
    regions: SclRegion[];
    instructions: StlInstruction[];
}

const STL_INSTR_RE = /^\s*([=\w+\-*/<>]+)\s*(.*?)(?:\s*\/\/\s*(.*))?$/;

export function parseStlDocument(text: string): StlParseResult {
    // STL shares the same header/variable structure as SCL
    const base = parseSclDocument(text);
    const lines = text.split(/\r?\n/);
    const instructions: StlInstruction[] = [];

    let inCode = false;
    for (let i = 0; i < lines.length; i++) {
        const trimmed = lines[i].trim();

        if (/^\s*BEGIN\b/i.test(trimmed)) { inCode = true; continue; }
        if (/^\s*END_(?:FUNCTION_BLOCK|FUNCTION|DATA_BLOCK|ORGANIZATION_BLOCK)\b/i.test(trimmed)) {
            inCode = false; continue;
        }

        if (inCode && trimmed && !trimmed.startsWith('//')) {
            const m = trimmed.match(STL_INSTR_RE);
            if (m) {
                instructions.push({
                    opcode: m[1],
                    operand: m[2]?.replace(/;$/, '').trim() || undefined,
                    line: i,
                    comment: m[3]?.trim(),
                });
            }
        }
    }

    return { ...base, instructions };
}
