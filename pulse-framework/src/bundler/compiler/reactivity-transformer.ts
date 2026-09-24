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

import { ComponentError } from './errors';

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

      // Helper to find state dependencies in a node
      const findDependencies = (node: any): string[] => {
        const deps = new Set<string>();
        walk(node, {
          enter(child: any) {
            if (
              child.type === 'MemberExpression' &&
              child.object.name === 'state'
            ) {
              deps.add(child.property.name);
            }
          },
        });
        return Array.from(deps);
      };

      // First pass: collect all state declarations
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
              // AST-based dependency extraction
              const deps = findDependencies(node.expression.right);
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

            if (signals.has(propName) || computed.has(propName)) {
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
      throw new ComponentError({
        code: 'REACTIVITY_ERROR',
        message: `Failed to transform reactivity: ${(error as Error).message}`,
        file: 'unknown', // Context will be added by caller
        suggestion: 'Check for syntax errors in your state declarations',
        originalError: error as Error,
      });
    }
  }
}

