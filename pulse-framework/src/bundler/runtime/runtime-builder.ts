// ============================================================================
// FILE: src/bundler/runtime/runtime-builder.ts - USING PRIMITIVE SOURCES
// ============================================================================

import type {
  DependencyGraph,
  PrimitiveType,
  CompilationContext,
} from '../types';
import { minify } from 'terser';
import { CORE_RUNTIME_SOURCE } from './core-runtime';
import { LIST_PRIMITIVE_SOURCE } from './primitives/list';
import { SHOW_PRIMITIVE_SOURCE } from './primitives/show';
import { PORTAL_PRIMITIVE_SOURCE } from './primitives/portal';

export class RuntimeBuilder {
  constructor(private ctx: CompilationContext) {}

  async buildRuntime(graph: DependencyGraph): Promise<Map<string, string>> {
    const runtimes = new Map<string, string>();

    // Determine what's needed
    const needsSignals = this.needsSignals(graph);
    const needsPrimitives = this.collectPrimitives(graph);

    // Build core runtime
    if (needsSignals) {
      runtimes.set('core', await this.buildCoreRuntime());
    }

    // Build primitive runtimes
    for (const primitive of needsPrimitives) {
      runtimes.set(
        `primitives/${primitive.toLowerCase()}`,
        await this.buildPrimitive(primitive),
      );
    }

    return runtimes;
  }

  private needsSignals(graph: DependencyGraph): boolean {
    for (const node of graph.nodes.values()) {
      if (
        node.reactivity.signals.size > 0 ||
        node.reactivity.computed.size > 0
      ) {
        return true;
      }
    }
    return false;
  }

  private collectPrimitives(graph: DependencyGraph): Set<PrimitiveType> {
    const primitives = new Set<PrimitiveType>();

    for (const node of graph.nodes.values()) {
      node.primitives.forEach((p) => primitives.add(p));
    }

    return primitives;
  }

  private async buildCoreRuntime(): Promise<string> {
    return this.minifyCode(CORE_RUNTIME_SOURCE);
  }

  private async buildPrimitive(primitive: PrimitiveType): Promise<string> {
    let source = '';

    switch (primitive) {
      case 'List':
        source = LIST_PRIMITIVE_SOURCE;
        break;
      case 'Show':
        source = SHOW_PRIMITIVE_SOURCE;
        break;
      case 'Portal':
        source = PORTAL_PRIMITIVE_SOURCE;
        break;
      default:
        console.warn(`Unknown primitive: ${primitive}`);
        return '';
    }

    return this.minifyCode(source);
  }

  private async minifyCode(code: string): Promise<string> {
    if (!this.ctx.config.build.minify) {
      return code;
    }

    const result = await minify(code, {
      module: true,
      compress: {
        passes: 3,
        pure_getters: true,
        unsafe: true,
        unsafe_math: true,
        unsafe_methods: true,
      },
      mangle: {
        toplevel: true,
      },
      format: {
        comments: false,
      },
    });

    return result.code || code;
  }

  // Calculate runtime sizes
  async estimateSizes(): Promise<Record<string, number>> {
    const core = await this.buildCoreRuntime();
    const list = await this.buildPrimitive('List');
    const show = await this.buildPrimitive('Show');
    const portal = await this.buildPrimitive('Portal');

    return {
      core: Buffer.byteLength(core),
      list: Buffer.byteLength(list),
      show: Buffer.byteLength(show),
      portal: Buffer.byteLength(portal),
      total:
        Buffer.byteLength(core) +
        Buffer.byteLength(list) +
        Buffer.byteLength(show) +
        Buffer.byteLength(portal),
    };
  }
}
