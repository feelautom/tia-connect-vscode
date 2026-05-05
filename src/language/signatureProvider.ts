import * as vscode from 'vscode';
import { SCL_FUNCTIONS } from './sclKeywords';

interface FunctionSignature {
    label: string;
    documentation: string;
    parameters: { label: string; documentation: string }[];
}

// Parse function signatures from the documentation strings in sclKeywords
const SIGNATURES: Map<string, FunctionSignature> = new Map();

function initSignatures(): void {
    if (SIGNATURES.size > 0) { return; }

    // Built-in functions with named parameters
    const defs: Record<string, { doc: string; params: { label: string; doc: string }[] }> = {
        'ABS': { doc: 'Returns the absolute value', params: [{ label: 'value', doc: 'Input value' }] },
        'SQR': { doc: 'Returns the square of a value', params: [{ label: 'value', doc: 'Input value' }] },
        'SQRT': { doc: 'Returns the square root', params: [{ label: 'value', doc: 'Input value (must be >= 0)' }] },
        'LN': { doc: 'Returns the natural logarithm', params: [{ label: 'value', doc: 'Input value (must be > 0)' }] },
        'EXP': { doc: 'Returns e^value', params: [{ label: 'value', doc: 'Exponent value' }] },
        'SIN': { doc: 'Returns the sine', params: [{ label: 'angle', doc: 'Angle in radians (Real)' }] },
        'COS': { doc: 'Returns the cosine', params: [{ label: 'angle', doc: 'Angle in radians (Real)' }] },
        'TAN': { doc: 'Returns the tangent', params: [{ label: 'angle', doc: 'Angle in radians (Real)' }] },
        'ASIN': { doc: 'Returns the arc sine', params: [{ label: 'value', doc: 'Value between -1 and 1' }] },
        'ACOS': { doc: 'Returns the arc cosine', params: [{ label: 'value', doc: 'Value between -1 and 1' }] },
        'ATAN': { doc: 'Returns the arc tangent', params: [{ label: 'value', doc: 'Input value' }] },
        'LEN': { doc: 'Returns the current length of a string', params: [{ label: 's', doc: 'Input string' }] },
        'MIN': { doc: 'Returns the smaller of two values', params: [{ label: 'IN1 := a', doc: 'First value' }, { label: 'IN2 := b', doc: 'Second value' }] },
        'MAX': { doc: 'Returns the larger of two values', params: [{ label: 'IN1 := a', doc: 'First value' }, { label: 'IN2 := b', doc: 'Second value' }] },
        'LIMIT': { doc: 'Clamps value between min and max', params: [{ label: 'MN := min', doc: 'Minimum bound' }, { label: 'IN := value', doc: 'Value to clamp' }, { label: 'MX := max', doc: 'Maximum bound' }] },
        'SHL': { doc: 'Shift left', params: [{ label: 'IN := value', doc: 'Value to shift' }, { label: 'N := bits', doc: 'Number of bits to shift' }] },
        'SHR': { doc: 'Shift right', params: [{ label: 'IN := value', doc: 'Value to shift' }, { label: 'N := bits', doc: 'Number of bits to shift' }] },
        'ROL': { doc: 'Rotate left', params: [{ label: 'IN := value', doc: 'Value to rotate' }, { label: 'N := bits', doc: 'Number of bits to rotate' }] },
        'ROR': { doc: 'Rotate right', params: [{ label: 'IN := value', doc: 'Value to rotate' }, { label: 'N := bits', doc: 'Number of bits to rotate' }] },
        'CONCAT': { doc: 'Concatenates two strings', params: [{ label: 'IN1 := s1', doc: 'First string' }, { label: 'IN2 := s2', doc: 'Second string' }] },
        'LEFT': { doc: 'Returns leftmost characters', params: [{ label: 'IN := s', doc: 'Input string' }, { label: 'L := count', doc: 'Number of characters' }] },
        'RIGHT': { doc: 'Returns rightmost characters', params: [{ label: 'IN := s', doc: 'Input string' }, { label: 'L := count', doc: 'Number of characters' }] },
        'MID': { doc: 'Returns a substring', params: [{ label: 'IN := s', doc: 'Input string' }, { label: 'L := count', doc: 'Number of characters' }, { label: 'P := start', doc: 'Start position (1-based)' }] },
        'FIND': { doc: 'Finds a substring', params: [{ label: 'IN1 := haystack', doc: 'String to search in' }, { label: 'IN2 := needle', doc: 'String to find' }] },
        'REPLACE': { doc: 'Replaces part of a string', params: [{ label: 'IN1 := s', doc: 'Original string' }, { label: 'IN2 := new', doc: 'Replacement string' }, { label: 'L := count', doc: 'Characters to replace' }, { label: 'P := start', doc: 'Start position (1-based)' }] },
        'INT_TO_REAL': { doc: 'Converts Int to Real', params: [{ label: 'value', doc: 'Int value to convert' }] },
        'REAL_TO_INT': { doc: 'Converts Real to Int (truncates)', params: [{ label: 'value', doc: 'Real value to convert' }] },
        'BOOL_TO_INT': { doc: 'Converts Bool to Int', params: [{ label: 'value', doc: 'Bool value (FALSE=0, TRUE=1)' }] },
        'INT_TO_DINT': { doc: 'Widens Int to DInt', params: [{ label: 'value', doc: 'Int value to widen' }] },
        'DINT_TO_INT': { doc: 'Narrows DInt to Int', params: [{ label: 'value', doc: 'DInt value to narrow' }] },
        'DINT_TO_REAL': { doc: 'Converts DInt to Real', params: [{ label: 'value', doc: 'DInt value to convert' }] },
    };

    for (const [name, def] of Object.entries(defs)) {
        const paramLabels = def.params.map(p => p.label).join(', ');
        SIGNATURES.set(name.toUpperCase(), {
            label: `${name}(${paramLabels})`,
            documentation: def.doc,
            parameters: def.params.map(p => ({ label: p.label, documentation: p.doc })),
        });
    }
}

export class SclSignatureHelpProvider implements vscode.SignatureHelpProvider {
    provideSignatureHelp(
        document: vscode.TextDocument,
        position: vscode.Position,
    ): vscode.SignatureHelp | undefined {
        initSignatures();

        const lineText = document.lineAt(position.line).text;
        const textBefore = lineText.substring(0, position.character);

        // Find the function name before the opening parenthesis
        // Handle nested parens by counting depth
        let depth = 0;
        let funcEnd = -1;
        let activeParam = 0;

        for (let i = textBefore.length - 1; i >= 0; i--) {
            const ch = textBefore[i];
            if (ch === ')') { depth++; }
            else if (ch === '(') {
                if (depth === 0) {
                    funcEnd = i;
                    break;
                }
                depth--;
            }
        }

        if (funcEnd < 0) { return undefined; }

        // Count commas between funcEnd and cursor to determine active parameter
        const insideParens = textBefore.substring(funcEnd + 1);
        activeParam = 0;
        let parenDepth = 0;
        for (const ch of insideParens) {
            if (ch === '(') { parenDepth++; }
            else if (ch === ')') { parenDepth--; }
            else if (ch === ',' && parenDepth === 0) { activeParam++; }
        }

        // Extract function name
        const beforeParen = textBefore.substring(0, funcEnd).trimEnd();
        const funcNameMatch = beforeParen.match(/(\w+)\s*$/);
        if (!funcNameMatch) { return undefined; }

        const funcName = funcNameMatch[1].toUpperCase();
        const sig = SIGNATURES.get(funcName);
        if (!sig) { return undefined; }

        const signatureInfo = new vscode.SignatureInformation(sig.label, sig.documentation);
        signatureInfo.parameters = sig.parameters.map(
            p => new vscode.ParameterInformation(p.label, p.documentation)
        );

        const help = new vscode.SignatureHelp();
        help.signatures = [signatureInfo];
        help.activeSignature = 0;
        help.activeParameter = Math.min(activeParam, sig.parameters.length - 1);

        return help;
    }
}
