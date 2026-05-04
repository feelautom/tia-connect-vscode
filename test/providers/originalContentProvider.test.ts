import { describe, it, expect } from 'vitest';
import { OriginalContentProvider } from '../../src/providers/originalContentProvider';
import { Uri } from 'vscode';

describe('OriginalContentProvider', () => {
    it('stores and retrieves original content', () => {
        const provider = new OriginalContentProvider();
        provider.setOriginal('/tmp/test.scl', 'original code');

        const uri = Uri.from({ scheme: 'tia-original', path: '/tmp/test.scl' });
        expect(provider.provideTextDocumentContent(uri)).toBe('original code');
    });

    it('returns empty string for unknown paths', () => {
        const provider = new OriginalContentProvider();
        const uri = Uri.from({ scheme: 'tia-original', path: '/tmp/unknown.scl' });
        expect(provider.provideTextDocumentContent(uri)).toBe('');
    });

    it('hasOriginal returns true for stored paths', () => {
        const provider = new OriginalContentProvider();
        provider.setOriginal('/tmp/test.scl', 'code');
        expect(provider.hasOriginal('/tmp/test.scl')).toBe(true);
        expect(provider.hasOriginal('/tmp/other.scl')).toBe(false);
    });

    it('clearOriginal removes stored content', () => {
        const provider = new OriginalContentProvider();
        provider.setOriginal('/tmp/test.scl', 'code');
        provider.clearOriginal('/tmp/test.scl');
        expect(provider.hasOriginal('/tmp/test.scl')).toBe(false);
    });

    it('overwrites content when set again', () => {
        const provider = new OriginalContentProvider();
        provider.setOriginal('/tmp/test.scl', 'v1');
        provider.setOriginal('/tmp/test.scl', 'v2');

        const uri = Uri.from({ scheme: 'tia-original', path: '/tmp/test.scl' });
        expect(provider.provideTextDocumentContent(uri)).toBe('v2');
    });

    it('toOriginalUri creates correct URI', () => {
        const uri = OriginalContentProvider.toOriginalUri('/tmp/test.scl');
        expect(uri.scheme).toBe('tia-original');
        expect(uri.path).toBe('/tmp/test.scl');
    });
});
