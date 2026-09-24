// ============================================================================
// FILE: src/bundler/compiler/prop-inferencer.ts
// Infers prop types from usage in template and script
// ============================================================================

import { walk } from 'estree-walker';
import { ComponentNode, ComponentProps } from '../types';

export class PropInferencer {
  infer(node: ComponentNode): ComponentProps[] {
    const props = new Map<string, ComponentProps>();

    // 1. Analyze Template Usage
    if (node.template) {
      this.analyzeTemplate(node.template, props);
    }

    // 2. Analyze Script Usage (if AST available)
    // For now, we focus on template usage as that's the primary "prop" interface in Pulse

    return Array.from(props.values());
  }

  private analyzeTemplate(templateNode: any, props: Map<string, ComponentProps>) {
    // Walk the custom TemplateNode structure
    const traverse = (n: any) => {
      if (n.type === 'expression' && n.expression) {
        this.extractPropsFromExpression(n.expression.raw, props);
      }

      if (n.type === 'element') {
        // Check attributes for expressions
        if (n.attributes) {
          for (const attr of n.attributes.values()) {
            if (!attr.isStatic && attr.value && attr.value.expression) {
              this.extractPropsFromExpression(attr.value.expression.raw, props);
            }
          }
        }

        if (n.children) {
          n.children.forEach(traverse);
        }
      }
    };

    traverse(templateNode);
  }

  private extractPropsFromExpression(expr: string, props: Map<string, ComponentProps>) {
    // Regex for basic prop usage: props.name
    const propRegex = /props\.(\w+)/g;
    let match;

    while ((match = propRegex.exec(expr)) !== null) {
      const name = match[1];
      if (!props.has(name)) {
        props.set(name, {
          name,
          type: 'any', // Default to any, refine if possible
          required: true,
        });
      }

      // Simple type inference based on context?
      // Parsing the full expression with acorn would allow better inference
      // e.g. props.count + 1 => number
    }
  }

  // Advanced: Use acorn to parse expression and infer types
  // TODO: Implement full AST inference
}
