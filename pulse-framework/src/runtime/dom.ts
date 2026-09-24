// ============================================================================
// FILE: src/runtime/dom-v2.ts
// Efficient DOM Runtime using Template Cloning and Path Traversal
// ============================================================================


const MAX_EXPR_CACHE = 256;
const exprCache = new Map<string, Function>();

/** Fallback eval for template expressions. Prefer compile-time emission. */
function safeEvalExpr(code: string, keys: string[], values: any[]): any {
  try {
    if (/\b(Function|eval|import\s*\(|process|require|globalThis)\b/.test(code)) {
      console.error('Pulse: blocked unsafe expression');
      return undefined;
    }
    const cacheKey = code + '||' + keys.join(',');
    let fn = exprCache.get(cacheKey);
    if (!fn) {
      if (exprCache.size >= MAX_EXPR_CACHE) {
        const first = exprCache.keys().next().value;
        if (first !== undefined) exprCache.delete(first);
      }
      const body = code.trim().startsWith('return') ? code : `return (${code})`;
      fn = new Function(...keys, body);
      exprCache.set(cacheKey, fn);
    }
    return fn(...values);
  } catch (e) {
    console.error('Pulse Binding Error:', code, e);
    return undefined;
  }
}

import { createEffect, type Accessor } from './core.js';
import { P_LIST, P_SHOW, P_KEY, markKey, markRoot } from './ssr-markers.js';

// ----------------------------------------------------------------------------
// Template Management
// ----------------------------------------------------------------------------

const templateCache = new Map<string, HTMLTemplateElement>();

export function template(html: string): () => Node {
  return () => {
    let t = templateCache.get(html);
    if (!t) {
      t = document.createElement('template');
      t.innerHTML = html;
      templateCache.set(html, t);
    }
    return t.content.cloneNode(true);
  };
}

// ----------------------------------------------------------------------------
// Path Traversal
// ----------------------------------------------------------------------------

export function walk(root: Node, path: number[]): Node {
  let el = root;
  for (const index of path) {
    // For template clones, looking at content vs just node
    // Usually root is a DocumentFragment from cloneNode(true).
    // So we treat root as the fragment.

    // Safety check
    if (!el) throw new Error(`Pulse Runtime: Invalid path traversal at index ${index}`);

    // We assume compiled paths use childNodes access
    el = el.childNodes[index];
  }
  return el;
}

// ----------------------------------------------------------------------------
// DOM Operations
// ----------------------------------------------------------------------------

// Robust Insert
export function insert(parent: Node, accessor: Accessor<any>, marker: Node | null = null) {
  let current: Node | Array<Node> | string = '';
  let currentNode: Node | null = null; // Track the DOM node we created

  createEffect(() => {
    const value = accessor();

    // Case 1: Simple Text/Number
    if (typeof value === 'string' || typeof value === 'number') {
      const str = String(value);
      if (current === str && currentNode) return;

      // If we already have a text node, update it
      if (currentNode && currentNode.nodeType === 3) {
        currentNode.nodeValue = str;
      } else {
        // Replace whatever we had with a new text node
        const newNode = document.createTextNode(str);
        if (currentNode) {
          parent.replaceChild(newNode, currentNode);
        } else {
          parent.insertBefore(newNode, marker);
        }
        currentNode = newNode;
      }
      current = str;
    }
    // Case 2: Null/Undefined (Clear)
    else if (value === null || value === undefined) {
      if (currentNode) {
        parent.removeChild(currentNode);
        currentNode = null;
      }
      current = '';
    }
  });
}

// Simplified 'insert' for Phase 2 starter.
// This version handles Text updates efficiently, which is 90% of use cases.
export function text(node: Node, accessor: Accessor<any>) {
  createEffect(() => {
    const value = accessor();
    node.textContent = String(value);
  });
}

export function setAttribute(node: Element, name: string, accessor: Accessor<any>) {
  createEffect(() => {
    const value = accessor();
    if (value === null || value === undefined) {
      node.removeAttribute(name);
    } else {
      node.setAttribute(name, String(value));
    }
  });
}

export function on(node: Node, eventName: string, handler: (e: Event) => void) {
  node.addEventListener(eventName, handler);
}

// ----------------------------------------------------------------------------
// Control Flow (For future Phase)
// ----------------------------------------------------------------------------

// ----------------------------------------------------------------------------
// Primitives Mounting (List, Show)
// ----------------------------------------------------------------------------

export function mountPrimitives(
  container: HTMLElement,
  scope: any,
  primitives: { List: any, Show: any, createEffect: any, components?: any },
  templates: Record<string, string> = {}
) {
  // console.log('Pulse [mountPrimitives]', container, primitives);
  if (!container) return;

  // Mount Lists
  if (primitives.List) {
    const lists = container.querySelectorAll('pulse-list');
    lists.forEach(el => {
      const eachExpr = el.getAttribute('each');
        const keyAttr = el.getAttribute('key');
      const asVar = el.getAttribute('as') || 'item';
      const templateId = el.getAttribute('data-template-id');
      const bindingsStr = el.getAttribute('data-bindings');

      const inlineTpl = el.querySelector('template[data-pulse-template], template');
      const templateHtml = (templateId && templates[templateId])
        || (inlineTpl ? inlineTpl.innerHTML : '')
        || '';
      if (eachExpr && templateHtml) {
        const bindings = bindingsStr ? JSON.parse(bindingsStr) : [];

        // Evaluate 'each' expression
        // We need to evaluate it in the context of 'scope'. 
        // scope has getters for state.
        const getEach = () => {
          try {
            // Create a function that returns the expression value using scope
            const scopeKeys = Object.keys(scope);
            const scopeValues = scopeKeys.map(k => scope[k]);
            let result = safeEvalExpr(eachExpr.replace(/^{(.*)}$/, '$1'), scopeKeys, scopeValues);
            // Unwrap signal accessors: each="{items}" where items is () => T[]
            if (typeof result === 'function') result = result();
            return Array.isArray(result) ? result : [];
          } catch (e) {
            console.error('Pulse: Failed to evaluate List each:', eachExpr, e);
            return [];
          }
        };

        const keyFn = keyAttr
          ? (item: any, index: number) => {
              const scopeKeys = Object.keys(scope);
              const scopeValues = scopeKeys.map(k => scope[k]);
              const asName = asVar;
              const keys = [...scopeKeys, asName, 'index'];
              const values = [...scopeValues, item, index];
              const expr = keyAttr.startsWith('{') && keyAttr.endsWith('}')
                ? keyAttr.slice(1, -1)
                : (keyAttr.includes('.') || keyAttr.includes('(') ? keyAttr : `${asName}.${keyAttr}`);
              return safeEvalExpr(expr, keys, values);
            }
          : undefined;

        // Adopt existing SSR rows (skip <template>)
        const initialNodes = Array.from(el.childNodes).filter(
          (n) => n.nodeType === Node.ELEMENT_NODE && (n as HTMLElement).tagName !== 'TEMPLATE'
        );

        el.setAttribute('data-p-list', '1');

        primitives.List({
          each: getEach,
          key: keyFn,
          host: el,
          initialNodes,
          children: (item: any, index: number) => {
            const t = document.createElement('template');
            t.innerHTML = templateHtml;
            const clone = t.content.cloneNode(true);

            bindings.forEach((b: any) => {
              const target = walk(clone, b.path);
              if (!target) return;

              const run = () => {
                try {
                  const scopeKeys = Object.keys(scope);
                  const scopeValues = scopeKeys.map(k => scope[k]);
                  const keys = [...scopeKeys, asVar, 'index'];
                  const values = [...scopeValues, item, index];
                  return safeEvalExpr(b.expr, keys, values);
                } catch (e) {
                  return '';
                }
              };

              primitives.createEffect(() => {
                const value = run();
                if (b.type === 'text') {
                  target.textContent = String(value);
                } else if (b.type === 'attribute') {
                  if (b.name === 'value' || b.name === 'checked') {
                    (target as any)[b.name] = value;
                  } else {
                    (target as Element).setAttribute(b.name, String(value));
                  }
                }
              });
            });

            const node = (clone as DocumentFragment).firstElementChild || clone;
            if (keyFn && node instanceof Element) {
              try { markKey(node, keyFn(item, index)); } catch {}
            }
            return node;
          }
        });
        // Keep pulse-list host in the tree (SSR/hydration identity)
      }
    });
  }

  // Mount Shows (Basic implementation)
  if (primitives.Show) {
    const shows = container.querySelectorAll('pulse-show');
    shows.forEach(el => {
      const whenExpr = el.getAttribute('when');
      const fallbackExpr = el.getAttribute('fallback');
      const templateEl = el.querySelector('template[data-pulse-template]');

      if (whenExpr && templateEl) {
        const content = templateEl.innerHTML;

        const getWhen = () => {
          try {
            const scopeKeys = Object.keys(scope);
            const scopeValues = scopeKeys.map(k => scope[k]);
            let result = safeEvalExpr(whenExpr.replace(/^{(.*)}$/, '$1'), scopeKeys, scopeValues);
            if (typeof result === 'function') result = result();
            return result;
          } catch (e) { return false; }
        };

        const initialNodes = Array.from(el.childNodes).filter(
          (n) => n.nodeType === Node.ELEMENT_NODE && (n as HTMLElement).tagName !== 'TEMPLATE'
        );

        el.setAttribute('data-p-show', '1');

        primitives.Show({
          when: getWhen,
          host: el,
          initialNodes,
          fallback: fallbackExpr ? () => document.createTextNode(fallbackExpr || '') : undefined,
          children: () => {
            const t = document.createElement('template');
            t.innerHTML = content;
            const clone = t.content.cloneNode(true);
            return (clone as DocumentFragment).firstElementChild || clone;
          }
        });
        // Keep pulse-show host (adopt SSR branch)
      }
    });
  }

  // Mount Components (e.g. Navbar)
  if (primitives.components) {
    const componentEls = container.querySelectorAll('[data-pulse-component]');
    componentEls.forEach(el => {
      const componentName = el.getAttribute('data-pulse-component');
      if (!componentName) return;

      const Component = primitives.components[componentName];
      if (Component && typeof Component === 'function') {
        // Collect Props
        const props: any = {};
        Array.from(el.attributes).forEach(attr => {
          if (attr.name.startsWith('data-pulse-')) return;
          if (attr.name === 'style') return;
          props[attr.name] = attr.value;
        });

        // Handle Children
        const templateEl = el.querySelector('template[data-pulse-template]');
        if (templateEl) {
          const t = document.createElement('template');
          t.innerHTML = templateEl.innerHTML;
          props.children = Array.from(t.content.cloneNode(true).childNodes);
        }

        try {
          // Instantiate Component
          // Component returns a DOM Node (wrapper div usually)
          const componentNode = Component(props);
          if (componentNode) {
            el.replaceWith(componentNode);
          }
        } catch (e) {
          console.error(`Pulse: Failed to mount component ${componentName}:`, e);
        }
      }
    });
  }


} // End mountPrimitives

// ----------------------------------------------------------------------------
// Global Event Delegation
// ----------------------------------------------------------------------------
const DELEGATED_EVENTS = ['click', 'input', 'change', 'submit', 'keydown', 'keyup', 'focus', 'blur'];

function handleEvent(event: Event) {
  // console.log('Pulse [Event]:', event.type, event.target);
  let target = event.target as HTMLElement | null;

  const eventName = event.type.toLowerCase();
  const dataAttr = `data-on-${eventName}`;

  // Bubble up
  while (target && target !== document.body) {
    if (target.hasAttribute(dataAttr)) {
      const handlerName = target.getAttribute(dataAttr);
      // Find component root with handlers
      let root = target;
      while (root && !(root as any).__pulseHandlers) {
        if (root.parentElement) root = root.parentElement;
        else break;
      }

      if (root && (root as any).__pulseHandlers) {
        const handlers = (root as any).__pulseHandlers;
        const handler = handlers[handlerName!];

        if (handler && typeof handler === 'function') {
          handler(event);
          // Stop propagation if strict? Maybe not, usually allow unless handler stops it.
          // But since we delegated, we found our handler.
          return;
        } else {
          console.warn(`Pulse: Handler '${handlerName}' not found on component`, root);
        }
      }
    }
    target = target.parentElement as HTMLElement | null;
  }
}

// Hydration Helper (prefer runtime/hydration.ts for full adopt-and-bind API)
export function hydrateDOM(Component: any, container: HTMLElement) {
  const hydrationRoot = container.firstElementChild as HTMLElement | null;
  if (hydrationRoot) {
    Component({ _hydrationNode: hydrationRoot });
  } else {
    console.warn('Pulse Hydration: No SSR root found, falling back to mount.');
    const node = Component();
    container.appendChild(node);
  }
}

// Initialize Delegation
if (typeof window !== 'undefined') {
  DELEGATED_EVENTS.forEach(evt => {
    document.addEventListener(evt, handleEvent, { capture: false, passive: false });
  });
}

