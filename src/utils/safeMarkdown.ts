const LINK_PATTERN = /\[([^\]]+)]\(([^)]+)\)/g;

export function escapeHtml(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function isAllowedHttpUrl(value: string): boolean {
    try {
        const parsed = new URL(value);
        return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch {
        return false;
    }
}

function renderTextFormatting(value: string): string {
    return escapeHtml(value)
        .replace(/`([^`]+)`/g, '<code>$1</code>')
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/\*([^*]+)\*/g, '<em>$1</em>');
}

function renderInline(value: string): string {
    let result = '';
    let cursor = 0;
    LINK_PATTERN.lastIndex = 0;
    for (const match of value.matchAll(LINK_PATTERN)) {
        const index = match.index ?? 0;
        result += renderTextFormatting(value.slice(cursor, index));
        const label = renderTextFormatting(match[1]);
        const url = match[2];
        result += isAllowedHttpUrl(url)
            ? `<a href="${escapeHtml(url)}">${label}</a>`
            : label;
        cursor = index + match[0].length;
    }
    return result + renderTextFormatting(value.slice(cursor));
}

/** Minimal Markdown renderer whose output contains only a fixed HTML allowlist. */
export function renderSafeMarkdown(value: string): string {
    const lines = value.split(/\r?\n/);
    const output: string[] = [];
    let inCode = false;
    let codeLines: string[] = [];

    for (const line of lines) {
        if (line.trimStart().startsWith('```')) {
            if (inCode) {
                output.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
                codeLines = [];
            }
            inCode = !inCode;
            continue;
        }
        if (inCode) {
            codeLines.push(line);
            continue;
        }

        const heading = /^(#{1,4})\s+(.+)$/.exec(line);
        if (heading) {
            const level = heading[1].length;
            output.push(`<h${level}>${renderInline(heading[2])}</h${level}>`);
        } else if (/^\s*[-*]\s+/.test(line)) {
            output.push(`<p>• ${renderInline(line.replace(/^\s*[-*]\s+/, ''))}</p>`);
        } else if (line === '') {
            output.push('<br>');
        } else {
            output.push(`<p>${renderInline(line)}</p>`);
        }
    }

    if (inCode) {
        output.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
    }
    return output.join('');
}
