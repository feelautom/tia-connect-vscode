/**
 * Dependency-aware import ordering.
 * Analyzes cross-references to build a dependency graph and determine
 * the correct import order: UDT → FB → FC → OB → DB.
 */

import { CrossReferenceResult, CrossReferenceSource } from '../api/types';

/** A block with its resolved dependencies */
export interface BlockDependency {
    name: string;
    type: string;
    dependsOn: string[];
}

/** Priority order for block types (lower = import first) */
const TYPE_PRIORITY: Record<string, number> = {
    'UDT': 0,
    'FB': 1,
    'FC': 2,
    'OB': 3,
    'DB': 4,
    'InstanceDB': 5,
};

/**
 * Extract dependencies from cross-reference data.
 * A block "depends on" another block if it calls or references it.
 */
export function extractDependencies(
    blockName: string,
    blockType: string,
    crossRefs: CrossReferenceResult,
): BlockDependency {
    const dependsOn = new Set<string>();

    // The block references other blocks through its Sources
    if (crossRefs.Sources) {
        for (const source of crossRefs.Sources) {
            if (source.ReferenceObjects) {
                for (const ref of source.ReferenceObjects) {
                    // Only track block-type dependencies (not tag references)
                    if (ref.TypeName && isBlockType(ref.TypeName) && ref.Name !== blockName) {
                        dependsOn.add(ref.Name);
                    }
                }
            }
        }
    }

    return {
        name: blockName,
        type: blockType,
        dependsOn: [...dependsOn],
    };
}

/**
 * Build a dependency graph from a list of block dependencies.
 * Returns an adjacency list: blockName → set of blocks it depends on.
 */
export function buildDependencyGraph(
    blocks: BlockDependency[],
): Map<string, Set<string>> {
    const graph = new Map<string, Set<string>>();
    const knownBlocks = new Set(blocks.map(b => b.name));

    for (const block of blocks) {
        // Only include dependencies that are in our block list
        const deps = new Set(block.dependsOn.filter(d => knownBlocks.has(d)));
        graph.set(block.name, deps);
    }

    return graph;
}

/**
 * Topological sort using Kahn's algorithm.
 * Returns blocks in dependency order (dependencies first).
 * Falls back to type-priority ordering if cycles are detected.
 */
export function topologicalSort(blocks: BlockDependency[]): string[] {
    const graph = buildDependencyGraph(blocks);
    const blockMap = new Map(blocks.map(b => [b.name, b]));

    const typePriorityCmp = (a: string, b: string) => {
        const ta = blockMap.get(a)?.type || '';
        const tb = blockMap.get(b)?.type || '';
        return (TYPE_PRIORITY[ta] ?? 99) - (TYPE_PRIORITY[tb] ?? 99);
    };

    // In-degree = number of dependencies a block has (must be imported AFTER them)
    // A block with 0 dependencies can be imported first.
    const inDegree = new Map<string, number>();
    for (const block of blocks) {
        const deps = graph.get(block.name);
        inDegree.set(block.name, deps ? deps.size : 0);
    }

    // Build reverse graph: dependency → set of blocks that depend on it
    const dependents = new Map<string, Set<string>>();
    for (const block of blocks) {
        dependents.set(block.name, new Set());
    }
    for (const [name, deps] of graph) {
        for (const dep of deps) {
            dependents.get(dep)?.add(name);
        }
    }

    // Start with blocks that have no dependencies
    const queue: string[] = [];
    for (const [name, degree] of inDegree) {
        if (degree === 0) queue.push(name);
    }
    queue.sort(typePriorityCmp);

    const sorted: string[] = [];
    const visited = new Set<string>();

    while (queue.length > 0) {
        const current = queue.shift()!;
        if (visited.has(current)) continue;
        visited.add(current);
        sorted.push(current);

        // Reduce in-degree for blocks that depend on current
        const deps = dependents.get(current);
        if (deps) {
            for (const dependent of deps) {
                const newDegree = (inDegree.get(dependent) || 1) - 1;
                inDegree.set(dependent, newDegree);
                if (newDegree === 0 && !visited.has(dependent)) {
                    queue.push(dependent);
                    queue.sort(typePriorityCmp);
                }
            }
        }
    }

    // Handle cycles: add remaining blocks sorted by type priority
    if (sorted.length < blocks.length) {
        const remaining = blocks
            .filter(b => !visited.has(b.name))
            .sort((a, b) => (TYPE_PRIORITY[a.type] ?? 99) - (TYPE_PRIORITY[b.type] ?? 99));
        for (const block of remaining) {
            sorted.push(block.name);
        }
    }

    return sorted;
}

/**
 * Sort blocks by type priority only (no cross-reference analysis needed).
 * Simple fallback when cross-references are not available.
 */
export function sortByTypePriority(
    blocks: { name: string; type: string }[],
): string[] {
    return [...blocks]
        .sort((a, b) => (TYPE_PRIORITY[a.type] ?? 99) - (TYPE_PRIORITY[b.type] ?? 99))
        .map(b => b.name);
}

/**
 * Detect circular dependencies in the graph.
 * Returns arrays of block names forming cycles.
 */
export function detectCycles(blocks: BlockDependency[]): string[][] {
    const graph = buildDependencyGraph(blocks);
    const cycles: string[][] = [];
    const visited = new Set<string>();
    const inStack = new Set<string>();

    function dfs(node: string, path: string[]): void {
        if (inStack.has(node)) {
            // Found a cycle
            const cycleStart = path.indexOf(node);
            cycles.push(path.slice(cycleStart));
            return;
        }
        if (visited.has(node)) return;

        visited.add(node);
        inStack.add(node);
        path.push(node);

        const deps = graph.get(node);
        if (deps) {
            for (const dep of deps) {
                dfs(dep, [...path]);
            }
        }

        inStack.delete(node);
    }

    for (const block of blocks) {
        if (!visited.has(block.name)) {
            dfs(block.name, []);
        }
    }

    return cycles;
}

function isBlockType(typeName: string): boolean {
    const t = typeName.toUpperCase();
    return ['FB', 'FC', 'OB', 'DB', 'UDT', 'INSTANCEDB'].includes(t);
}
