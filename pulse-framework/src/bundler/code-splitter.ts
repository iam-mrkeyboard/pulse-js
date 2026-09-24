// ============================================================================
// FILE: src/bundler/bundler/code-splitter.ts
// Intelligent code splitting and island detection
// ============================================================================

import type { DependencyGraph, ComponentNode } from './types';

export class CodeSplitter {
  split(graph: DependencyGraph): Map<string, Set<string>> {
    const bundles = new Map<string, Set<string>>();

    // Each island gets its own bundle
    for (const islandPath of graph.islands) {
      const bundle = new Set<string>();
      bundle.add(islandPath);

      // Add dependencies
      const deps = this.collectDependencies(islandPath, graph);
      deps.forEach((dep) => bundle.add(dep));

      const node = graph.nodes.get(islandPath)!;
      bundles.set(node.id, bundle);
    }

    return bundles;
  }

  private collectDependencies(
    nodePath: string,
    graph: DependencyGraph,
  ): Set<string> {
    const collected = new Set<string>();
    const visited = new Set<string>();

    const collect = (path: string) => {
      if (visited.has(path)) return;
      visited.add(path);

      const deps = graph.edges.get(path);
      if (deps) {
        deps.forEach((dep: string) => {
          collected.add(dep);
          collect(dep);
        });
      }
    };

    collect(nodePath);
    return collected;
  }

  shouldBundle(node: ComponentNode): boolean {
    // Don't bundle if:
    // 1. Too small (< 500 bytes)
    // 2. Used by multiple islands (shared dependency)
    // 3. Is a primitive

    return node.size.original > 500;
  }
}
