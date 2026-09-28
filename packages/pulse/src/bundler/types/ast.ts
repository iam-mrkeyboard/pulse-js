// ============================================================================
// FILE: src/bundler/types/ast.ts
// Fully typed AST for Pulse Components - Phase 1
// ============================================================================

import type * as acorn from 'acorn';
// We'll define UltraHTML types manually or import if available, 
// for now we use 'any' or specific shape for AST nodes to avoid circular dep if not installed.
// But we should use robust types.

export type ComponentAST = {
  script: ScriptAST;
  template: TemplateAST;
  styles: StylesAST;
  metadata: ComponentMetadata;
};

export type ResourceLocation = {
  file: string;
  source: string;
};

export type ComponentMetadata = {
  name: string;
  location: ResourceLocation;
};

export type ScriptParseResult = ScriptAST;

// ----------------------------------------------------------------------------
// SCRIPT AST
// ----------------------------------------------------------------------------

export type ScriptAST =
  | { type: 'empty' }
  | {
    type: 'valid';
    ast: acorn.Node;
    code: string;
    imports: Import[];
    exports: Export[];
    signals: Signal[];
    effects: Effect[];
    computed: Computed[];
    functions: FunctionDef[];
    declarations: string[];
  }
  | { type: 'error'; error: Error };

export type Import = {
  source: string;
  specifiers: ImportSpecifier[];
  isTypeOnly: boolean;
};

export type ImportSpecifier = {
  imported: string; // 'createSignal' or 'default'
  local: string;    // 'createSignal'
};

export type Export = {
  name: string;
  type: 'default' | 'named';
};

export type Signal = {
  name: string;
  initialValue: Expression;
  setter: string;
  type: InferredType;
  usages: Reference[];
};

export type Computed = {
  name: string;
  dependencies: string[];
  type: InferredType;
};

export type Effect = {
  dependencies: string[];
  code: string;
};

export type FunctionDef = {
  name: string;
  params: string[];
  isAsync: boolean;
};

export type Reference = {
  loc: { start: number; end: number };
  type: 'read' | 'write' | 'call';
};

// ----------------------------------------------------------------------------
// TEMPLATE AST
// ----------------------------------------------------------------------------

import type { ParsedNode } from '../compiler/html-parser';

// ...

export type TemplateAST =
  | { type: 'empty' }
  | {
    type: 'valid';
    ast: ParsedNode;
    code: string;
    components: ComponentUsage[];
    bindings: Binding[];
    events: EventHandler[];
    slots: Slot[];
  }
  | { type: 'error'; error: Error };

export type ComponentUsage = {
  name: string;
  props: Record<string, Expression>;
  children: any[]; // Template nodes
};

export type Binding = {
  type: 'text' | 'attribute' | 'property';
  path: NodePath;    // Path to node in DOM
  targetId?: string; // Legacy ID (optional)
  name?: string;     // attribute name
  expression: Expression | string; // Allow string for raw code
  dependencies: Set<string>;
  isOneWay?: boolean;
  isTwoWay?: boolean;
};

export type EventHandler = {
  event: string;
  handler: string; // function name or inline code
  target: NodePath;
};

export type Slot = {
  name: string;
  fallback?: any[];
};

export type NodePath = number[]; // [0, 1, 2] -> root.childNodes[0].childNodes[1].childNodes[2]

// ----------------------------------------------------------------------------
// STYLES AST
// ----------------------------------------------------------------------------

export type StylesAST =
  | { type: 'empty' }
  | {
    type: 'valid';
    code: string;
    scoped: boolean;
    classes: string[];
  }
  | { type: 'error'; error: Error };


// ----------------------------------------------------------------------------
// SHARED TYPES
// ----------------------------------------------------------------------------

export type Expression = {
  type: 'literal' | 'identifier' | 'binary' | 'call' | 'other';
  raw: string;
  value?: any;
  // ... acorn node details
};

// Make everything strongly typed for LLM inference
export type InferredType =
  | { kind: 'primitive'; type: 'string' | 'number' | 'boolean' }
  | { kind: 'array'; elementType: InferredType }
  | { kind: 'object'; properties: Record<string, InferredType> }
  | { kind: 'function'; params: InferredType[]; return: InferredType }
  | { kind: 'union'; types: InferredType[] }
  | { kind: 'unknown' };
