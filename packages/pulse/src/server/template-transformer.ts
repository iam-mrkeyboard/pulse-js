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
    declarations: Array<{ name: string; value: any }> = [],
    tag = 'p'
  ): { html: string; bindings: Array<any>; templates: Map<string, string>; exprs: string[] } {

    const root = templateNode;
    const bindings: Array<any> = [];
    const templates = new Map<string, string>();
    // Runtime expressions (List each/key, row bindings, Show when, event handlers)
    // compiled to closures. The markup references them as "<tag>:<index>", so the
    // runtime never evaluates code from strings (CSP without 'unsafe-eval').
    const exprs: string[] = [];
    const addExpr = (src: string): number => {
      const i = exprs.indexOf(src);
      if (i !== -1) return i;
      exprs.push(src);
      return exprs.length - 1;
    };
    const valueRef = (code: string, rowVars: string[]) => addExpr(compileClosure(code, rowVars, false));
    const handlerRef = (code: string, rowVars: string[]) => `${tag}:${addExpr(compileClosure(code, rowVars, true))}`;

    // Sets for lookups
    const stateNames = new Set(stateVars.map(v => v.name));
    const allVarNames = new Set([...stateNames, ...declarations.map(d => d.name)]);

    // Map Setters
    const setterMap = new Map<string, string>();
    stateVars.forEach(v => {
      setterMap.set(v.name, v.setter || ('set' + v.name.charAt(0).toUpperCase() + v.name.slice(1)));
    });

    // Serialize a child list, tracking real DOM childNodes indices. Adjacent text
    // runs (e.g. "Count: " + a {count} placeholder) would merge into ONE text node
    // when the HTML is parsed (innerHTML or SSR HTML), breaking walk() paths, so an
    // empty comment separator is emitted between them and counted in the index.
    const serializeChildren = (
      children: ParsedNode[], scope: any, isInScope: boolean, isRaw: boolean, basePath: number[]
    ): string => {
      let out = '';
      let domIndex = 0;
      let prevText = false;
      for (const c of children) {
        const isTextish = c.type === 'text' || c.type === 'expression';
        if (c.type === 'text' && !(c.content || '')) continue;
        if (isTextish && prevText) {
          out += '<!---->';
          domIndex++;
        }
        const str = serialize(c, scope, isInScope, isRaw, [...basePath, domIndex]);
        if (str === '') continue;
        out += str;
        domIndex++;
        prevText = isTextish;
      }
      return out;
    };

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

        // Non-reactive expressions over script declarations (`let title = "…"`,
        // `const code = \`…\``) or props are evaluated once through a text binding
        // (the effect has no signal deps) so SSR renders the value instead of "{title}".
        if (!isDependent) {
          const refsDecl = declarations.some(d => new RegExp(`(^|[^\\w$.])${d.name.replace(/\$/g, '\\$')}([^\\w$]|$)`).test(content));
          if (refsDecl || /^\s*props\./.test(content)) isDependent = true;
        }

        if (isInScope) {
          // List Binding
          scope._listBindings.push({
            type: 'text',
            path: [...path],
            x: valueRef(this.transformExpression(content, stateNames), scope._rowVars),
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
          const rowVars: string[] = scope._rowVars || [];
          const eachAttr = node.attributes?.get('each');
          let eachExpr = attrCode(eachAttr);
          if (eachExpr) eachExpr = this.transformExpression(eachExpr, stateNames);

          const asAttr = node.attributes?.get('as');
          const asVar = (typeof asAttr === 'string' ? asAttr : asAttr?.code) || 'item';
          if (!/^[A-Za-z_$][\w$]*$/.test(asVar)) {
            throw new Error(`Pulse Error: <List as="${asVar}"> must be an identifier.`);
          }
          const itemVars = [...rowVars, asVar];

          const keyAttr = node.attributes?.get('key');
          let keyExpr = attrCode(keyAttr);
          // key="id" (plain identifier) is shorthand for key={item.id}.
          if (keyExpr && typeof keyAttr === 'string' && !/^\{[\s\S]*\}$/.test(keyAttr.trim()) && /^[A-Za-z_$][\w$]*$/.test(keyExpr.trim())) {
            keyExpr = `${asVar}.${keyExpr.trim()}`;
          }
          if (keyExpr) keyExpr = this.transformExpression(keyExpr, stateNames);

          let attrs = eachExpr ? ` each="${tag}:${valueRef(eachExpr, rowVars)}"` : '';
          if (keyExpr) attrs += ` key="${valueRef(keyExpr, itemVars)}"`;
          const listScope = { ...scope, _listBindings: [], _listBindingCount: 0, _asVar: asVar, _rowVars: itemVars };

          // Reset path for children of List Item
          const rawTemplate = serializeChildren(children, listScope, true, isRaw, []);

          const templateId = `tmpl_${templates.size}`;
          templates.set(templateId, rawTemplate);

          const bindingsJSON = JSON.stringify(listScope._listBindings).replaceAll('"', '&quot;');
          attrs += ` data-bindings="${bindingsJSON}" data-template-id="${templateId}"`;

          return `<pulse-list${attrs} style="display:contents"></pulse-list>`;
        }

        // Handle Show
        if (originalTagName === 'Show') {
          const whenAttr = node.attributes?.get('when');
          let whenExpr = attrCode(whenAttr);
          if (whenExpr) whenExpr = this.transformExpression(whenExpr, stateNames);

          const fallbackAttr = node.attributes?.get('fallback');
          let fallbackExpr = typeof fallbackAttr === 'string' ? fallbackAttr : fallbackAttr?.code;
          if (fallbackExpr) fallbackExpr = this.transformExpression(fallbackExpr, stateNames);

          let attrs = whenExpr ? ` when="${tag}:${valueRef(whenExpr, scope._rowVars || [])}"` : '';
          if (fallbackExpr) attrs += ` fallback="{${fallbackExpr}}"`;

          // Show children need to be templates usually
          const childrenStr = serializeChildren(children, scope, isInScope, isRaw, path);

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
          const childrenStr = serializeChildren(children, scope, isInScope, isRaw, path);
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
                  attrsStr += ` data-on-${eventName}="${handlerRef(`e => ${handlerCode}`, scope._rowVars || [])}"`;
                }
              }
              return;
            }

            if (key.startsWith('on')) {
              // Same accessor convention as bindings: state reads become count().
              // onClick={fn} / onClick={() => ...} / onclick="fn()" all compile to a closure.
              const code = typeof val !== 'string' ? val.code
                : (valStr.startsWith('{') && valStr.endsWith('}')) ? valStr.slice(1, -1) : valStr;
              attrsStr += ` data-on-${key.slice(2).toLowerCase()}="${handlerRef(this.transformExpression(code, stateNames), scope._rowVars || [])}"`;
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
                  x: valueRef(this.transformExpression(expr, stateNames), scope._rowVars),
                });
                return;
              }
            }

            // Any {...} attribute expression becomes a binding (incl. template literals
            // like class={`btn btn-${variant}`}). Do NOT embed raw ` / ${ into static HTML —
            // that breaks the outer _tpl.innerHTML = `...` template literal.
            if (expr !== null && !isInScope) {
              const expressionCode = this.transformExpression(expr, stateNames);
              bindings.push({
                type: 'attribute',
                path: [...path],
                name: key,
                expression: expressionCode
              });
              // Leave a placeholder attribute so path indices stay stable
              attrsStr += ` ${key}=""`;
            } else if (expr !== null && isInScope && Array.isArray(scope._listBindings)) {
              scope._listBindings.push({
                type: 'attribute',
                path: [...path],
                name: key,
                x: valueRef(this.transformExpression(expr, stateNames), scope._rowVars),
              });
            } else if (expr !== null) {
              attrsStr += ` ${key}=""`;
            } else {
              attrsStr += ` ${key}="${valStr.replaceAll('"', '&quot;')}"`;
            }
          });
        }

        const childrenStr = serializeChildren(children, scope, isInScope, isRaw, path);

        const voidElements = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
        if (voidElements.has(tagName) && children.length === 0) {
          return `<${tagName}${attrsStr} />`;
        }
        return `<${tagName}${attrsStr}>${childrenStr}</${tagName}>`;
      }
      return '';
    };

    // Start with empty path [] for root children
    const html = serializeChildren(root.children || [], { _componentNames: componentNames }, false, false, []);

    return { html, bindings, templates, exprs };
  }
}

/** Attribute value as expression source: {code} objects, "{code}" strings, or plain strings. */
function attrCode(attr: string | { code: string } | undefined): string | undefined {
  if (attr === undefined || attr === null) return undefined;
  if (typeof attr !== 'string') return attr.code;
  const t = attr.trim();
  return /^\{[\s\S]*\}$/.test(t) ? t.slice(1, -1) : attr;
}

const IDENT_RE = (name: string) => new RegExp(`(^|[^\\w$.])${name.replace(/\$/g, '\\$')}([^\\w$]|$)`);

/**
 * Compile a template expression to closure source.
 *
 * Values (List each/key, row bindings, Show when): `()` at the top level,
 * `(item, index, $p)` inside a List row, where `item` is the innermost row
 * variable and `$p` the enclosing rows' items (outermost first).
 * Handlers: `(e)` at the top level (`event` aliases `e`), `(e, item, index, $p)`
 * in a row (`row` aliases the row item). The handler closure returns the
 * expression's value; the runtime calls it with the event when it is a function
 * (so `onClick={save}` and `onClick={() => save(1)}` both work).
 * Trailing parameters an expression does not reference are omitted.
 * Throws for code that is not a valid JavaScript expression, so a bad expression
 * fails the build instead of the page.
 */
export function compileClosure(code: string, rowVars: string[], isHandler: boolean): string {
  let src = code.trim().replace(/;+\s*$/, '');
  const isReturnBody = /^return\b/.test(src);
  try {
    if (isReturnBody) {
      acorn.parse(`(function(){${src}})`, { ecmaVersion: 'latest' });
    } else {
      const node: any = acorn.parseExpressionAt(src, 0, { ecmaVersion: 'latest' });
      if (src.slice(node.end).trim() !== '') throw new Error(`unexpected "${src.slice(node.end).trim().slice(0, 20)}"`);
    }
  } catch (e: any) {
    throw new Error(`Pulse Error: cannot compile template expression {${code}}: ${e?.message || e}`);
  }
  const uses = (name: string) => IDENT_RE(name).test(src);
  const cur = rowVars.length ? rowVars[rowVars.length - 1] : '';
  const prelude: string[] = [];
  let needP = false;
  // Enclosing rows' variables (innermost binding of a repeated name wins).
  for (let i = rowVars.length - 2; i >= 0; i--) {
    const name = rowVars[i];
    if (name === cur || rowVars.slice(i + 1, -1).includes(name) || !uses(name)) continue;
    prelude.push(`const ${name} = $p[${i}];`);
    needP = true;
  }
  let params: string[];
  if (isHandler) {
    if (!cur) {
      if (uses('event')) prelude.push('const event = e;');
      params = ['e'];
    } else {
      if (cur !== 'row' && uses('row')) prelude.push(`const row = ${cur};`);
      params = ['e', cur, 'index', '$p'];
    }
  } else {
    params = cur ? [cur, 'index', '$p'] : [];
  }
  // Drop trailing parameters the body never reads.
  const pre = prelude.join(' ');
  const needed = (p: string) => (p === '$p' ? needP : uses(p) || IDENT_RE(p).test(pre));
  while (params.length && !needed(params[params.length - 1])) params.pop();
  const head = `(${params.join(', ')}) =>`;
  if (isReturnBody) return `${head} { ${prelude.join(' ')} ${src} }`;
  if (prelude.length) return `${head} { ${prelude.join(' ')} return (${src}); }`;
  return `${head} (${src})`;
}
