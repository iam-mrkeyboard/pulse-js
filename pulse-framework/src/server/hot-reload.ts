// ============================================================================
// FILE: src/server/hot-reload.ts - NEW FILE
// Component-level hot reload (smart HMR)
// ============================================================================

import type { ModuleGraph, ModuleNode } from './module-graph';
import type { HMRManager } from './hmr';

export class HotReload {
  constructor(
    private moduleGraph: ModuleGraph,
    private hmr: HMRManager,
  ) {}

  async handleFileChange(file: string): Promise<void> {
    const module = this.moduleGraph.getModule(file);
    if (!module) {
      // New file, do full reload
      this.hmr.fullReload();
      return;
    }

    // Determine if we can do hot reload
    if (this.canHotReload(module)) {
      await this.performHotReload(module);
    } else {
      // Fall back to full reload
      this.hmr.fullReload();
    }
  }

  private canHotReload(module: ModuleNode): boolean {
    // Can hot reload if:
    // 1. Module is a component (not a page)
    // 2. Module doesn't have state at top level
    // 3. Module's dependents are all hot-reloadable

    if (module.type === 'page') {
      return false; // Pages always need full reload
    }

    if (module.type === 'component') {
      // Check if component has top-level state
      // (components with only local state can be hot reloaded)
      return true; // For now, allow all components
    }

    return false;
  }

  private async performHotReload(module: ModuleNode): Promise<void> {
    console.log(`🔥 Hot reloading: ${module.file}`);

    // Get all affected modules
    const affected = this.moduleGraph.getAffectedModules(module.file);

    // Send hot update to client
    this.hmr.broadcast({
      type: 'hot-update',
      modules: [
        {
          id: module.id,
          file: module.file,
          hash: module.hash,
        },
        ...Array.from(affected)
          .map((file) => {
            const m = this.moduleGraph.getModule(file);
            return m
              ? {
                  id: m.id,
                  file: m.file,
                  hash: m.hash,
                }
              : null;
          })
          .filter(Boolean),
      ],
      timestamp: Date.now(),
    });
  }
}
