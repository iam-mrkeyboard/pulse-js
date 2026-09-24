import * as acorn from 'acorn';
import { walk } from 'estree-walker';
import type { ReactivityInfo } from '../types';

export class ReactivityAnalyzer {
  analyze(code: string): ReactivityInfo {
    const info: ReactivityInfo = {
      signals: new Map(),
      computed: new Map(),
      effects: new Set(),
      dependencies: new Map(),
      isFullyStatic: true,
    };

    try {
      const ast = acorn.parse(code, {
        ecmaVersion: 2022,
        sourceType: 'module',
      });

      const self = this;
      let effectId = 0;

      walk(ast as any, {
        enter(node: any) {
          // Detect state.x = ...
          if (
            node.type === 'AssignmentExpression' &&
            node.left.type === 'MemberExpression' &&
            node.left.object.name === 'state'
          ) {
            const key = node.left.property.name;
            const right = node.right;

            // Check if computed (function or arrow function)
            if (
              right.type === 'ArrowFunctionExpression' ||
              right.type === 'FunctionExpression'
            ) {
              const deps = self.extractStateDependencies(right);
              const canMemoize = self.canMemoize(right);
              const purity = self.isPure(right) ? 'pure' : 'impure';

              info.computed.set(key, {
                key,
                dependencies: deps,
                canMemoize,
                purity,
              });
              info.dependencies.set(key, deps);
            } else {
              // It's a signal
              const initialValue = code.slice(right.start, right.end);
              info.signals.set(key, {
                key,
                initialValue,
                isConst: false,
                usedIn: new Set(),
              });
            }
            info.isFullyStatic = false;
          }

          // Detect createEffect
          if (
            node.type === 'CallExpression' &&
            node.callee.name === 'createEffect'
          ) {
            const effectBody = node.arguments[0];
            if (effectBody) {
              const deps = self.extractStateDependencies(effectBody);
              const bodyCode = code.slice(effectBody.start, effectBody.end);

              info.effects.add({
                id: `effect_${effectId++}`,
                dependencies: deps,
                cleanup: bodyCode.includes('onCleanup'), // AST check for call to onCleanup? Simplification ok here or recursively walk body
              });
              info.isFullyStatic = false;
            }
          }
        },
      });

      // Build Usage Graph
      // We can do this by walking again or reusing the AST
      // Just simpler to walk again for usages
      this.buildUsageGraph(ast, info);

    } catch (e) {
      console.warn('Reactivity analysis failed, fallback?', e);
    }

    return info;
  }

  private extractStateDependencies(node: any): Set<string> {
    const deps = new Set<string>();
    walk(node, {
      enter(n: any) {
        if (n.type === 'MemberExpression' && n.object.name === 'state') {
          deps.add(n.property.name);
        }
      },
    });
    return deps;
  }

  private canMemoize(node: any): boolean {
    let canComp = true;
    const sideEffects = new Set([
      'console',
      'Math', // Math.random
      'Date',
      'fetch',
      'localStorage',
      'sessionStorage',
      'document',
      'window',
    ]);

    walk(node, {
      enter(n: any) {
        if (!canComp) return;
        if (n.type === 'MemberExpression' && n.object.type === 'Identifier') {
          if (sideEffects.has(n.object.name)) canComp = false;
        }
        if (n.type === 'CallExpression' && n.callee.type === 'Identifier') {
          if (sideEffects.has(n.callee.name)) canComp = false;
        }
      }
    });
    return canComp;
  }

  private isPure(node: any): boolean {
    // Similar to canMemoize but stricter?
    // Let's reuse canMemoize logic for checking external side effects
    // Also check for assignments to outer variables?
    let pure = true;
    const impure = new Set([
      'console',
      'document',
      'window',
    ]);

    walk(node, {
      enter(n: any) {
        if (!pure) return;
        if (n.type === 'AssignmentExpression') pure = false;
        if (n.type === 'UpdateExpression') pure = false; // ++, --

        if (n.type === 'MemberExpression' && n.object.type === 'Identifier') {
          if (impure.has(n.object.name)) pure = false;
        }
      }
    });

    return pure;
  }

  private buildUsageGraph(ast: any, info: ReactivityInfo): void {
    // Find all usages of state.x
    const usages = new Map<string, Set<any>>(); // key -> set of nodes using it

    walk(ast, {
      enter(node: any, parent: any) {
        if (node.type === 'MemberExpression' && node.object.name === 'state') {
          // This is a usage.
          // We need to know WHICH computed or effect owns this usage.
          // This requires tracking context during walk, or parent pointers.
          // ESTree-walker passes parent, but not full ancestry.
          // Actually, `extractStateDependencies` already tells us dependencies of each computed/effect.
          // We just need to map REVERSE: signal -> who depends on it.
          // The info.computed and info.effects ALREADY have dependencies lists.
          // So we can just iterate those.
        }
      }
    });

    // Populate usedIn based on dependencies found in analyze step
    for (const [compKey, comp] of info.computed) {
      for (const dep of comp.dependencies) {
        const signal = info.signals.get(dep);
        if (signal) signal.usedIn.add(compKey);
      }
    }

    for (const effect of info.effects) {
      for (const dep of effect.dependencies) {
        const signal = info.signals.get(dep);
        if (signal) signal.usedIn.add(effect.id);
      }
    }
  }

  static needsReactivity(code: string): boolean {
    return (
      code.includes('state.') ||
      code.includes('createSignal') ||
      code.includes('createEffect') ||
      code.includes('createMemo')
    );
  }
}
