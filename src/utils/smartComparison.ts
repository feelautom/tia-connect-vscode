/**
 * Smart Comparison — compare TIA Portal block XML with normalized diffing.
 * Strips auto-generated IDs, timestamps, and attribute ordering differences
 * so only meaningful structural/logic changes are flagged.
 */

/** Result of a smart comparison between two block XMLs */
export interface ComparisonResult {
    isEqual: boolean;
    differences: ComparisonDiff[];
}

export interface ComparisonDiff {
    type: 'added' | 'removed' | 'changed';
    path: string;
    localValue?: string;
    remoteValue?: string;
}

// Attributes to strip from XML before comparison (auto-generated, non-functional)
const STRIP_ATTRIBUTES = [
    /\s+ID="[^"]*"/g,
    /\s+UId="[^"]*"/g,
    /\s+InformativeVersion="[^"]*"/g,
];

// Full elements to strip (timestamps, export metadata)
const STRIP_ELEMENTS = [
    /<Created>.*?<\/Created>/g,
    /<Modified>.*?<\/Modified>/g,
    /<DocumentInfo>[\s\S]*?<\/DocumentInfo>/g,
    /<Engineering[^/]*\/>/g,
    /<Engineering[^>]*>[\s\S]*?<\/Engineering>/g,
];

// Whitespace patterns to normalize
const WHITESPACE_PATTERNS = [
    { pattern: />\s+</g, replacement: '><' },
    { pattern: /\r\n/g, replacement: '\n' },
    { pattern: /\t/g, replacement: '' },
    { pattern: /^\s+/gm, replacement: '' },
    { pattern: /\s+$/gm, replacement: '' },
];

/**
 * Normalize a TIA Portal XML string for comparison.
 * Strips IDs, timestamps, export metadata, and normalizes whitespace.
 */
export function normalizeXml(xml: string): string {
    let normalized = xml;

    // Strip auto-generated attributes
    for (const pattern of STRIP_ATTRIBUTES) {
        normalized = normalized.replace(pattern, '');
    }

    // Strip non-functional elements
    for (const pattern of STRIP_ELEMENTS) {
        normalized = normalized.replace(pattern, '');
    }

    // Normalize whitespace
    for (const { pattern, replacement } of WHITESPACE_PATTERNS) {
        normalized = normalized.replace(pattern, replacement);
    }

    // Sort XML attributes within each tag for order-independent comparison
    normalized = sortXmlAttributes(normalized);

    return normalized.trim();
}

/**
 * Sort attributes within XML tags alphabetically.
 * `<Part Name="Contact" UId="25">` and `<Part UId="25" Name="Contact">`
 * become identical after sorting.
 */
export function sortXmlAttributes(xml: string): string {
    return xml.replace(/<(\w+)((?:\s+[\w:]+="[^"]*")+)\s*(\/?)>/g, (_match, tag, attrs, selfClose) => {
        const attrList = (attrs as string).match(/\s+([\w:]+="[^"]*")/g);
        if (!attrList || attrList.length <= 1) return _match;
        const sorted = attrList.map(a => a.trim()).sort().join(' ');
        return `<${tag} ${sorted}${selfClose ? ' /' : ''}>`;
    });
}

/**
 * Extract meaningful sections from a block XML for structured comparison.
 * Returns a map of section name → content.
 */
export function extractSections(xml: string): Map<string, string> {
    const sections = new Map<string, string>();

    // Interface section
    const ifaceMatch = xml.match(/<Interface>([\s\S]*?)<\/Interface>/);
    if (ifaceMatch) sections.set('Interface', normalizeXml(ifaceMatch[1]));

    // Network sources (compile units)
    const networkRegex = /<(?:FlgNet|NetworkSource|StatementList|StructuredText)[^>]*>([\s\S]*?)<\/(?:FlgNet|NetworkSource|StatementList|StructuredText)>/g;
    let networkIdx = 0;
    let match;
    while ((match = networkRegex.exec(xml)) !== null) {
        sections.set(`Network_${++networkIdx}`, normalizeXml(match[1]));
    }

    // Block attributes (Name, Number, Language, etc.)
    const attrMatch = xml.match(/<AttributeList>([\s\S]*?)<\/AttributeList>/);
    if (attrMatch) {
        // Strip volatile attributes
        let attrs = attrMatch[1];
        attrs = attrs.replace(/<MemoryReserve>.*?<\/MemoryReserve>/g, '');
        attrs = attrs.replace(/<HeaderVersion>.*?<\/HeaderVersion>/g, '');
        sections.set('Attributes', normalizeXml(attrs));
    }

    return sections;
}

/**
 * Compare two block XMLs and return a structured diff.
 * For Instance DBs, focuses on StartValues only.
 */
export function compareBlocks(localXml: string, remoteXml: string): ComparisonResult {
    const differences: ComparisonDiff[] = [];

    // Quick check: are they identical after normalization?
    const normLocal = normalizeXml(localXml);
    const normRemote = normalizeXml(remoteXml);

    if (normLocal === normRemote) {
        return { isEqual: true, differences: [] };
    }

    // Structured comparison by section
    const localSections = extractSections(localXml);
    const remoteSections = extractSections(remoteXml);

    // Check for sections only in local
    for (const [name, value] of localSections) {
        const remoteValue = remoteSections.get(name);
        if (!remoteValue) {
            differences.push({ type: 'added', path: name, localValue: value });
        } else if (value !== remoteValue) {
            differences.push({ type: 'changed', path: name, localValue: value, remoteValue });
        }
    }

    // Check for sections only in remote
    for (const [name, value] of remoteSections) {
        if (!localSections.has(name)) {
            differences.push({ type: 'removed', path: name, remoteValue: value });
        }
    }

    return { isEqual: differences.length === 0, differences };
}

/**
 * Check if an XML represents an Instance DB (for special handling).
 * Instance DBs should only compare StartValues, not generated structure.
 */
export function isInstanceDb(xml: string): boolean {
    return /<SW\.Blocks\.InstanceDB/i.test(xml) ||
           /<BlockType>InstanceDB<\/BlockType>/i.test(xml);
}

/**
 * Extract StartValues from an Instance DB XML for comparison.
 */
export function extractStartValues(xml: string): Map<string, string> {
    const values = new Map<string, string>();
    const regex = /<StartValue>([\s\S]*?)<\/StartValue>/g;
    let match;
    let idx = 0;
    while ((match = regex.exec(xml)) !== null) {
        values.set(`StartValue_${++idx}`, match[1].trim());
    }
    return values;
}
