// ============================================================================
// FILE: src/server/pulse-plugin.ts
// Shared Bun.build plugin: compiles .pulse files and resolves pulse/runtime.
// Used by SSR (dev + production build) and by the production client bundles.
// ============================================================================

import path from 'node:path';
import { existsSync } from 'node:fs';
import type { BunPlugin } from 'bun';
import type { ComponentCompiler } from './component-compiler';

/**
 * Locate the framework runtime directory. Prefer TypeScript sources
 * (repo / linked package), fall back to the prebuilt dist/runtime JS.
 */
export function resolveRuntimeDir(): { dir: string; ext: '.ts' | '.js' } {
  const candidates = [
    path.resolve(import.meta.dir, '../runtime'), // src/server -> src/runtime
    path.resolve(import.meta.dir, '../../src/runtime'), // dist/cli -> src/runtime
    path.resolve(import.meta.dir, '../runtime'), // dist/cli -> dist/runtime (js)
  ];
  for (const dir of candidates) {
    if (existsSync(path.join(dir, 'core.ts'))) return { dir, ext: '.ts' };
  }
  for (const dir of candidates) {
    if (existsSync(path.join(dir, 'core.js'))) return { dir, ext: '.js' };
  }
  return { dir: path.resolve(import.meta.dir, '../runtime'), ext: '.ts' };
}

const SPECIFIER_TO_FILE: Record<string, string> = {
  'pulse/runtime': 'core',
  'pulse/runtime/core': 'core',
  'pulse/runtime/dom': 'dom',
  'pulse/runtime/list': 'primitives/list',
  'pulse/runtime/show': 'primitives/show',
  'pulse/runtime/hydration': 'hydration',
  'pulse-framework/runtime': 'core',
  'pulse-framework/runtime/dom': 'dom',
  'pulse-framework/runtime/list': 'primitives/list',
  'pulse-framework/runtime/show': 'primitives/show',
  'pulse-framework/runtime/hydration': 'hydration',
};

export function runtimeFile(specifier: string): string | null {
  const { dir, ext } = resolveRuntimeDir();
  const mapped = SPECIFIER_TO_FILE[specifier];
  if (mapped) return path.join(dir, mapped + ext);
  if (specifier.startsWith('/runtime/')) {
    const sub = specifier.slice('/runtime/'.length).replace(/\.js$/, '');
    return path.join(dir, sub + ext);
  }
  return null;
}

export function pulsePlugin(compiler: ComponentCompiler): BunPlugin {
  return {
    name: 'pulse',
    setup(build) {
      build.onResolve({ filter: /^(pulse|pulse-framework)\/runtime(\/[a-z]+)?$/ }, (args) => {
        const file = runtimeFile(args.path);
        return file ? { path: file } : undefined;
      });
      build.onResolve({ filter: /^\/runtime\// }, (args) => {
        const file = runtimeFile(args.path);
        return file ? { path: file } : undefined;
      });
      build.onLoad({ filter: /\.pulse$/ }, async (args) => {
        const content = await Bun.file(args.path).text();
        const contents = await compiler.compile(args.path, content);
        return { contents, loader: 'js' };
      });
    },
  };
}
