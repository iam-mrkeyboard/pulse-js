// ============================================================================
// FILE: src/server/compiler/component-compiler.ts
// Extracted from dev-server.ts - Component module compilation
// ============================================================================

import path from 'node:path';
import type { PulseConfig } from '../bundler/types';
import { ScriptParser } from './script-parser';
import { TemplateTransformer } from './template-transformer';
import { CSSScoper } from '../bundler/compiler/css-scoper';
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

  
  /** Escape a string so it is safe inside a JS template literal. */
  private escapeForTemplateLiteral(s: string): string {
    return s
      .replace(/\\/g, '\\\\')
      .replace(/`/g, '\\`')
      .replace(/\$\{/g, '\\${');
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
    // Extra core APIs the user script calls directly (createMemo, batch, …) unless imported.
    const importedNames = new Set(imports.flatMap((i) => i.names));
    const extraCore = ['createMemo', 'batch', 'onCleanup', 'untrack', 'createSelector', 'createRoot']
      .filter((name) => !importedNames.has(name) && new RegExp(`\\b${name}\\s*\\(`).test(scriptContent));
    const coreImports = ['createSignal', 'createEffect', ...extraCore].join(', ');

    let moduleCode = `
import { ${coreImports} } from 'pulse/runtime';
import { mountPrimitives as dom_mountPrimitives, walk } from 'pulse/runtime/dom';
${hasListPrimitive ? "import { List } from 'pulse/runtime/list';" : ''}
${hasShowPrimitive ? "import { Show } from 'pulse/runtime/show';" : ''}
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

        const scopeStack: Set<string>[] = [new Set()];
        const isLocal = (name: string) => {
          for (let i = scopeStack.length - 1; i >= 0; i--) {
            if (scopeStack[i].has(name)) return true;
          }
          return false;
        };
        const addParams = (params: any[]) => {
          for (const p of params || []) {
            if (p.type === 'Identifier') scopeStack[scopeStack.length - 1].add(p.name);
            else if (p.type === 'AssignmentPattern' && p.left?.type === 'Identifier') {
              scopeStack[scopeStack.length - 1].add(p.left.name);
            } else if (p.type === 'RestElement' && p.argument?.type === 'Identifier') {
              scopeStack[scopeStack.length - 1].add(p.argument.name);
            }
          }
        };
        const isFn = (n: any) =>
          n && (n.type === 'FunctionDeclaration' || n.type === 'FunctionExpression' || n.type === 'ArrowFunctionExpression');

        walk(ast as any, {
          enter(node: any, parent: any) {
            if (isFn(node)) {
              if (node.type === 'FunctionDeclaration' && node.id?.name) {
                scopeStack[scopeStack.length - 1].add(node.id.name);
              }
              scopeStack.push(new Set());
              if (node.id?.name && node.type !== 'FunctionDeclaration') {
                scopeStack[scopeStack.length - 1].add(node.id.name);
              }
              addParams(node.params);
            } else if (node.type === 'BlockStatement' && !isFn(parent)) {
              scopeStack.push(new Set());
            } else if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier') {
              scopeStack[scopeStack.length - 1].add(node.id.name);
            }

            if (node.type === 'Identifier') {
              if (allStateNames.has(node.name)) {
                if (isLocal(node.name)) return;
                // Avoid replacing definition key or property access
                if (parent && (
                  (parent.type === 'Property' && parent.key === node && !parent.computed) ||
                  (parent.type === 'MemberExpression' && parent.property === node && !parent.computed) ||
                  (parent.type === 'VariableDeclarator' && parent.id === node) ||
                  (parent.type === 'FunctionDeclaration' && parent.id === node) ||
                  (parent.type === 'FunctionExpression' && parent.id === node) ||
                  // Don't unwrap if it's the declaration we are transforming!
                  (parent.type === 'AssignmentPattern' && parent.left === node)
                )) return;

                let replacement;
                if (stateNames.has(node.name)) {
                  // Reads unwrap the signal (count -> get_count()). Writes keep the
                  // accessor name so an assignment is not turned into invalid syntax.
                  const isWrite = parent && (
                    (parent.type === 'AssignmentExpression' && parent.left === node) ||
                    parent.type === 'UpdateExpression'
                  );
                  // Explicit accessor calls (count()) keep their call: count() -> get_count().
                  const isCallee = parent && parent.type === 'CallExpression' && parent.callee === node;
                  replacement = isWrite || isCallee ? 'get_' + node.name : 'get_' + node.name + '()';
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
          },
          leave(node: any, parent: any) {
            if (isFn(node)) {
              scopeStack.pop();
            } else if (node.type === 'BlockStatement' && !isFn(parent)) {
              scopeStack.pop();
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

    // The static (innerHTML + ${props.x}) path cannot render child components or
    // script declarations, so anything using them goes through the binding path.
    const importsComponents = imports.some(i => i.names.some(n => /^[A-Z]/.test(n)));
    if (hasState || functions.length > 0 || declarations.length > 0 || importsComponents) {
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
_tpl.innerHTML = \`${this.escapeForTemplateLiteral(fullTemplateHTML)}\`;

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
      // Template bindings call state as \`name()\`; expose the accessor under that name.
      const declared = new Set([
        ...computedVars.map((c) => c.name),
        ...declarations.map((d) => d.name),
        ...functions.map((f) => f.name),
      ]);
      stateVars.forEach(({ name }) => {
        if (!declared.has(name) && /^[A-Za-z_$][\w$]*$/.test(name)) {
          moduleCode += `  const ${name} = get_${name};\n`;
        }
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
      // Add setters (inline handlers such as onClick={() => setOpen(!open)})
      stateVars.forEach(({ name, setterName }) => {
        const setter = setterName || `set_${name}`;
        if (!declared.has(setter)) moduleCode += `    ${setter}: ${setter}, \n`;
      });
      // Add props
      moduleCode += `    props: props, \n`; // Allow props access
      moduleCode += `    state: state, \n`;
      moduleCode += `  }; \n\n`;
      // Accessors for runtime-evaluated expressions (Show when / List each / inline
      // handlers), which the template transformer rewrites to \`count()\` form.
      const accessorEntries = [
        ...stateVars.map(({ name }) => `${name}: get_${name}`),
        ...computedVars.map(({ name }) => `${name}: ${name}`),
      ];
      moduleCode += `  Object.defineProperty(scope, '__accessors', { value: { ${accessorEntries.join(', ')} }, enumerable: false });\n\n`;

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
      moduleCode += `  container.__pulseHandlers = handlers;\n`;
      moduleCode += `  container.__pulseScope = scope;\n\n`;


      // Handle children/slots
      moduleCode += `  if (!props._hydrationNode && props.children && props.children.length > 0) {\n`;
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

      // Static components render props with ${props.x} inside an innerHTML template.

      moduleCode += `export default function ${componentName}(props = {}) {\n`;
      // Hydration: static markup is already correct; adopt the SSR node as-is.
      moduleCode += `  if (props._hydrationNode) {\n`;
      if (template.includes('onClick={')) {
        moduleCode += `    const b = props._hydrationNode.querySelector('button');\n`;
        moduleCode += `    if (b && typeof props.onClick === 'function') b.addEventListener('click', props.onClick);\n`;
      }
      moduleCode += `    return props._hydrationNode;\n  }\n`;
      // REMOVED random scopeId generation

      moduleCode += `  const container = document.createElement('div');\n`;
      moduleCode += `  container.classList.add('${scopeId}');\n`;
      moduleCode += `  container.className += ' pulse-component-${componentName.toLowerCase()}';\n\n`;

      // Serialize the parsed template (comments dropped, whitespace normalized,
      // `is:raw` children literal); {identifier} becomes a props interpolation.
      const processedTemplate = (templateNode.children || []).map((c) => this.serializeStatic(c)).join('');

      // Escape the markup first, then splice in the ${props.x} interpolations (escaping
      // afterwards would turn them into literal "${props.x}" text).
      const staticHTML = this.escapeForTemplateLiteral((scopedStyles ? `<style>${scopedStyles}</style>` : '') + processedTemplate)
        .replace(/\u0000PULSEPROP:(\w+)\u0000/g, (_m, name) => '${props.' + name + ' ?? ""}');
      moduleCode += `  container.innerHTML = \`${staticHTML}\`;

`;

      // Simple event handling for non-reactive components
      if (template.includes('onClick={')) {
        moduleCode += `  const button = container.querySelector('button');\n`;
        moduleCode += `  if (button && props.onClick) {\n`;
        moduleCode += `    button.addEventListener('click', props.onClick);\n`;
        moduleCode += `  }\n\n`;
      }

      // Slot handling
      moduleCode += `  if (!props._hydrationNode && props.children && props.children.length > 0) {\n`;
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

  /**
   * Serialize a parsed node for the static (innerHTML) component path.
   * `{identifier}` in text or attributes becomes a props interpolation marker
   * (spliced in after template-literal escaping); other expressions stay literal;
   * event attributes are omitted (bound separately); raw text is emitted verbatim.
   */
  private serializeStatic(node: ParsedNode): string {
    const PROP = (name: string) => `\u0000PULSEPROP:${name}\u0000`;
    if (node.type === 'comment') return '';
    if (node.type === 'text') return node.content || '';
    if (node.type === 'expression') {
      const code = (node.content || '').trim();
      return /^[A-Za-z_$][\w$]*$/.test(code) ? PROP(code) : `{${code}}`;
    }
    if (node.type === 'element') {
      let attrs = '';
      node.attributes?.forEach((val, key) => {
        if (/^on[A-Z]/.test(key) || key.startsWith('on:')) return;
        if (typeof val === 'string') {
          attrs += val === '' ? ` ${key}` : ` ${key}="${val.replaceAll('"', '&quot;')}"`;
        } else {
          const code = val.code.trim();
          attrs += /^[A-Za-z_$][\w$]*$/.test(code) ? ` ${key}="${PROP(code)}"` : '';
        }
      });
      const children = (node.children || []).map((c) => this.serializeStatic(c)).join('');
      const voidElements = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
      if (node.tag && voidElements.has(node.tag.toLowerCase()) && !children) {
        return `<${node.tag}${attrs} />`;
      }
      return `<${node.tag}${attrs}>${children}</${node.tag}>`;
    }
    return '';
  }
}
