// ============================================================================
// FILE: src/server/module-graph.ts - NEW FILE
// Tracks module dependencies for smart HMR
// ============================================================================

export interface ModuleNode {
  id: string;
  file: string;
  type: 'page' | 'component' | 'style' | 'script';
  dependencies: Set<string>;
  dependents: Set<string>;
  lastModified: number;
  compiled?: string;
  hash: string;
}

export class ModuleGraph {
  private modules = new Map<string, ModuleNode>();

  addModule(file: string, type: ModuleNode['type']): ModuleNode {
    const existing = this.modules.get(file);
    if (existing) {
      return existing;
    }

    const node: ModuleNode = {
      id: this.generateId(file),
      file,
      type,
      dependencies: new Set(),
      dependents: new Set(),
      lastModified: Date.now(),
      hash: '',
    };

    this.modules.set(file, node);
    return node;
  }

  getModule(file: string): ModuleNode | undefined {
    return this.modules.get(file);
  }

  addDependency(from: string, to: string): void {
    const fromNode = this.modules.get(from);
    const toNode = this.modules.get(to);

    if (!fromNode || !toNode) return;

    fromNode.dependencies.add(to);
    toNode.dependents.add(from);
  }

  removeDependency(from: string, to: string): void {
    const fromNode = this.modules.get(from);
    const toNode = this.modules.get(to);

    if (!fromNode || !toNode) return;

    fromNode.dependencies.delete(to);
    toNode.dependents.delete(from);
  }

  updateModule(file: string, hash: string, compiled?: string): void {
    const node = this.modules.get(file);
    if (!node) return;

    node.lastModified = Date.now();
    node.hash = hash;
    if (compiled !== undefined) {
      node.compiled = compiled;
    }
  }

  getAffectedModules(file: string): Set<string> {
    const affected = new Set<string>();
    const queue = [file];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;

      visited.add(current);
      affected.add(current);

      const node = this.modules.get(current);
      if (!node) continue;

      // Add all dependents to queue
      for (const dependent of node.dependents) {
        if (!visited.has(dependent)) {
          queue.push(dependent);
        }
      }
    }

    affected.delete(file); // Don't include the changed file itself
    return affected;
  }

  invalidateModule(file: string): void {
    const node = this.modules.get(file);
    if (!node) return;

    node.compiled = undefined;

    // Invalidate all dependents
    for (const dependent of node.dependents) {
      this.invalidateModule(dependent);
    }
  }

  private generateId(file: string): string {
    return file.replace(/[^a-zA-Z0-9]/g, '_');
  }

  clear(): void {
    this.modules.clear();
  }

  getAllModules(): ModuleNode[] {
    return Array.from(this.modules.values());
  }
}
