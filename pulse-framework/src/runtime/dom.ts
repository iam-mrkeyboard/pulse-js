// ============================================================================
// FILE: src/runtime/dom-v2.ts
// Efficient DOM Runtime using Template Cloning and Path Traversal
// ============================================================================

import { createEffect, type Accessor } from './core.js';

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
      const asVar = el.getAttribute('as') || 'item';
      const templateId = el.getAttribute('data-template-id');
      const bindingsStr = el.getAttribute('data-bindings');

      if (eachExpr && templateId && templates[templateId]) {
        const templateHtml = templates[templateId];
        const bindings = bindingsStr ? JSON.parse(bindingsStr) : [];

        // Evaluate 'each' expression
        // We need to evaluate it in the context of 'scope'. 
        // scope has getters for state.
        const getEach = () => {
          try {
            // Create a function that returns the expression value using scope
            const scopeKeys = Object.keys(scope);
            const scopeValues = scopeKeys.map(k => scope[k]);
            const fn = new Function(...scopeKeys, `return ${eachExpr.replace(/^{(.*)}$/, '$1')}`);
            return fn(...scopeValues);
          } catch (e) {
            console.error('Pulse: Failed to evaluate List each:', eachExpr, e);
            return [];
          }
        };

        const listNode = primitives.List({
          each: getEach,
          children: (item: any, index: number) => {
            // Clone template
            // We can use the exported template function if we want, or just manual
            const t = document.createElement('template');
            t.innerHTML = templateHtml;
            const clone = t.content.cloneNode(true);

            // Apply bindings
            // bindings is array of { type: 'text'|'attribute', path: number[], expr: string, name?: string }
            bindings.forEach((b: any) => {
              const target = walk(clone, b.path);
              if (!target) return;

              // Eval expression with item and index
              const run = () => {
                try {
                  const scopeKeys = Object.keys(scope);
                  const scopeValues = scopeKeys.map(k => scope[k]);
                  // Add item and index to scope
                  const keys = [...scopeKeys, asVar, 'index'];
                  const values = [...scopeValues, item, index];

                  const fn = new Function(...keys, `return ${b.expr}`);
                  return fn(...values);
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

            // console.log('Pulse [dom] Clone created:', clone);
            return (clone as DocumentFragment).firstElementChild || clone;
          }
        });

        el.replaceWith(listNode);
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
            const fn = new Function(...scopeKeys, `return ${whenExpr.replace(/^{(.*)}$/, '$1')}`);
            return fn(...scopeValues);
          } catch (e) { return false; }
        };

        const showNode = primitives.Show({
          when: getWhen,
          fallback: fallbackExpr ? () => document.createTextNode(fallbackExpr || '') : undefined, // Todo: support element fallback
          children: () => {
            const t = document.createElement('template');
            t.innerHTML = content;
            const clone = t.content.cloneNode(true);
            return (clone as DocumentFragment).firstElementChild || clone;
            // Note: Bindings inside Show are not fully handled here recursively yet.
            // This assumes strict separation or verifying children bindings.
            // For now, this mounts the static content of Show.
          }
        });


        el.replaceWith(showNode);
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

// Hydration Helper
export function hydrate(Component: any, container: HTMLElement) {
  // We assume the SSR output rendered the component as the first child of the container
  const hydrationRoot = container.firstElementChild;
  if (hydrationRoot) {
    // Pass the existing root as _hydrationNode to the component
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

