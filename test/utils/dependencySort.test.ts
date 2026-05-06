import { describe, it, expect } from 'vitest';
import {
    extractDependencies,
    buildDependencyGraph,
    topologicalSort,
    sortByTypePriority,
    detectCycles,
    BlockDependency,
} from '../../src/utils/dependencySort';
import { CrossReferenceResult } from '../../src/api/types';

describe('extractDependencies', () => {
    it('extracts block dependencies from cross-references', () => {
        const crossRefs: CrossReferenceResult = {
            BlockName: 'Main',
            SourceCount: 1,
            TotalReferenceCount: 2,
            Sources: [
                {
                    Name: 'Main',
                    TypeName: 'OB',
                    Address: '',
                    Device: 'PLC_1',
                    Path: '',
                    ReferenceObjects: [
                        { Name: 'FB_Motor', TypeName: 'FB', Address: '', Device: 'PLC_1', Path: '', Locations: [] },
                        { Name: 'FC_Calc', TypeName: 'FC', Address: '', Device: 'PLC_1', Path: '', Locations: [] },
                    ],
                },
            ],
        };

        const dep = extractDependencies('Main', 'OB', crossRefs);
        expect(dep.name).toBe('Main');
        expect(dep.type).toBe('OB');
        expect(dep.dependsOn).toContain('FB_Motor');
        expect(dep.dependsOn).toContain('FC_Calc');
    });

    it('excludes self-references', () => {
        const crossRefs: CrossReferenceResult = {
            BlockName: 'FB_Motor',
            SourceCount: 1,
            TotalReferenceCount: 1,
            Sources: [
                {
                    Name: 'FB_Motor',
                    TypeName: 'FB',
                    Address: '',
                    Device: 'PLC_1',
                    Path: '',
                    ReferenceObjects: [
                        { Name: 'FB_Motor', TypeName: 'FB', Address: '', Device: 'PLC_1', Path: '', Locations: [] },
                    ],
                },
            ],
        };

        const dep = extractDependencies('FB_Motor', 'FB', crossRefs);
        expect(dep.dependsOn).not.toContain('FB_Motor');
    });

    it('handles empty cross-references', () => {
        const crossRefs: CrossReferenceResult = {
            BlockName: 'FC_Simple',
            SourceCount: 0,
            TotalReferenceCount: 0,
            Sources: [],
        };

        const dep = extractDependencies('FC_Simple', 'FC', crossRefs);
        expect(dep.dependsOn).toHaveLength(0);
    });
});

describe('buildDependencyGraph', () => {
    it('builds graph from block dependencies', () => {
        const blocks: BlockDependency[] = [
            { name: 'Main', type: 'OB', dependsOn: ['FB_Motor'] },
            { name: 'FB_Motor', type: 'FB', dependsOn: [] },
        ];

        const graph = buildDependencyGraph(blocks);
        expect(graph.get('Main')?.has('FB_Motor')).toBe(true);
        expect(graph.get('FB_Motor')?.size).toBe(0);
    });

    it('filters dependencies to known blocks only', () => {
        const blocks: BlockDependency[] = [
            { name: 'Main', type: 'OB', dependsOn: ['FB_Motor', 'UnknownBlock'] },
        ];

        const graph = buildDependencyGraph(blocks);
        expect(graph.get('Main')?.has('FB_Motor')).toBe(false); // FB_Motor not in blocks list
        expect(graph.get('Main')?.has('UnknownBlock')).toBe(false);
    });
});

describe('topologicalSort', () => {
    it('sorts simple dependency chain', () => {
        const blocks: BlockDependency[] = [
            { name: 'Main', type: 'OB', dependsOn: ['FB_Motor'] },
            { name: 'FB_Motor', type: 'FB', dependsOn: ['FC_Calc'] },
            { name: 'FC_Calc', type: 'FC', dependsOn: [] },
        ];

        const sorted = topologicalSort(blocks);
        expect(sorted.indexOf('FC_Calc')).toBeLessThan(sorted.indexOf('FB_Motor'));
        expect(sorted.indexOf('FB_Motor')).toBeLessThan(sorted.indexOf('Main'));
    });

    it('sorts by type priority when no dependencies', () => {
        const blocks: BlockDependency[] = [
            { name: 'Main', type: 'OB', dependsOn: [] },
            { name: 'FB_Motor', type: 'FB', dependsOn: [] },
            { name: 'UDT_Motor', type: 'UDT', dependsOn: [] },
            { name: 'FC_Calc', type: 'FC', dependsOn: [] },
            { name: 'DB_Config', type: 'DB', dependsOn: [] },
        ];

        const sorted = topologicalSort(blocks);
        expect(sorted.indexOf('UDT_Motor')).toBeLessThan(sorted.indexOf('FB_Motor'));
        expect(sorted.indexOf('FB_Motor')).toBeLessThan(sorted.indexOf('FC_Calc'));
        expect(sorted.indexOf('FC_Calc')).toBeLessThan(sorted.indexOf('Main'));
        expect(sorted.indexOf('Main')).toBeLessThan(sorted.indexOf('DB_Config'));
    });

    it('handles circular dependencies gracefully', () => {
        const blocks: BlockDependency[] = [
            { name: 'A', type: 'FB', dependsOn: ['B'] },
            { name: 'B', type: 'FB', dependsOn: ['A'] },
            { name: 'C', type: 'FC', dependsOn: [] },
        ];

        const sorted = topologicalSort(blocks);
        // Should still return all blocks
        expect(sorted).toHaveLength(3);
        expect(sorted).toContain('A');
        expect(sorted).toContain('B');
        expect(sorted).toContain('C');
    });

    it('handles diamond dependencies', () => {
        //      Main
        //      /  \
        //   FB_A  FB_B
        //      \  /
        //      FC_C
        const blocks: BlockDependency[] = [
            { name: 'Main', type: 'OB', dependsOn: ['FB_A', 'FB_B'] },
            { name: 'FB_A', type: 'FB', dependsOn: ['FC_C'] },
            { name: 'FB_B', type: 'FB', dependsOn: ['FC_C'] },
            { name: 'FC_C', type: 'FC', dependsOn: [] },
        ];

        const sorted = topologicalSort(blocks);
        expect(sorted.indexOf('FC_C')).toBeLessThan(sorted.indexOf('FB_A'));
        expect(sorted.indexOf('FC_C')).toBeLessThan(sorted.indexOf('FB_B'));
        expect(sorted.indexOf('FB_A')).toBeLessThan(sorted.indexOf('Main'));
        expect(sorted.indexOf('FB_B')).toBeLessThan(sorted.indexOf('Main'));
    });

    it('returns all blocks even with empty input', () => {
        const sorted = topologicalSort([]);
        expect(sorted).toHaveLength(0);
    });
});

describe('sortByTypePriority', () => {
    it('sorts UDT first, then FB, FC, OB, DB', () => {
        const blocks = [
            { name: 'DB1', type: 'DB' },
            { name: 'OB1', type: 'OB' },
            { name: 'FB1', type: 'FB' },
            { name: 'UDT1', type: 'UDT' },
            { name: 'FC1', type: 'FC' },
        ];

        const sorted = sortByTypePriority(blocks);
        expect(sorted).toEqual(['UDT1', 'FB1', 'FC1', 'OB1', 'DB1']);
    });

    it('handles unknown types', () => {
        const blocks = [
            { name: 'X', type: 'Unknown' },
            { name: 'UDT1', type: 'UDT' },
        ];

        const sorted = sortByTypePriority(blocks);
        expect(sorted[0]).toBe('UDT1');
    });
});

describe('detectCycles', () => {
    it('detects simple cycle', () => {
        const blocks: BlockDependency[] = [
            { name: 'A', type: 'FB', dependsOn: ['B'] },
            { name: 'B', type: 'FB', dependsOn: ['A'] },
        ];

        const cycles = detectCycles(blocks);
        expect(cycles.length).toBeGreaterThan(0);
    });

    it('returns empty for acyclic graph', () => {
        const blocks: BlockDependency[] = [
            { name: 'A', type: 'FB', dependsOn: ['B'] },
            { name: 'B', type: 'FC', dependsOn: [] },
        ];

        const cycles = detectCycles(blocks);
        expect(cycles).toHaveLength(0);
    });

    it('detects longer cycles', () => {
        const blocks: BlockDependency[] = [
            { name: 'A', type: 'FB', dependsOn: ['B'] },
            { name: 'B', type: 'FB', dependsOn: ['C'] },
            { name: 'C', type: 'FB', dependsOn: ['A'] },
        ];

        const cycles = detectCycles(blocks);
        expect(cycles.length).toBeGreaterThan(0);
    });
});
