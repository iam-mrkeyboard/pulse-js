// ============================================================================
// FILE: src/index.ts
// Main entry point for Pulse framework
// ============================================================================

// Build
export { PulseBundler, build } from './bundler/index';
export { DependencyAnalyzer } from './bundler/dependency-analyzer';
export { Compressor } from './bundler/compressor';
export { CSSScoper } from './bundler/compiler/css-scoper';

// Compiler (.pulse single-file components -> ES modules; used by dev + build)
export { ComponentCompiler, TemplateTransformer } from './compiler/index';

// Types
export type {
  PulseConfig,
  ComponentNode,
  DependencyGraph,
  BuildResult,
  ReactivityInfo,
  TemplateNode,
  CompilationContext,
  OutputManifest,
  IslandManifest,
  PageManifest,
  TransformResult,
} from './bundler/types';

export { createDefaultConfig } from './bundler/types';

// Runtime exports (for user code)
export {
  createSignal,
  createEffect,
  createMemo,
  createSelector,
  createRoot,
  batch,
  untrack,
  onCleanup,
} from './runtime/core';
export { List } from './runtime/primitives/list';
export { Show } from './runtime/primitives/show';
export { walk, template, mountPrimitives, text, setAttribute, on } from './runtime/dom';
export { hydrate, hydrateAll, renderToString } from './runtime/hydration';
export { P_HYDRATED, P_KEY, P_LIST, P_SHOW, markRoot, markKey } from './runtime/ssr-markers';

// Server exports
export { DevServer } from './server/dev-server';
export { SSRRenderer } from './server/ssr';
export { HMRManager } from './server/hmr';

// Version
export { VERSION } from './version';
