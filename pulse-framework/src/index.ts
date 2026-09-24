// ============================================================================
// FILE: src/index.ts
// Main entry point for Pulse framework
// ============================================================================

// Bundler exports
export { PulseBundler, build } from './bundler/index';
export { DependencyAnalyzer } from './bundler/dependency-analyzer';
export { ReactivityAnalyzer } from './bundler/reactivity-analyzer';
export { ComponentCompiler } from './bundler/compiler/component-compiler';
export { RuntimeBuilder } from './runtime/runtime-builder';

// Bundler utilities
export { CodeSplitter } from './bundler/code-splitter';
export { Compressor } from './bundler/compressor';
export { EntryGenerator } from './bundler/entry-generator';
export { Minifier } from './bundler/minifier';
export { CodeGenerator } from './bundler/compiler/code-generator';
export { TemplateOptimizer } from './bundler/compiler/template-optimizer';
export { CSSScoper } from './bundler/compiler/css-scoper';

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
export { hydrate, hydrateAll, renderToString } from './runtime/hydration';
export { P_HYDRATED, P_KEY, P_LIST, P_SHOW, markRoot, markKey } from './runtime/ssr-markers';

// Server exports
export { DevServer } from './server/dev-server';
export { SSRRenderer } from './server/ssr';
export { HMRManager } from './server/hmr';

// Version
export const VERSION = '0.11.0';
