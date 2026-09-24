// ============================================================================
// FILE: src/server/compiler/component-compiler.ts
// Extracted from dev-server.ts - Component module compilation
// ============================================================================

import path from 'node:path';
import type { PulseConfig } from '../bundler/types';
import { ScriptParser } from './script-parser';
import { TemplateTransformer } from './template-transformer';
import { CSSScoper } from '../bundler/compiler/css-scoper';
import { getMountScript } from './mount-script-generator';
import { UnifiedParser } from '../bundler/compiler/unified-parser';
import { type ParsedNode } from '../bundler/compiler/html-parser';
import * as acorn from 'acorn';
import { walk } from 'estree-walker';

export class ComponentCompiler {
  private config: PulseConfig;
  private scriptParser: ScriptParser;
  private templateTransformer: TemplateTransformer;
  private unifiedParser: UnifiedParser;

  constructor(config: PulseConfig, scriptParser: ScriptParser, templateTransformer: TemplateTransformer) {
    this.config = config;
    this.scriptParser = scriptParser;
    this.templateTransformer = templateTransformer;
    this.unifiedParser = new UnifiedParser();
  }

  public async compile(filePath: string, content: string): Promise<string> {
    let componentName = path.basename(filePath, '.pulse');
    // Sanitize to valid JS identifier
    componentName = componentName.replace(/[^a-zA-Z0-9_$]/g, '_');
    if (/^[0-9]/.test(componentName)) componentName = '_' + componentName;

    // Parse (Unified AST)
    const ast = this.unifiedParser.parse(content, filePath);

    let styles = '';
    let scriptContent = '';
    let template = '';
    let templateNode: ParsedNode; // Strict typing

    if (ast.styles.type === 'valid') styles = ast.styles.code;
    if (ast.script.type === 'valid') scriptContent = ast.script.code;

    if (ast.template.type === 'valid') {
      template = ast.template.code;
      templateNode = ast.template.ast;
    } else {
      templateNode = { type: 'element', tag: 'root', children: [] } as any;
    }

    styles = styles.trim();
    scriptContent = scriptContent.trim();
    template = template.trim();

    // We need to identify declarations vs state.
    const { stateVars, computedVars, functions, declarations, imports } = this.scriptParser.parse(scriptContent);

    if (this.config.debug) {
      console.log(`[ComponentCompiler] ${componentName} - StateVars found:`, stateVars.map(v => v.name));
    }

    // Check for primitives
    const hasListPrimitive = template.includes('<List') || template.includes('data-pulse-list'); // check raw code
    const hasShowPrimitive = template.includes('<Show') || template.includes('data-pulse-show');

    // Build module code
    let moduleCode = `
import { createSignal, createEffect } from '/runtime/core.js';
import { mountPrimitives as dom_mountPrimitives, walk } from '/runtime/dom.js';
${hasListPrimitive ? "import { List } from '/runtime/primitives/list.js';" : ''}
${hasShowPrimitive ? "import { Show } from '/runtime/primitives/show.js';" : ''}
${imports.map(i => {
      // reconstruct import statement
      if (i.isDefault) {
        return `import ${i.names[0]} from '${i.source}';`;
      } else {
        return `import { ${i.names.join(', ')} } from '${i.source}';`;
      }
    }).join('\n')}

`;

    // State detection

    // Create sets for fast lookup
    const stateNames = new Set(stateVars.map(s => s.name));
    const computedNames = new Set(computedVars.map(c => c.name));
    const allStateNames = new Set([...stateNames, ...computedNames]);

    // Helper to transform user code (unwrap signals)
    const transformUserCode = (codeFragment: string) => {
      if (allStateNames.size === 0) return codeFragment;
      try {
        const ast = acorn.parse(codeFragment, { ecmaVersion: 2022, sourceType: 'module' });
        // Use estree-walker to find identifiers
        let magicString = codeFragment;
        const replacements: { start: number, end: number, value: string }[] = [];

        walk(ast as any, {
          enter(node: any, parent: any) {
            if (node.type === 'Identifier') {
              if (allStateNames.has(node.name)) {
                // Avoid replacing definition key or property access
                if (parent && (
                  (parent.type === 'Property' && parent.key === node && !parent.computed) ||
                  (parent.type === 'MemberExpression' && parent.property === node && !parent.computed) ||
                  (parent.type === 'VariableDeclarator' && parent.id === node) ||
                  (parent.type === 'FunctionDeclaration' && parent.id === node) ||
                  // Don't unwrap if it's the declaration we are transforming!
                  (parent.type === 'AssignmentPattern' && parent.left === node)
                )) return;

                let replacement;
                if (stateNames.has(node.name)) {
                  replacement = 'get_' + node.name;
                } else {
                  // Computed: just use name (it's the function name)
                  replacement = node.name;
                }

                replacements.push({
                  start: node.start,
                  end: node.end,
                  value: replacement
                });
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
        // console.error('Transform error', e);
        // If parse fails (e.g. partial code), return original for now, but usually code fragments are full statements.
        // Or rethrow if it's our error.
        if (e instanceof Error && e.message.startsWith('Pulse Error')) throw e;
        return codeFragment;
      }
    };

    const hasState = stateVars.length > 0 || computedVars.length > 0;

    // Generate deterministic scope ID based on component name (and content length for uniqueness if needed, but simple name is fine for now if unique)
    // For HMR/uniqueness across projects, we usually need a hash. 
    // For now, let's use a simple distinct hash of the name.
    const simpleHash = componentName.split('').reduce((a, b) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a }, 0);
    const scopeId = `data-v-${Math.abs(simpleHash).toString(36)}`;

    // Prepare styles and template ONCE
    // Scope CSS
    let scopedStyles = '';
    if (styles) {
      const cssScoper = new CSSScoper();
      scopedStyles = cssScoper.scope(styles, scopeId, template);
      // Remove caching issues by NOT re-scoping every render
    }

    if (hasState || functions.length > 0) {
      // ---------------------------------------------------------
      // STATEFUL COMPONENT
      // ---------------------------------------------------------

      // 1. Top Level Template (Use AST Node!)
      const { html, bindings, templates } = this.templateTransformer.transform(templateNode, [...stateVars, ...computedVars], imports.flatMap(i => i.names).filter(n => /^[A-Z]/.test(n)), declarations);
      // We wrap the HTML in a container with the scope ID
      // This template is created ONCE at module level
      const fullTemplateHTML = `${scopedStyles ? `<style>${scopedStyles}</style>` : ''}<div class="${scopeId} pulse-component-${componentName.toLowerCase()}">${html}</div>`;

      moduleCode += `
// Static Template
const _tpl = document.createElement('template');
_tpl.innerHTML = \`${fullTemplateHTML.replaceAll('`', '\\`')}\`; // Escape backticks

export default function ${componentName}(props) {
  props = props || {};
  
  // Hydration Adoption
  let container;
  if (props._hydrationNode) {
    container = props._hydrationNode;
  } else {
    // Clone Node (Fast Instantiation)
    const root = _tpl.content.cloneNode(true);
    container = root.querySelector('div'); // The wrapper div
  }
  
  // We need to return 'container' but make sure we keep the style tag if it's there (it's in the Fragment)
  // Actually, 'root' is a DocumentFragment.
  // If we return 'container', we lose the style tag if it's a sibling.
  // But wait, <style> inside <template> is fine.
  // If we return 'container' (the div), and the style is *inside* it? No, style is sibling usually in my string.
  // Let's put style INSIDE the wrapper div to be safe and portable?
  // Current logic: innerHTML = style + html. 
  // If html is many nodes, container wraps them.
  // So style + html are children of container.
  // YES. My fullTemplateHTML above wraps style AND html in the div. Correct.

`;

      // Reactive state - Use user's setter name if available
      stateVars.forEach(({ name, value, setterName }) => {
        const setter = setterName || `set_${name}`;
        moduleCode += `  const [get_${name}, ${setter}] = createSignal(${value});\n`;
      });

      // Emit Computed Vars
      computedVars.forEach((cv) => {
        const transformedCode = transformUserCode(cv.code);
        moduleCode += `  ${transformedCode}\n`;
      });

      // Emit Declarations
      declarations.forEach((d) => {
        const transformedCode = transformUserCode(d.code);
        moduleCode += `  ${transformedCode}\n`;
      });

      // Emit Functions
      functions.forEach((f) => {
        const transformedCode = transformUserCode(f.code);
        moduleCode += `  ${transformedCode}\n`;
      });

      moduleCode += `  const state = {\n`;
      stateVars.forEach(({ name, setterName }) => {
        const setter = setterName || `set_${name}`;
        moduleCode += `    get ${name}() { return get_${name}(); },\n`;
        moduleCode += `    set ${name}(v) { ${setter}(v); },\n`;
      });
      // Add computed to state (read-only)
      computedVars.forEach(({ name }) => {
        moduleCode += `    get ${name}() { return ${name}(); },\n`;
      });
      moduleCode += `  };\n\n`;



      // Scope Construction for Runtime
      moduleCode += `  const scope = { \n`;
      // state getters
      stateVars.forEach(({ name }) => {
        moduleCode += `    get ${name}() { return get_${name} (); }, \n`;
      });
      // computed getters
      computedVars.forEach(({ name }) => {
        moduleCode += `    get ${name}() { return ${name}(); }, \n`;
      });
      // Add functions
      functions.forEach(({ name }) => {
        moduleCode += `    ${name}: ${name}, \n`;
      });
      // Add declarations
      declarations.forEach(({ name }) => {
        moduleCode += `    ${name}: ${name}, \n`;
      });
      // Add props
      moduleCode += `    props: props, \n`; // Allow props access
      moduleCode += `  }; \n\n`;

      // Mount primitives helper using Runtime
      moduleCode += `  const mountPrimitives = (cont) => {
\n`;

      // Serialize templates for runtime
      const serializedTemplates = JSON.stringify(Object.fromEntries(templates));

      moduleCode += `    dom_mountPrimitives(cont, scope, { \n`; // Pass scope object
      moduleCode += `       List: ${hasListPrimitive ? 'List' : 'undefined'}, \n`;
      moduleCode += `       Show: ${hasShowPrimitive ? 'Show' : 'undefined'}, \n`;
      moduleCode += `       createEffect: createEffect, \n`;
      // Pass components safely. components object is not defined yet??
      // Imports are top level.
      // We need to pass the component functions.
      // The runtime expects { name: CompFn }
      const componentImports = imports.filter(i => /^[A-Z]/.test(i.names[0]));
      if (componentImports.length > 0) {
        moduleCode += `       components: { \n`;
        componentImports.forEach(i => {
          moduleCode += `         ${i.names[0]}: ${i.names[0]}, \n`;
        });
        moduleCode += `       }\n`;
      }
      moduleCode += `    }, ${serializedTemplates}); \n`;
      moduleCode += `  }; \n\n`;


      if (componentName === 'form') {
        console.log(`[ComponentCompiler] Form bindings count: `, bindings.length);
      }

      // NO innerHTML here! We already cloned.

      // Reactive bindings
      // Reactive bindings
      bindings.forEach((binding) => {
        const pathStr = JSON.stringify(binding.path);

        if (binding.type === 'text') {
          moduleCode += `  createEffect(() => {\n`;
          // Use walk to find node
          moduleCode += `    const el = walk(container, ${pathStr});\n`;
          moduleCode += `    if (el) el.textContent = String(${binding.expression});\n`;
          moduleCode += `  });\n\n`;
        } else {
          // Attribute/Property binding
          moduleCode += `  createEffect(() => {\n`;
          moduleCode += `    const el = walk(container, ${pathStr});\n`;
          // Use property assignment for value/checked to ensure UI updates correctly
          if (binding.name === 'value' || binding.name === 'checked' || binding.name === 'disabled') {
            moduleCode += `    if (el) el.${binding.name} = ${binding.expression};\n`;
          } else {
            moduleCode += `    if (el) el.setAttribute('${binding.name}', ${binding.expression});\n`;
          }
          moduleCode += `  });\n\n`;
        }
      });

      // Event handlers - DELEGATION OPTIMIZATION
      moduleCode += `  const handlers = { ${functions.map((f) => `${f.name}: ${f.name}`).join(', ')} };\n`;
      moduleCode += `  container.__pulseHandlers = handlers;\n\n`;


      // Handle children/slots
      moduleCode += `  if (props.children && props.children.length > 0) {\n`;
      moduleCode += `    const slotEl = container.querySelector('slot');\n`;
      moduleCode += `    if (slotEl) {\n`;
      moduleCode += `      const fragment = document.createDocumentFragment();\n`;
      moduleCode += `      props.children.forEach(child => {\n`;
      moduleCode += `        if (child instanceof Node) fragment.appendChild(child.cloneNode(true));\n`;
      moduleCode += `      });\n`;
      moduleCode += `      slotEl.replaceWith(fragment);\n`;
      moduleCode += `    } else {\n`;
      moduleCode += `      props.children.forEach(child => {\n`;
      moduleCode += `        if (child instanceof Node) container.appendChild(child.cloneNode(true));\n`;
      moduleCode += `      });\n`;
      moduleCode += `    }\n`;
      moduleCode += `  }\n\n`;

      moduleCode += `  mountPrimitives(container);\n`;
      moduleCode += `  if (container && container.setAttribute) container.setAttribute('data-p-h', '1');\n`;
      moduleCode += `  return container;\n`;
      moduleCode += `}\n`;
    } else {
      // ---------------------------------------------------------
      // STATIC COMPONENT
      // ---------------------------------------------------------

      const simpleHash = componentName.split('').reduce((a, b) => { a = ((a << 5) - a) + b.charCodeAt(0); return a & a }, 0);
      const scopeId = `data-v-${Math.abs(simpleHash).toString(36)}`;

      let scopedStyles = '';
      if (styles) {
        const cssScoper = new CSSScoper();
        scopedStyles = cssScoper.scope(styles, scopeId, template);
      }

      // Process props in template (simple regex replace on the static string)
      // Since it's static, we can bake it into the template string BUT it has ${props.x}
      // which needs evaluation at runtime.
      // So we can't fully staticize the HTML if it has prop interpolations baked in as ${}.
      // UNLESS we use a function to generate the HTML.
      // OR we use the same bindings approach as stateful?
      // For now, to keep it simple and consistent with previous "Static" logic:
      // We will keep the `innerHTML` approach for Static components because they might rely on 
      // simple JS interpolation `${props.foo}` which `cloneNode` doesn't support (it needs bindings).
      // BUT we can still fix the SCOPE ID randomness!

      // Update: The plan demanded scope ID stability. We achieved that above.
      // So detailed rework of static component logic is secondary, but let's at least fix scope ID.

      moduleCode += `export default function ${componentName}(props = {}) {\n`;
      // REMOVED random scopeId generation

      moduleCode += `  const container = document.createElement('div');\n`;
      moduleCode += `  container.classList.add('${scopeId}');\n`;
      moduleCode += `  container.className += ' pulse-component-${componentName.toLowerCase()}';\n\n`;

      // Process template...
      let processedTemplate = template;
      let result = '';
      let lastIndex = 0;
      for (let i = 0; i < processedTemplate.length; i++) {
        if (processedTemplate[i] === '{') {
          const close = processedTemplate.indexOf('}', i);
          if (close !== -1) {
            const prop = processedTemplate.slice(i + 1, close);
            // Manual alphanumeric check
            let isWord = true;
            if (prop.length === 0) isWord = false;
            for (let j = 0; j < prop.length; j++) {
              const c = prop.charCodeAt(j);
              if (!(
                (c >= 48 && c <= 57) || // 0-9
                (c >= 65 && c <= 90) || // A-Z
                (c >= 97 && c <= 122) || // a-z
                (c === 95) // _
              )) {
                isWord = false;
                break;
              }
            }
            if (isWord) {
              result += processedTemplate.slice(lastIndex, i);
              result += '${props.' + prop + ' || ""}';
              i = close;
              lastIndex = i + 1;
            }
          }
        }
      }
      result += processedTemplate.slice(lastIndex);
      processedTemplate = result;

      moduleCode += `  container.innerHTML = \`${scopedStyles ? `<style>${scopedStyles}</style>` : ''}${processedTemplate}\`;\n\n`;

      // Simple event handling for non-reactive components
      if (template.includes('onClick={')) {
        moduleCode += `  const button = container.querySelector('button');\n`;
        moduleCode += `  if (button && props.onClick) {\n`;
        moduleCode += `    button.addEventListener('click', props.onClick);\n`;
        moduleCode += `  }\n\n`;
      }

      // Slot handling
      moduleCode += `  if (props.children && props.children.length > 0) {\n`;
      moduleCode += `    const slotEl = container.querySelector('slot');\n`;
      moduleCode += `    if (slotEl) {\n`;
      moduleCode += `      const fragment = document.createDocumentFragment();\n`;
      moduleCode += `      props.children.forEach(child => {\n`;
      moduleCode += `        if (child instanceof Node) fragment.appendChild(child.cloneNode(true));\n`;
      moduleCode += `      });\n`;
      moduleCode += `      slotEl.replaceWith(fragment);\n`;
      moduleCode += `    } else {\n`;
      moduleCode += `      props.children.forEach(child => {\n`;
      moduleCode += `        if (child instanceof Node) container.appendChild(child.cloneNode(true));\n`;
      moduleCode += `      });\n`;
      moduleCode += `    }\n`;
      moduleCode += `  }\n\n`;

      moduleCode += `  return container;\n`;
      moduleCode += `}\n`;
    }

    return moduleCode;
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
