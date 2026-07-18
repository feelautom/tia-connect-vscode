import { describe, expect, it } from 'vitest';
import { isAllowedHttpUrl, renderSafeMarkdown } from '../../src/utils/safeMarkdown';

describe('renderSafeMarkdown', () => {
    it('escapes raw HTML and event attributes', () => {
        const html = renderSafeMarkdown('<img src=x onerror="alert(1)">');
        expect(html).not.toContain('<img');
        expect(html).not.toContain('onerror="');
        expect(html).toContain('&lt;img');
    });

    it.each(['javascript:alert(1)', 'data:text/html,test', 'file:///etc/passwd', 'command:test'])('rejects unsafe URL scheme %s', (url) => {
        const html = renderSafeMarkdown(`[click](${url})`);
        expect(html).not.toContain('<a ');
        expect(html).toContain('click');
    });

    it('allows HTTP links and escapes attribute-breaking quotes', () => {
        const html = renderSafeMarkdown('[safe](https://example.com/?q="x")');
        expect(html).toContain('<a href="https://example.com/?q=&quot;x&quot;">safe</a>');
    });

    it('escapes malicious content inside code fences', () => {
        const html = renderSafeMarkdown('```\n<script>alert(1)</script>\n```');
        expect(html).not.toContain('<script>');
        expect(html).toContain('&lt;script&gt;');
    });
});

describe('isAllowedHttpUrl', () => {
    it('uses protocol semantics without changing the URL text', () => {
        expect(isAllowedHttpUrl('HTTPS://example.com/path')).toBe(true);
        expect(isAllowedHttpUrl(' javascript:alert(1)')).toBe(false);
    });
});
