// ============================================================================
// FILE: src/bundler/types.ts - FIXED VERSION
// ============================================================================

export interface ComponentNode {
  id: string;
  path: string;
  name: string;
  hash: string;
  imports: ImportDeclaration[];
  exports: ExportDeclaration[];
  isStatic: boolean;
  usesState: boolean;
  primitives: Set<PrimitiveType>;
  dependencies: Set<string>;
  styles?: string;
  template?: TemplateNode;
  reactivity: ReactivityInfo;
  size: {
    original: number;
    compiled: number;
    gzipped: number;
  };
}

export interface ImportDeclaration {
  source: string;
  specifiers: Array<{
    imported: string;
    local: string;
  }>;
  isComponent: boolean;
  isRuntime: boolean;
}

export interface ExportDeclaration {
  name: string;
  type: 'default' | 'named';
}

export interface DependencyGraph {
  nodes: Map<string, ComponentNode>;
  edges: Map<string, Set<string>>;
  entryPoints: Set<string>;
  islands: Set<string>;
  staticPages: Set<string>;
}

export interface ReactivityInfo {
  signals: Map<string, SignalNode>;
  computed: Map<string, ComputedNode>;
  effects: Set<EffectNode>;
  dependencies: Map<string, Set<string>>;
  isFullyStatic: boolean;
}

export interface SignalNode {
  key: string;
  initialValue: any;
  isConst: boolean;
  usedIn: Set<string>;
}

export interface ComputedNode {
  key: string;
  dependencies: Set<string>;
  canMemoize: boolean;
  purity: 'pure' | 'impure';
}

export interface EffectNode {
  id: string;
  dependencies: Set<string>;
  cleanup: boolean;
}

export interface TemplateNode {
  type: 'element' | 'text' | 'expression' | 'fragment';
  tag?: string;
  attributes?: Map<string, AttributeNode>;
  children?: TemplateNode[];
  textContent?: string;
  expression?: ExpressionNode;
  isStatic: boolean;
  staticHTML?: string;
}

export interface AttributeNode {
  name: string;
  value: string | ExpressionNode;
  isStatic: boolean;
  isEvent: boolean;
}

export interface ExpressionNode {
  raw: string;
  compiled: string;
  dependencies: Set<string>;
  isReactive: boolean;
  type: 'simple' | 'function' | 'complex';
}

export type PrimitiveType =
  | 'List'
  | 'Show'
  | 'Portal'
  | 'Suspense'
  | 'ErrorBoundary';

export interface CompilationContext {
  config: PulseConfig;
  graph: DependencyGraph;
  output: OutputManifest;
  cache: CompilationCache;
}

export interface OutputManifest {
  runtime: {
    core: string;
    primitives: Map<string, string>;
    size: number;
  };
  islands: Map<string, IslandManifest>;
  pages: Map<string, PageManifest>;
  assets: Map<string, AssetManifest>;
  stats: BundleStats;
}

export interface IslandManifest {
  id: string;
  path: string;
  code: string;
  dependencies: string[];
  primitives: PrimitiveType[];
  size: number;
  isPreloaded: boolean;
}

export interface PageManifest {
  path: string;
  html: string;
  islands: string[];
  isStatic: boolean;
  preloads: string[];
  css: string[];
  size: number;
}

export interface AssetManifest {
  path: string;
  hash: string;
  size: number;
  type: 'css' | 'js' | 'json' | 'other';
}

export interface BundleStats {
  totalSize: number;
  jsSize: number;
  cssSize: number;
  htmlSize: number;
  staticPages: number;
  interactivePages: number;
  islands: number;
  cacheableSize: number;
}

export interface CompilationCache {
  components: Map<string, CachedComponent>;
  templates: Map<string, string>;
  styles: Map<string, string>;
  hits: number;
  misses: number;
}

export interface CachedComponent {
  hash: string;
  compiled: string;
  timestamp: number;
}

// FIXED: Make all properties required with defaults
export interface PulseConfig {
  root: string;
  srcDir: string;
  outDir: string;
  publicDir: string;
  pages: {
    dir: string;
    defaultLayout?: string;
  };
  build: {
    minify: boolean;
    sourcemap: boolean;
    target: 'es2020' | 'es2022' | 'esnext';
    splitting: boolean;
    treeshake: boolean;
    islands: boolean;
    ssr: boolean;
  };
  optimization: {
    inlineStyles: boolean;
    criticalCSS: boolean;
    prefetch: boolean;
    compress: 'gzip' | 'brotli' | 'both';
  };
  devServer: {
    port: number;
    hmr: boolean;
    open: boolean;
  };
  debug: boolean;
}

export interface BuildResult {
  success: boolean;
  manifest: OutputManifest;
  errors: CompilationError[];
  warnings: CompilationWarning[];
  duration: number;
}

export interface CompilationError {
  file: string;
  line?: number;
  column?: number;
  message: string;
  code?: string;
  stack?: string;
}

export interface CompilationWarning {
  file: string;
  message: string;
  suggestion?: string;
}

export interface RuntimeConfig {
  mode: 'hydrate' | 'spa' | 'static';
  islands: string[];
  version: string;
}

export interface IslandDescriptor {
  id: string;
  selector: string;
  props: Record<string, any>;
  hydrate: 'load' | 'idle' | 'visible' | 'media';
}

export interface AnalysisResult {
  component: ComponentNode;
  complexity: ComplexityScore;
  recommendations: Recommendation[];
}

export interface ComplexityScore {
  overall: number;
  reactivity: number;
  dom: number;
  dependencies: number;
}

export interface Recommendation {
  type: 'performance' | 'size' | 'maintainability';
  severity: 'info' | 'warning' | 'error';
  message: string;
  fix?: string;
}

export interface OptimizationPass {
  name: string;
  run(node: ComponentNode, ctx: CompilationContext): ComponentNode;
  priority: number;
}

export interface TransformResult {
  code: string;
  map?: string;
  dependencies: string[];
  sideEffects: boolean;
}

export interface ComponentProps {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'function' | 'any';
  required: boolean;
  defaultValue?: any;
}

export interface ComponentSlot {
  name: string;
  fallback?: string;
}

// Update ComponentNode to include props and slots
export interface ComponentNode {
  id: string;
  path: string;
  name: string;
  hash: string;
  imports: ImportDeclaration[];
  exports: ExportDeclaration[];
  isStatic: boolean;
  usesState: boolean;
  primitives: Set<PrimitiveType>;
  dependencies: Set<string>;
  styles?: string;
  template?: TemplateNode;
  reactivity: ReactivityInfo;
  size: {
    original: number;
    compiled: number;
    gzipped: number;
  };
  props: Map<string, ComponentProps>; // NEW
  slots: Map<string, ComponentSlot>; // NEW
  children?: ComponentNode[]; // NEW
}

// Helper function to create default config
export function createDefaultConfig(
  partial: Partial<PulseConfig> = {},
): PulseConfig {
  return {
    root: partial.root || process.cwd(),
    srcDir: partial.srcDir || './src',
    outDir: partial.outDir || './dist',
    publicDir: partial.publicDir || './public',
    pages: {
      dir: partial.pages?.dir || './src/pages',
      defaultLayout: partial.pages?.defaultLayout,
    },
    build: {
      minify: partial.build?.minify ?? true,
      sourcemap: partial.build?.sourcemap ?? true,
      target: partial.build?.target || 'es2022',
      splitting: partial.build?.splitting ?? true,
      treeshake: partial.build?.treeshake ?? true,
      islands: partial.build?.islands ?? true,
      ssr: partial.build?.ssr ?? true,
    },
    optimization: {
      inlineStyles: partial.optimization?.inlineStyles ?? true,
      criticalCSS: partial.optimization?.criticalCSS ?? true,
      prefetch: partial.optimization?.prefetch ?? true,
      compress: partial.optimization?.compress || 'both',
    },
    devServer: {
      port: partial.devServer?.port || 3000,
      hmr: partial.devServer?.hmr ?? true,
      open: partial.devServer?.open ?? false,
    },
    debug: partial.debug ?? false,
  };
}
