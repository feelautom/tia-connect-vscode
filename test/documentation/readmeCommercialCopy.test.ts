import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const readme = readFileSync(resolve(process.cwd(), 'README.md'), 'utf8');

describe('Marketplace README commercial copy', () => {
    it('states the paid account journey and qualified MCP catalog', () => {
        expect(readme).toContain('create an account, then choose a paid plan');
        expect(readme).toContain('hundreds of **Model Context Protocol** (MCP) tools');
        expect(readme).toContain('exact catalog depending on licensed features');
        expect(readme).toContain('A paid T-IA Connect license is required for the server.');
    });

    it('does not reintroduce the obsolete free-trial or tool-count claims', () => {
        expect(readme).not.toContain('create one for free');
        expect(readme).not.toContain('100+ Tools');
        expect(readme).not.toContain('100+ tools');
        expect(readme).not.toContain('393 Tools');
        expect(readme).not.toContain('393 tools');
        expect(readme).not.toContain('free trial available');
    });
});
