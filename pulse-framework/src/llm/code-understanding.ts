// ============================================================================
// FILE: src/llm/code-understanding.ts
// Tools for LLMs to understand Pulse Components
// ============================================================================

import { UnifiedParser } from '../bundler/compiler/unified-parser';
import type { ComponentAST } from '../bundler/types/ast';

export interface SemanticModel {
  name: string;
  summary: string;
  inputs: string[]; // Props
  outputs: string[]; // Emits/Events
  state: string[];  // Signals
  dependencies: string[]; // Imports
  complexity: 'low' | 'medium' | 'high';
}

export class ComponentIntrospector {
  private parser: UnifiedParser;

  constructor() {
    this.parser = new UnifiedParser();
  }

  public introspect(source: string, fileName: string): SemanticModel {
    const ast = this.parser.parse(source, fileName);

    // Default model if parsing fails
    // AST is always a ComponentAST object with sections that might be errors
    // We don't check ast.type at top level.

    // Check if critical sections failed?
    if (ast.script.type === 'error' && ast.template.type === 'error') {
      return {
        name: fileName,
        summary: 'Component failed to parse (Script and Template errors).',
        inputs: [],
        outputs: [],
        state: [],
        dependencies: [],
        complexity: 'low'
      };
    }

    // Extract semantics
    return {
      name: fileName.split('/').pop()?.replace('.pulse', '') || 'Unknown',
      summary: this.generateSummary(ast),
      inputs: this.extractProps(ast),
      outputs: [], // Phase 5: Event extraction
      state: this.extractState(ast),
      dependencies: this.extractDependencies(ast),
      complexity: this.calculateComplexity(ast)
    };
  }

  private extractProps(ast: ComponentAST): string[] {
    // In Pulse, props are often `const { foo } = props` or just implicit usage.
    // For Phase 4, we use a simple heuristic:
    // If we see `props.xyz` or destructuring of a variable named `props`.
    // Or simpler: Just return what we found in `declarations` for now? 
    // Actually, let's look for `defineProps` if we support it, or just `const props = ...`

    // Placeholder: Return 'unknown' until we have strict Prop definitions in AST
    return [];
  }

  private extractState(ast: ComponentAST): string[] {
    if (ast.script.type === 'valid') {
      return ast.script.signals.map(s => s.name);
    }
    return [];
  }

  private extractDependencies(ast: ComponentAST): string[] {
    if (ast.script.type === 'valid') {
      return ast.script.imports.map(i => i.source);
    }
    return [];
  }

  private generateSummary(ast: ComponentAST): string {
    if (ast.template.type !== 'valid') return 'Invalid template';

    const bindings = ast.template.bindings.length;
    const elements = 0; // logic to count elements would be nice

    return `A UI component with ${bindings} dynamic bindings.`;
  }

  private calculateComplexity(ast: ComponentAST): 'low' | 'medium' | 'high' {
    if (ast.script.type === 'valid') {
      const score = ast.script.signals.length * 2 + ast.script.functions.length;
      if (score > 10) return 'high';
      if (score > 5) return 'medium';
    }
    return 'low';
  }
}
