/** Escape HTML special characters to prevent XSS */
export function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Map a PLC data type to a CSS class for colored type chips */
export function getPlcTypeClass(dataType: string): string {
    if (!dataType) { return ''; }
    const dt = dataType.toUpperCase();
    if (dt === 'BOOL') { return 'type-bool'; }
    if (dt === 'INT' || dt === 'DINT' || dt === 'SINT' || dt === 'UINT' || dt === 'UDINT' || dt === 'USINT' || dt === 'LINT' || dt === 'ULINT') { return 'type-int'; }
    if (dt === 'REAL' || dt === 'LREAL') { return 'type-real'; }
    if (dt === 'WORD' || dt === 'DWORD' || dt === 'BYTE' || dt === 'LWORD') { return 'type-word'; }
    if (dt === 'STRING' || dt === 'WSTRING') { return 'type-string'; }
    if (dt === 'TIME' || dt === 'LTIME' || dt === 'DATE' || dt === 'TOD' || dt === 'DT' || dt === 'DTL') { return 'type-time'; }
    return 'type-other';
}

/** Extract block name from SCL source header */
export function extractBlockNameFromSource(source: string): string | undefined {
    const match = source.match(/^\s*(?:FUNCTION_BLOCK|FUNCTION|DATA_BLOCK|ORGANIZATION_BLOCK)\s+"([^"]+)"/im);
    return match?.[1];
}

/** Sanitize a filename by removing special characters */
export function sanitizeFileName(name: string): string {
    return name.replace(/[^a-zA-Z0-9_-]/g, '_');
}
