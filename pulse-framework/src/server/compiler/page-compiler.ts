// ============================================================================
// FILE: src/server/compiler/page-compiler.ts
// Extracted from dev-server.ts - Page compilation logic
// ============================================================================

import path from 'node:path';
import * as acorn from 'acorn';
import { walk } from 'estree-walker';
import type { PulseConfig } from '../../bundler/types';
import { ScriptParser, type ScriptParseResult } from '../script-parser';
import { TemplateTransformer } from './template-transformer';
import { getMountScript } from './mount-script-generator';
import { wrapHTML } from '../utils/html-wrapper';
import { getHMRScript } from '../runtime/hmr-client';
import { HTMLParser, type ParsedNode } from '../../bundler/compiler/html-parser';

export class PageCompiler {
  private config: PulseConfig;
  private scriptParser: ScriptParser;
  private templateTransformer: TemplateTransformer;
  private htmlParser: HTMLParser;

  constructor(config: PulseConfig, scriptParser: ScriptParser, templateTransformer: TemplateTransformer) {
    this.config = config;
    this.scriptParser = scriptParser;
    this.templateTransformer = templateTransformer;
    this.htmlParser = new HTMLParser();
  }

  private transformScript(code: string, stateNames: Set<string>): string {
    try {
      if (!code || !code.trim()) return code;

      const ast = acorn.parse(code, { ecmaVersion: 2020 });
      let magicString = code;
      const replacements: { start: number, end: number, value: string }[] = [];

      walk(ast as any, {
        enter(node: any, parent: any) {
          if (node.type === 'Identifier') {
            if (stateNames.has(node.name)) {
              let isSafeToReplace = true;

              if (parent) {
                if (parent.type === 'MemberExpression' && parent.property === node && !parent.computed) isSafeToReplace = false;
                if (parent.type === 'Property' && parent.key === node && !parent.computed && !parent.shorthand) isSafeToReplace = false;
                if (parent.type === 'VariableDeclarator' && parent.id === node) isSafeToReplace = false;
                if ((parent.type === 'FunctionDeclaration' || parent.type === 'ArrowFunctionExpression') && parent.params.includes(node)) isSafeToReplace = false;
                if (parent.type === 'CallExpression' && parent.callee === node) isSafeToReplace = false;
                if (parent.type === 'AssignmentExpression' && parent.left === node) isSafeToReplace = false;
              }

              if (isSafeToReplace) {
                replacements.push({ start: node.start, end: node.end, value: node.name + '()' });
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
      return code;
    }
  }

  public async compile(filePath: string, content: string): Promise<string> {
    // Parse AST
    const root = this.htmlParser.parse(content);

    let styles = '';
    let logic = '';
    let template = '';

    if (root.children) {
      root.children.forEach(node => {
        if (node.type === 'element') {
          if (node.tag === 'style') {
            styles += node.content || (node.children ? node.children.map(c => c.content || c.raw || '').join('') : '');
          } else if (node.tag === 'script') {
            logic += node.content || (node.children ? node.children.map(c => c.content || c.raw || '').join('') : '');
          } else {
            template += this.serializeNode(node);
          }
        } else if (node.type === 'text' || node.type === 'comment' || node.type === 'expression') {
          // Handle top-level text/expressions in template
          if (node.type === 'text') template += node.content || '';
          else if (node.type === 'comment') template += `<!--${node.content}-->`;
          else if (node.type === 'expression') template += `{${node.content}}`;
        }
      });
    }

    styles = styles.trim();
    logic = logic.trim();
    template = template.trim();

    const styleTag = styles ? `<style>${styles}</style>` : '';

    // Parse Logic
    const scriptResult = this.scriptParser.parse(logic);

    // Determine if page is interactive
    const isInteractive = scriptResult.stateVars.length > 0 ||
      scriptResult.functions.length > 0 ||
      scriptResult.imports.length > 0 ||
      scriptResult.declarations.length > 0;

    if (isInteractive) {
      return this.compileInteractive(template, scriptResult, styleTag, filePath);
    } else {
      return this.compileStatic(template, styleTag);
    }
  }

  private compileInteractive(
    template: string,
    scriptResult: ScriptParseResult,
    styleTag: string,
    filePath: string,
  ): string {
    const pageName = path.basename(filePath, '.pulse');

    // Process Imports
    const imports: Array<{ name: string; path: string; resolvedPath: string }> = [];
    const pageDir = path.dirname(filePath);
    scriptResult.imports.forEach(imp => {
      // Resolve path relative to page file
      const resolvedPath = path.resolve(pageDir, imp.source);
      imp.names.forEach(n => {
        imports.push({ name: n, path: imp.source, resolvedPath });
      });
    });

    const { stateVars, functions, declarations, computedVars } = scriptResult;


    // Prepare state names for transformer
    const stateNames = new Set(stateVars.map(v => v.name));

    // Transform Functions, Computed, and Declarations
    const transformedFunctions = functions.map(fn => ({
      ...fn,
      code: this.transformScript(fn.code || '', stateNames)
    }));

    const transformedComputed = computedVars.map(cv => ({
      ...cv,
      code: this.transformScript(cv.code || '', stateNames)
    }));

    const transformedDeclarations = declarations.map(d => ({
      ...d,
      code: this.transformScript(d.code || '', stateNames)
    }));

    // Check for primitives
    const hasListPrimitive = template.includes('<List') || template.includes('data-pulse-list');
    const hasShowPrimitive = template.includes('<Show') || template.includes('data-pulse-show');

    // Build primitive imports
    const primitiveImports: string[] = [];
    if (hasListPrimitive && !imports.some(i => i.name === 'List')) {
      primitiveImports.push("import { List } from '/runtime/primitives/list.js';");
    }
    if (hasShowPrimitive && !imports.some(i => i.name === 'Show')) {
      primitiveImports.push("import { Show } from '/runtime/primitives/show.js';");
    }

    // Transform template for reactive bindings
    const componentNames = imports.map(i => i.name).filter(n => /^[A-Z]/.test(n));

    // Pass declarations and computedVars to transformer!
    // We map stateVars to include setter names so transformer can generate bind: writes
    const stateVarsWithSetters = stateVars.map(sv => ({
      ...sv,
      setter: sv.setterName || ('set' + sv.name.charAt(0).toUpperCase() + sv.name.slice(1))
    }));

    const { html, bindings, templates } = this.templateTransformer.transform(template, [...stateVarsWithSetters, ...computedVars], componentNames, declarations);

    // Generate mount script
    const mountScript = getMountScript(imports, hasListPrimitive, hasShowPrimitive);

    // Prepare event handlers
    const handlerEntries = [
      ...functions.map(f => `${f.name}: ${f.name}`),
      ...stateVars.map(sv => {
        const setterName = sv.setterName || ('set' + sv.name.charAt(0).toUpperCase() + sv.name.slice(1));
        return `${setterName}: ${setterName}`;
      })
    ];
    const handlersString = handlerEntries.join(',\n    ');

    // Prepare scope properties for hydration
    const scopeProperties = [
      ...stateVars.map(s => `${s.name}: ${s.name}`),
      ...stateVars.map(sv => {
        const setterName = sv.setterName || ('set' + sv.name.charAt(0).toUpperCase() + sv.name.slice(1));
        return `${setterName}: ${setterName}`;
      }),
      ...computedVars.map(c => `${c.name}: ${c.name}`),
      ...functions.map(f => `${f.name}: ${f.name}`),
      ...declarations.map(d => `${d.name}: ${d.name}`),
      '...components'
    ];
    const scopePropsString = scopeProperties.join(',\n    ');

    return wrapHTML(
      `
${styleTag}
<div id="app-${pageName}">
  ${html}
</div>

<script type="module">
import { createSignal, createEffect, createMemo } from '/runtime/core.js';
import { mountPrimitives as mountPrimitives_dom, hydrateDOM } from '/runtime/dom.js';
${primitiveImports.join('\n')}
${imports.map((imp) => `import ${imp.name} from '/__component?path=${encodeURIComponent(imp.resolvedPath)}';`).join('\n')}

(function() {
  const root = document.getElementById('app-${pageName}');
  if (!root) return;
  
  // Data declarations
  ${transformedDeclarations.map(d => d.code).join('\n  ')}
  
  // Create reactive state (Signals)
  ${stateVars
        .map(
          ({ name, value, setterName }) => {
            const setter = setterName || ('set' + name.charAt(0).toUpperCase() + name.slice(1));
            return `const [${name}, ${setter}] = createSignal(${value});`;
          }
        )
        .join('\n  ')}
  
  // Computed Variables
  ${transformedComputed.map(cv => cv.code).join('\n  ')}

  // Define functions
  ${transformedFunctions.map((fn) => fn.code).join('\n\n')}

  // Components map
  const components = {
    ${componentNames.join(',\n    ')}
  };

  // Templates map
  const templates = new Map([
    ${Array.from(templates.entries()).map(([k, v]) => `['${k}', ${JSON.stringify(v)}]`).join(',\n    ')}
  ]);

  // Scope construction for hydration
  const scope = {
    ${scopePropsString}
  };

  // Mount Components and Primitives
  ${mountScript}

  // Setup reactive bindings
  const unescapeHtml = (str) => str.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&').replace(/&quot;/g, '"');
  ${bindings
        .map(
          (binding) => {
            const expr = binding.expression.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
            if (binding.type === 'text') {
              return `
  createEffect(() => {
    const el = root.querySelector('[data-bind="${binding.targetId}"]');
    if (el) el.textContent = ${expr};
  });`;
            } else {
              // Attribute Binding
              const isBoolean = binding.name === 'checked' || binding.name === 'disabled';
              const isValue = binding.name === 'value';

              if (isBoolean || isValue) {
                return `
  createEffect(() => {
    const el = root.querySelector('[data-pulse-id="${binding.targetId}"]');
    if (el) el.${binding.name} = ${binding.expression.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&')};
  });`;
              } else {
                // Standard Attribute
                return `
  createEffect(() => {
    const el = root.querySelector('[data-pulse-id="${binding.targetId}"]');
    if (el) el.setAttribute('${binding.name}', ${binding.expression.replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&')});
  });`;
              }
            }
          }
        )
        .join('\n')}
  
  // Hydrate the app root (DOM + Components)
  // 'hydrate' is defined in the mount script and handles both hydrateDOM and mountPrimitives
  hydrate(root);

  
})();
</script>
      `,
      pageName,
      getHMRScript(this.config),
    );
  }

  private compileStatic(template: string, styleTag: string): string {
    const html = `${styleTag}\n${template}`;
    return wrapHTML(html, 'Pulse App', getHMRScript(this.config));
  }

  private serializeNode(node: ParsedNode): string {
    if (node.type === 'comment') return `<!--${node.content}-->`;
    if (node.type === 'text') return node.content || '';
    if (node.type === 'expression') return `{${node.content}}`;

    if (node.type === 'element') {
      let attrs = '';
      if (node.attributes) {
        node.attributes.forEach((val, key) => {
          // val can be string or ParsedExpression
          if (typeof val === 'string') {
            attrs += ` ${key}="${val.replaceAll('"', '&quot;')}"`;
          } else {
            // ParsedExpression - output without quotes to preserve expression type for TemplateTransformer
            attrs += ` ${key}={${val.code}}`;
          }
        });
      }

      const children = node.children ? node.children.map(c => this.serializeNode(c)).join('') : '';

      const voidElements = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
      if (node.tag && voidElements.has(node.tag.toLowerCase()) && !children) {
        return `<${node.tag}${attrs} />`;
      }

      return `<${node.tag}${attrs}>${children}</${node.tag}>`;
    }
    return '';
  }
}
