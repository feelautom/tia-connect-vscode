import { describe, it, expect } from 'vitest';
import { findOrphans, findStaleVcsEntries, OrphanItem } from '../../src/commands/orphanCleanup';
import { VcsFileChange } from '../../src/api/types';

describe('findOrphans', () => {
    it('detects blocks in TIA but not in VCS export', () => {
        const tiaBlocks = ['FB_Motor', 'FC_Calc', 'Main', 'FB_Old'];
        const vcsBlocks = ['FB_Motor', 'FC_Calc', 'Main'];

        const orphans = findOrphans(tiaBlocks, vcsBlocks);
        expect(orphans).toHaveLength(1);
        expect(orphans[0].name).toBe('FB_Old');
    });

    it('returns empty when all blocks are exported', () => {
        const blocks = ['FB_Motor', 'FC_Calc'];
        const orphans = findOrphans(blocks, blocks);
        expect(orphans).toHaveLength(0);
    });

    it('is case-insensitive', () => {
        const tiaBlocks = ['FB_Motor'];
        const vcsBlocks = ['fb_motor'];

        const orphans = findOrphans(tiaBlocks, vcsBlocks);
        expect(orphans).toHaveLength(0);
    });

    it('handles empty inputs', () => {
        expect(findOrphans([], [])).toHaveLength(0);
        expect(findOrphans(['A'], [])).toHaveLength(1);
        expect(findOrphans([], ['A'])).toHaveLength(0);
    });

    it('detects multiple orphans', () => {
        const tiaBlocks = ['A', 'B', 'C', 'D'];
        const vcsBlocks = ['B'];

        const orphans = findOrphans(tiaBlocks, vcsBlocks);
        expect(orphans).toHaveLength(3);
        expect(orphans.map(o => o.name)).toEqual(['A', 'C', 'D']);
    });
});

describe('findStaleVcsEntries', () => {
    it('finds Removed entries', () => {
        const changes: VcsFileChange[] = [
            { FilePath: 'blocks/FB_Old.xml', Status: 'Removed', Domain: 'Blocks', DeviceName: 'PLC_1', ItemName: 'FB_Old' },
            { FilePath: 'blocks/FB_Motor.xml', Status: 'Modified', Domain: 'Blocks', DeviceName: 'PLC_1', ItemName: 'FB_Motor' },
        ];

        const stale = findStaleVcsEntries(changes);
        expect(stale).toHaveLength(1);
        expect(stale[0].name).toBe('FB_Old');
        expect(stale[0].deviceName).toBe('PLC_1');
    });

    it('finds Deleted entries', () => {
        const changes: VcsFileChange[] = [
            { FilePath: 'tags/Table1.csv', Status: 'Deleted', Domain: 'Tags', DeviceName: 'PLC_1', ItemName: 'Table1' },
        ];

        const stale = findStaleVcsEntries(changes);
        expect(stale).toHaveLength(1);
        expect(stale[0].name).toBe('Table1');
        expect(stale[0].domain).toBe('Tags');
    });

    it('ignores Added and Modified entries', () => {
        const changes: VcsFileChange[] = [
            { FilePath: 'blocks/New.xml', Status: 'Added', Domain: 'Blocks', DeviceName: 'PLC_1', ItemName: 'New' },
            { FilePath: 'blocks/Mod.xml', Status: 'Modified', Domain: 'Blocks', DeviceName: 'PLC_1', ItemName: 'Mod' },
        ];

        const stale = findStaleVcsEntries(changes);
        expect(stale).toHaveLength(0);
    });

    it('handles empty changes', () => {
        const stale = findStaleVcsEntries([]);
        expect(stale).toHaveLength(0);
    });

    it('uses ItemName, falls back to FilePath', () => {
        const changes: VcsFileChange[] = [
            { FilePath: 'blocks/test.xml', Status: 'Removed', Domain: 'Blocks', DeviceName: 'PLC_1', ItemName: '' },
        ];

        const stale = findStaleVcsEntries(changes);
        expect(stale[0].name).toBe('blocks/test.xml');
    });
});
