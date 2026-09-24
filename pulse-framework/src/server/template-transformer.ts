// ============================================================================
// FILE: src/server/compiler/template-transformer.ts
// Extracted from dev-server.ts - Template transformation and SSR logic
// ============================================================================

import { HTMLParser, type ParsedNode, type ParsedExpression } from '../bundler/compiler/html-parser';
import * as acorn from 'acorn';
import { walk } from 'estree-walker';

export class TemplateTransformer {
  constructor() {
  }

  private transformExpression(expression: string, stateNames: Set<string>): string {
    try {
      const ast = acorn.parseExpressionAt(expression, 0, { ecmaVersion: 2020 });
      let magicString = expression;
      const replacements: { start: number, end: number, value: string }[] = [];

      walk(ast as any, {
        enter(node: any, parent: any) {
          if (node.type === 'Identifier') {
            if (stateNames.has(node.name)) {
              let isSafeToReplace = true;

              if (parent && parent.type === 'MemberExpression') {
                if (parent.property === node && !parent.computed) {
                  isSafeToReplace = false;
                }
              }

              if (parent && parent.type === 'Property') {
                if (parent.shorthand) {
                  if (parent.key === node && !parent.computed) {
                    isSafeToReplace = false;
                  }
                } else if (parent.key === node && !parent.computed) {
                  isSafeToReplace = false;
                }
              }

              const isSetter = node.name.startsWith('set');
              if (isSetter) isSafeToReplace = false;

              if (parent && parent.type === 'CallExpression' && parent.callee === node) {
                isSafeToReplace = false;
              }

              if (isSafeToReplace) {
                const replacement = node.name + '()';
                replacements.push({
                  start: node.start,
                  end: node.end,
                  value: replacement
                });
              }
            }
          }
        }
      });

      replacements.sort((a, b) => b.start - a.start);
      for (const rep of replacements) {
        magicString = magicString.slice(0, rep.start) + rep.value + magicString.slice(rep.end);
      }
      return magicString;
    } catch (e) {
      return expression;
    }
  }

  public transform(
    templateNode: ParsedNode,
    stateVars: Array<{ name: string; value: string, setter?: string }>,
    componentNames: string[] = [],
    declarations: Array<{ name: string; value: any }> = []
  ): { html: string; bindings: Array<any>; templates: Map<string, string> } {

    const root = templateNode;
    const bindings: Array<any> = [];
    const templates = new Map<string, string>();

    // Sets for lookups
    const stateNames = new Set(stateVars.map(v => v.name));
    const allVarNames = new Set([...stateNames, ...declarations.map(d => d.name)]);

    // Map Setters
    const setterMap = new Map<string, string>();
    stateVars.forEach(v => {
      setterMap.set(v.name, v.setter || ('set' + v.name.charAt(0).toUpperCase() + v.name.slice(1)));
    });

    // Helper: Serialize Node with Path Tracking
    const serialize = (node: ParsedNode, scope: any = {}, isInScope = false, isRaw = false, path: number[] = []): string => {

      // Handle Text
      if (node.type === 'text') {
        const content = node.content || '';
        if (!content && content !== '') return '';
        // Note: We preserve whitespace text nodes exactly as parser sees them.
        // It is CRITICAL that compiler and browser see same DOM structure.
        return content;
      }

      // Handle Expression (Text Interpolation)
      if (node.type === 'expression') {
        const content = node.content || '';
        if (isRaw) return `&#123;${content}&#125;`; // Escaped for attributes/raw

        // Check if expression depends on state
        let isDependent = false;
        // Simple string check for dependency (matches ComponentCompiler logic)
        for (const varName of stateNames) { // Only state triggers updates
          if (content.includes(varName)) {
            isDependent = true;
            break;
          }
        }

        // For Computed/Declarations?
        if (!isDependent) {
          for (const dName of declarations.map(d => d.name)) {
            if (content.includes(dName)) {
              // Declarations might be reactive (computed) or static.
              // Assuming static for now unless we know better.
              // But computed are passed as computedVars?
              // ComponentCompiler passes `[...stateVars, ...computedVars]`.
              // So stateNames INCLUDES computed.
              // So isDependent check is correct.
            }
          }
        }

        if (isInScope) {
          // List Binding
          scope._listBindings.push({
            type: 'text',
            path: [...path],
            expr: content
          });
          // Placeholder for text node
          return ` `;
        }

        if (isDependent) {
          const expressionCode = this.transformExpression(content, stateNames);

          bindings.push({
            type: 'text',
            path: [...path],
            targetId: undefined, // No ID needed!
            expression: expressionCode
          });

          // Return empty text node as placeholder? 
          // Or a comment?
          // Browser hydration needs a node to hold the spot.
          // If we return " ", it's a text node.
          // If we return "", it might disappear or merge.
          // Convention: " " (space) or specific placeholder.
          // Let's use " " to ensure a text node exists.
          return ` `;
        }

        // Static interpolation
        return `{${content}}`; // Will be interpolated by ComponentCompiler static logic if needed (or not supported for static?)
        // Currently ComponentCompiler static logic does simple regex replacement.
        // If stateful, we shouldn't have static interpolations? 
        // We should just output the value?
        // But we are in build time. We don't know the value.
        // If it's not dependent, it's consistent constant?
        // We leave it as {expr} so it might render literally?
        // Or we should ideally evaluate it?
      }

      if (node.type === 'comment') return `<!--${node.content}-->`;

      if (node.type === 'element') {
        const originalTagName = node.tag!;
        const rawChildren = node.children || [];
        // Important: Filter empty text nodes? 
        // NO. If we filter them here, path indices change.
        // BUT if `UnifiedParser` produces them, we must respect them.
        // Browser `cloneNode` respects them.
        const children = rawChildren;

        // Handle List
        if (originalTagName === 'List') {
          // ... (List logic remains similar, but using paths relative to list item) ...
          const eachAttr = node.attributes?.get('each');
          let eachExpr = typeof eachAttr === 'string' ? eachAttr : eachAttr?.code;
          if (eachExpr) eachExpr = this.transformExpression(eachExpr, stateNames);

          const asAttr = node.attributes?.get('as');
          const asVar = (typeof asAttr === 'string' ? asAttr : asAttr?.code) || 'item';

          const keyAttr = node.attributes?.get('key');
          let keyExpr = typeof keyAttr === 'string' ? keyAttr : keyAttr?.code;
          if (keyExpr) keyExpr = this.transformExpression(keyExpr, stateNames);

          let attrs = ` each="{${eachExpr}}" as="${asVar}"`;
          if (keyExpr) attrs += ` key="{${keyExpr}}"`;
          const listScope = { ...scope, _listBindings: [], _listBindingCount: 0, _asVar: asVar };

          // Reset path for children of List Item
          const rawTemplate = children.map((c, i) => serialize(c, listScope, true, isRaw, [i])).join('');

          const templateId = `tmpl_${templates.size}`;
          templates.set(templateId, rawTemplate);

          const bindingsJSON = JSON.stringify(listScope._listBindings).replaceAll('"', '&quot;');
          attrs += ` data-bindings="${bindingsJSON}" data-template-id="${templateId}"`;

          return `<pulse-list${attrs} style="display:contents"></pulse-list>`;
        }

        // Handle Show
        if (originalTagName === 'Show') {
          const whenAttr = node.attributes?.get('when');
          let whenExpr = typeof whenAttr === 'string' ? whenAttr : whenAttr?.code;
          if (whenExpr) whenExpr = this.transformExpression(whenExpr, stateNames);

          const fallbackAttr = node.attributes?.get('fallback');
          let fallbackExpr = typeof fallbackAttr === 'string' ? fallbackAttr : fallbackAttr?.code;
          if (fallbackExpr) fallbackExpr = this.transformExpression(fallbackExpr, stateNames);

          let attrs = ` when="{${whenExpr}}"`;
          if (fallbackExpr) attrs += ` fallback="{${fallbackExpr}}"`;

          // Show children need to be templates usually
          const childrenStr = children.map((c, i) => serialize(c, scope, isInScope, isRaw, [...path, i])).join('');

          return `<pulse-show${attrs} style="display:contents"><template data-pulse-template>${childrenStr}</template></pulse-show>`;
        }

        // Handle Components
        if (scope._componentNames && scope._componentNames.includes(originalTagName)) {
          // Treating as element for now, but preserving props
          // ... (Attributes logic)
          let attrsStr = '';
          if (node.attributes) {
            node.attributes.forEach((val, key) => {
              const valStr = typeof val === 'string' ? val : `{${val.code}}`;
              attrsStr += ` ${key}="${valStr.replaceAll('"', '&quot;')}"`;
            });
          }
          const childrenStr = children.map((c, i) => serialize(c, scope, isInScope, isRaw, [...path, i])).join('');
          return `<div data-pulse-component="${originalTagName}"${attrsStr} style="display:contents"><template data-pulse-template>${childrenStr}</template></div>`;
        }

        // Standard Element
        const tagName = originalTagName.toLowerCase();
        let attrsStr = '';

        if (node.attributes) {
          node.attributes.forEach((val, key) => {
            let valStr = typeof val === 'string' ? val : `{${val.code}}`;

            // Check bindings
            if (key.startsWith('bind:')) {
              const prop = key.slice(5);
              const varName = valStr.slice(1, -1).trim();

              if (stateNames.has(varName)) {
                bindings.push({
                  type: 'property', // bind:value is property
                  path: [...path],
                  name: prop,
                  expression: `${varName}()`
                });

                // Input Event for two-way binding
                const setter = setterMap.get(varName);
                if (setter) {
                  let eventName = 'input';
                  let handlerCode = '';
                  if (prop === 'value') {
                    eventName = 'input'; handlerCode = `${setter}(e.target.value)`;
                  } else if (prop === 'checked') {
                    eventName = 'change'; handlerCode = `${setter}(e.target.checked)`;
                  }

                  // Add event handler directly to HTML?
                  // Or bind it? 
                  // Event handlers are usually static attributes in Pulse?
                  // "onclick={...}"
                  // here we synthesize one.
                  attrsStr += ` data-on-${eventName}="{e => ${handlerCode}}"`;
                }
              }
              return;
            }

            if (key.startsWith('on')) {
              attrsStr += ` data-on-${key.slice(2).toLowerCase()}="${valStr.replaceAll('"', '&quot;')}"`;
              return;
            }

            // Regular attribute binding
            const isExprAttr = typeof val !== 'string' || (valStr.startsWith('{') && valStr.endsWith('}'));
            const expr = isExprAttr
              ? (typeof val === 'string' ? valStr.slice(1, -1) : val.code)
              : null;

            if (isInScope && expr !== null && Array.isArray(scope._listBindings)) {
              // Keep list-item bindings (class, attrs) on the item, not the page root.
              const asVar = (scope as any)._asVar as string | undefined;
              const dependsOnItem = asVar ? expr.includes(asVar) : true;
              const dependsOnState = Array.from(stateNames).some(name => expr.includes(name));
              if (dependsOnItem || dependsOnState || expr.includes('?')) {
                scope._listBindings.push({
                  type: 'attribute',
                  path: [...path],
                  name: key,
                  expr: this.transformExpression(expr, stateNames),
                });
                return;
              }
            }

            const hasStateDep = valStr.includes('{') && Array.from(stateNames).some(name => valStr.includes(name));
            if (hasStateDep && !isInScope) {
              const inner = valStr.slice(1, -1);
              const expressionCode = this.transformExpression(inner, stateNames);
              bindings.push({
                type: 'attribute',
                path: [...path],
                name: key,
                expression: expressionCode
              });
            } else if (hasStateDep && isInScope && Array.isArray(scope._listBindings)) {
              const inner = valStr.slice(1, -1);
              scope._listBindings.push({
                type: 'attribute',
                path: [...path],
                name: key,
                expr: this.transformExpression(inner, stateNames),
              });
            } else {
              attrsStr += ` ${key}="${valStr.replaceAll('"', '&quot;')}"`;
            }
          });
        }

        const childrenStr = children.map((c, i) => serialize(c, scope, isInScope, isRaw, [...path, i])).join('');

        const voidElements = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
        if (voidElements.has(tagName) && children.length === 0) {
          return `<${tagName}${attrsStr} />`;
        }
        return `<${tagName}${attrsStr}>${childrenStr}</${tagName}>`;
      }
      return '';
    };

    // Start with empty path [] for root children
    const html = (root.children || []).map((node, i) => serialize(node, { _componentNames: componentNames }, false, false, [i])).join('');

    return { html, bindings, templates };
  }
}

// Helper for SSR evaluation
const evalSSR = (code: string, item: any, as: string, globalScope: Record<string, any>): any => {
  try {
    const scopeKeys = Object.keys(globalScope);
    const scopeValues = Object.values(globalScope);
    const fn = new Function(as, ...scopeKeys, `try { return ${code} } catch(e) { return "" }`);
    return fn(item, ...scopeValues);
  } catch (e) {
    return "";
  }
}

const interpolateSSR = (tpl: string, item: any, as: string, globalScope: Record<string, any> = {}): string => {
  let result = tpl;
  const regex = /\{([^}]+)\}/g;
  result = result.replace(regex, (match, code) => {
    try {
      const scopeKeys = Object.keys(globalScope);
      const scopeValues = Object.values(globalScope);

      const fn = new Function(as, ...scopeKeys, `try { return ${code} } catch(e) { return "" }`);
      const val = fn(item, ...scopeValues);

      return val !== undefined ? String(val) : '';
    } catch (e) {
      return "";
    }
  });
  return result;
}
