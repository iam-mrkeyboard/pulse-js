// ============================================================================
// FILE: src/bundler/compiler/reactivity-transformer.ts - NEW FILE
// AST-based reactivity transformation using acorn
// ============================================================================

import * as acorn from 'acorn';
import { walk } from 'estree-walker';
import type { Node } from 'estree';

export interface ReactivityTransformResult {
  code: string;
  signals: Map<string, string>;
  computed: Map<string, string[]>;
  effects: string[];
}

export class ReactivityTransformer {
  transform(code: string): ReactivityTransformResult {
    try {
      const ast = acorn.parse(code, {
        ecmaVersion: 2022,
        sourceType: 'module',
      });

      const signals = new Map<string, string>();
      const computed = new Map<string, string[]>();
      const effects: string[] = [];
      const transformedSegments: Array<{
        start: number;
        end: number;
        replacement: string;
      }> = [];

      // First pass: collect all state declarations
      const self = this;
      walk(ast as any, {
        enter(node: any) {
          // Handle state.x = value
          if (
            node.type === 'ExpressionStatement' &&
            node.expression.type === 'AssignmentExpression' &&
            node.expression.left.type === 'MemberExpression' &&
            node.expression.left.object.name === 'state'
          ) {
            const propName = node.expression.left.property.name;
            const initValue = code.slice(
              node.expression.right.start,
              node.expression.right.end,
            );

            // Check if it's a function (computed)
            if (
              node.expression.right.type === 'ArrowFunctionExpression' ||
              node.expression.right.type === 'FunctionExpression'
            ) {
              const deps = self.extractDependencies(initValue);
              computed.set(propName, deps);
            } else {
              signals.set(propName, initValue);
            }
          }
        },
      });

      // Second pass: transform all state access
      walk(ast as any, {
        enter(node: any, parent: any) {
          // Transform state.x reads to get_x()
          if (
            node.type === 'MemberExpression' &&
            node.object.name === 'state' &&
            parent?.type !== 'AssignmentExpression'
          ) {
            const propName = node.property.name;

            if (signals.has(propName)) {
              transformedSegments.push({
                start: node.start,
                end: node.end,
                replacement: `get_${propName}()`,
              });
            } else if (computed.has(propName)) {
              transformedSegments.push({
                start: node.start,
                end: node.end,
                replacement: `get_${propName}()`,
              });
            }
          }

          // Transform state.x = value to set_x(value)
          if (
            node.type === 'AssignmentExpression' &&
            node.left.type === 'MemberExpression' &&
            node.left.object.name === 'state'
          ) {
            const propName = node.left.property.name;
            const valueCode = code.slice(node.right.start, node.right.end);

            if (signals.has(propName)) {
              transformedSegments.push({
                start: node.start,
                end: node.end,
                replacement: `set_${propName}(${valueCode})`,
              });
            }
          }
        },
      });

      // Apply transformations in reverse order
      transformedSegments.sort((a, b) => b.start - a.start);

      let transformed = code;
      for (const segment of transformedSegments) {
        transformed =
          transformed.slice(0, segment.start) +
          segment.replacement +
          transformed.slice(segment.end);
      }

      return {
        code: transformed,
        signals,
        computed,
        effects,
      };
    } catch (error) {
      console.warn(
        'Reactivity transformation failed, returning original code:',
        error,
      );
      return {
        code,
        signals: new Map(),
        computed: new Map(),
        effects: [],
      };
    }
  }

  private extractDependencies(code: string): string[] {
    const deps: string[] = [];
    const stateRegex = /state\.(\w+)/g;
    let match;

    while ((match = stateRegex.exec(code)) !== null) {
      if (match[1]) {
        deps.push(match[1]);
      }
    }

    return deps;
  }
}
