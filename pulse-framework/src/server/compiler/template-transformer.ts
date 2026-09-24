// ============================================================================
// FILE: src/server/compiler/template-transformer.ts
// Extracted from dev-server.ts - Template transformation and SSR logic
// ============================================================================

import { HTMLParser, type ParsedNode, type ParsedExpression } from '../../bundler/compiler/html-parser';
import * as acorn from 'acorn';
import { walk } from 'estree-walker';

export class TemplateTransformer {
  private htmlParser: HTMLParser;

  constructor() {
    this.htmlParser = new HTMLParser();
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
    template: string,
    stateVars: Array<{ name: string; value: string, setter?: string }>,
    componentNames: string[] = [],
    declarations: Array<{ name: string; value: any }> = []
  ): { html: string; bindings: Array<any>; templates: Map<string, string> } {
    console.log('[Transformer] Start transform');
    const root = this.htmlParser.parse(template);
    const bindings: Array<any> = [];
    const templates = new Map<string, string>();

    const allVarNames = new Set([...stateVars.map(v => v.name), ...declarations.map(d => d.name)]);
    const stateNames = new Set(stateVars.map(v => v.name));

    const setterMap = new Map<string, string>();
    stateVars.forEach(v => {
      setterMap.set(v.name, v.setter || ('set' + v.name.charAt(0).toUpperCase() + v.name.slice(1)));
    });

    let elementIdCounter = 0;
    const globalScope: Record<string, any> = {};
    stateVars.forEach(v => {
      try {
        globalScope[v.name] = (new Function(`return (${v.value})`))();
      } catch (e) { }
    });

    // Helper: Serialize Attributes
    const serializeAttributes = (node: ParsedNode, scope: any, isInScope = false) => {
      let attrsStr = '';
      let bindId = '';
      let hasBinding = false;

      if (node.attributes) {
        node.attributes.forEach((val, key) => {
          let valStr = '';
          let isExpr = false;

          if (typeof val === 'string') {
            valStr = val;
          } else {
            valStr = `{${val.code}}`;
            isExpr = true;
          }

          if (isInScope) {
            if (valStr.includes('{')) {
              if (!bindId) bindId = `L${scope._listBindingCount++}`;
              const expr = valStr.slice(1, -1);
              scope._listBindings.push({
                type: 'attribute',
                id: bindId,
                name: key,
                expr: expr
              });
            }

            if (key.startsWith('on')) {
              attrsStr += ` data-on-${key.slice(2).toLowerCase()}="${valStr.replaceAll('"', '&quot;')}"`;
            } else {
              attrsStr += ` ${key}="${valStr.replaceAll('"', '&quot;')}"`;
            }
            return;
          }

          if (key.startsWith('bind:')) {
            const prop = key.slice(5);
            const varName = valStr.slice(1, -1).trim();

            if (stateNames.has(varName)) {
              if (!bindId) bindId = `el_${elementIdCounter++}`;
              bindings.push({
                type: 'attribute',
                targetId: bindId,
                name: prop,
                expression: `${varName}()`
              });
              hasBinding = true;

              const setter = setterMap.get(varName);
              if (setter) {
                let eventName = 'input';
                let handlerCode = '';
                if (prop === 'value') {
                  eventName = 'input'; handlerCode = `${setter}(e.target.value)`;
                } else if (prop === 'checked') {
                  eventName = 'change'; handlerCode = `${setter}(e.target.checked)`;
                } else {
                  eventName = 'change'; handlerCode = `${setter}(e.target.value)`;
                }
                attrsStr += ` data-on-${eventName}="{e => ${handlerCode}}"`;
              }
            }
            return;
          }

          let attrName = key;
          if (key.startsWith('on')) {
            attrName = 'data-on-' + key.slice(2).toLowerCase();
          }

          const hasStateDep = isExpr && Array.from(stateNames).some(name => valStr.includes(name));

          if (hasStateDep) {
            if (!bindId) bindId = `el_${elementIdCounter++}`;
            const expr = valStr.slice(1, -1);
            const expressionCode = this.transformExpression(expr, stateNames);
            bindings.push({ type: 'attribute', targetId: bindId, name: attrName, expression: expressionCode });
            hasBinding = true;
          } else {
            attrsStr += ` ${attrName}="${valStr.replaceAll('"', '&quot;')}"`;
          }
        });
      }
      return { attrsStr, bindId };
    };

    // Helper: Serialize Node
    const serialize = (node: ParsedNode, scope: any = {}, isInScope = false, isRaw = false, path: number[] = []): string => {

      if (node.type === 'text') {
        return node.content || '';
      }

      if (node.type === 'expression') {
        const content = node.content || '';
        if (isRaw) return `&#123;${content}&#125;`;

        if (isInScope) {
          scope._listBindings.push({
            type: 'text',
            path: [...path],
            expr: content
          });
          // Use span to avoid text node merging which breaks path index
          return `<span style="display:contents"> </span>`;
        }

        let isDependent = false;
        const allNamesArray = Array.from(allVarNames);
        allNamesArray.sort((a, b) => b.length - a.length);

        for (const varName of allNamesArray) {
          if (content.includes(varName)) {
            isDependent = true;
            break;
          }
        }

        if (isDependent) {
          const expressionCode = this.transformExpression(content, stateNames);
          const targetId = `expr_${bindings.length}`;
          bindings.push({ type: 'text', targetId, expression: expressionCode });
          return `<span data-bind="${targetId}"></span>`;
        }

        return `{${content}}`;
      }

      if (node.type === 'comment') return `<!--${node.content}-->`;

      if (node.type === 'element') {
        const originalTagName = node.tag!;
        const rawChildren = node.children || [];
        // Filter out empty text nodes that won't result in DOM nodes
        const children = rawChildren.filter(c => !(c.type === 'text' && (!c.content || c.content.length === 0)));

        // Handle List
        if (originalTagName === 'List') {
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
          const listScope = { ...scope, _listBindings: [], _listBindingCount: 0 };

          // For List children, we reset path to [] because they are root of the template
          const rawTemplate = children.map((c, i) => serialize(c, listScope, true, isRaw, [i])).join('');

          const templateId = `tmpl_${templates.size}`;
          templates.set(templateId, rawTemplate);

          const bindingsJSON = JSON.stringify(listScope._listBindings).replaceAll('"', '&quot;');
          attrs += ` data-bindings="${bindingsJSON}" data-template-id="${templateId}"`;

          const ssrContent = '';

          return `<pulse-list${attrs} style="display:contents">${ssrContent}</pulse-list>`;
        }

        // Handle Components
        if (scope._componentNames && scope._componentNames.includes(originalTagName)) {
          const { attrsStr } = serializeAttributes(node, scope, isInScope);
          const childrenStr = children.map((c, i) => serialize(c, scope, isInScope, isRaw, [...path, i])).join('');
          return `<div data-pulse-component="${originalTagName}"${attrsStr} style="display:contents"><template data-pulse-template>${childrenStr}</template></div>`;
        }

        // Handle Generic Elements
        const tagName = originalTagName.toLowerCase();

        // For generic elements, path refers to THIS element.
        // If we have bindings on this element, we add path to binding.

        let attrsStr = '';
        let bindId = '';
        // let hasBinding = false; // This variable is no longer used after the change

        if (node.attributes) {
          node.attributes.forEach((val, key) => {
            let valStr = typeof val === 'string' ? val : `{${val.code}}`;

            if (isInScope) {
              // Event Bindings (always handle first)
              if (key.startsWith('on')) {
                const rawExpr = valStr.startsWith('{') ? valStr.slice(1, -1) : valStr;
                const expr = this.transformExpression(rawExpr, stateNames);
                scope._listBindings.push({
                  type: 'attribute',
                  path: [...path],
                  name: 'data-on-' + key.slice(2).toLowerCase(),
                  expr: expr
                });
                return;
              }

              if (valStr.includes('{')) {
                // List Scope Binding (non-event)
                const rawExpr = valStr.slice(1, -1);
                const expr = this.transformExpression(rawExpr, stateNames);
                scope._listBindings.push({
                  type: 'attribute',
                  path: [...path], // Path to this element
                  name: key,
                  expr: expr
                });
                return;
              }

              // Standard attribute serialization for List template (non-event, non-binding)
              attrsStr += ` ${key}="${valStr.replaceAll('"', '&quot;')}"`;
              return;
            }

            // Normal Scope Binding (unchanged logic for now - relies on IDs)
            // To fully switch to paths, we'd need to update global bindings too.
            // But simplified task: "Implement Path Walker for Hydration (User Request)" which usually means Lists/SSR.
            // Global hydration uses walker already but with ID lookup.
            // Let's keep global interactions as is (ID based) for stability,
            // and focus Path Walker on Lists where structure is repetitive.

            // Re-using existing serializeAttributes logic for global scope?
            // I need to duplicate the logic or call it?
            // I'll inline the relevant parts to avoid messing up signatures.

            /* Original logic:
            if (key.startsWith('bind:')) ...
            if (hasStateDep) ...
            */
            // I will assume for now we only need Path Walker for Lists (isInScope).
            // For global scope, we leave it as is (using serializeAttributes helper).
          });
        }

        // If NOT in scope, we call serializeAttributes (legacy ID system).
        // If IN scope, we effectively serialized attributes above manually to capture Paths.

        // Wait, I replaced the block.
        // I need to be careful.

        if (!isInScope) {
          const res = serializeAttributes(node, scope, isInScope);
          attrsStr = res.attrsStr;
          bindId = res.bindId;
        }

        let extraAttrs = '';
        if (bindId) extraAttrs += ` data-pulse-id="${bindId}"`;

        const childrenStr = children.map((c, i) => serialize(c, scope, isInScope, isRaw, [...path, i])).join('');

        const voidElements = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
        if (voidElements.has(tagName) && children.length === 0) {
          return `<${tagName}${attrsStr}${extraAttrs} />`;
        }

        return `<${tagName}${attrsStr}${extraAttrs}>${childrenStr}</${tagName}>`;
      }
      return '';
    };

    const html = (root.children || []).map(node => serialize(node, { _componentNames: componentNames })).join('');
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
