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
import { P_LIST, P_SHOW, P_KEY, P_COMPONENT, P_PROPS, markKey, markRoot } from './ssr-markers.js';

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

/**
 * Names/values for evaluating compiled template expressions against a component
 * scope. The compiler rewrites state reads to accessor calls (`count()`), so state
 * and computed entries resolve to their accessor (from the non-enumerable
 * `scope.__accessors`); everything else (functions, setters, declarations, props)
 * resolves to its value. Scopes without `__accessors` keep plain value semantics.
 */
function scopeEntries(scope: any): { keys: string[]; values: any[] } {
  const keys = Object.keys(scope || {});
  const acc = (scope && scope.__accessors) || null;
  const values = keys.map((k) => (acc && Object.prototype.hasOwnProperty.call(acc, k) ? acc[k] : scope[k]));
  return { keys, values };
}

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

/** walk() that returns null instead of throwing; descends into <template> / <pulse-show> template content. */
function safeWalk(root: Node, path: number[]): Node | null {
  let el: Node | null = root;
  for (const index of path) {
    if (!el) return null;
    // Compiled paths index a <pulse-show>'s children as its template's content.
    const tag = (el as any).tagName;
    let holder: Node = el;
    if (tag === 'TEMPLATE') holder = (el as HTMLTemplateElement).content;
    else if (tag === 'PULSE-SHOW') {
      const tpl = Array.from((el as Element).children).find((c) => c.tagName === 'TEMPLATE') as HTMLTemplateElement | undefined;
      if (tpl) holder = tpl.content;
    }
    el = holder.childNodes[index] || null;
  }
  return el;
}

/** True when `el` is not nested inside another List/Show owned by `container`. */
function ownedByContainer(el: Element, container: Element | DocumentFragment): boolean {
  let p = el.parentElement;
  while (p && p !== container) {
    const tag = p.tagName;
    if (tag === 'PULSE-LIST') return false;
    p = p.parentElement;
  }
  return true;
}

/**
 * Replace `[data-pulse-component]` placeholders under `root` with freshly rendered
 * component roots (fresh render, or content a Show/List creates later).
 */
function mountFreshComponents(root: ParentNode, components: Record<string, any> | undefined) {
  if (!components || !root || !(root as any).querySelectorAll) return;
  const componentEls = root.querySelectorAll('[data-pulse-component]');
  componentEls.forEach(el => {
    const componentName = el.getAttribute('data-pulse-component');
    if (!componentName) return;

    const Component = components[componentName];
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
          // Remember which component rendered here so hydration can adopt it later
          // (SSR serializes this attribute; the placeholder itself is gone).
          if (componentNode instanceof Element) {
            (componentNode as any).__pulseAdopted = true;
            componentNode.setAttribute(P_COMPONENT, componentName);
            if (Object.keys(props).some((k) => k !== 'children')) {
              const { children: _c, ...plain } = props;
              componentNode.setAttribute(P_PROPS, JSON.stringify(plain));
            }
          }
          el.replaceWith(componentNode);
        }
      } catch (e) {
        console.error(`Pulse: Failed to mount component ${componentName}:`, e);
      }
    }
  });
}

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
      if (!ownedByContainer(el, container)) return;
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
            const { keys: scopeKeys, values: scopeValues } = scopeEntries(scope);
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
              const { keys: scopeKeys, values: scopeValues } = scopeEntries(scope);
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

        // Row scope: page scope (getters + accessors preserved) plus the item/index.
        const rowScopeFor = (item: any, index: number) => {
          const rowScope: any = Object.defineProperties({}, Object.getOwnPropertyDescriptors(scope || {}));
          rowScope[asVar] = item;
          rowScope.index = index;
          return rowScope;
        };

        const bindRow = (resolve: (path: number[]) => Node | null, rowRoot: Element | DocumentFragment, item: any, index: number) => {
          bindings.forEach((b: any) => {
            const target = resolve(b.path);
            if (!target) return;

            const run = () => {
              try {
                const { keys: scopeKeys, values: scopeValues } = scopeEntries(scope);
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

          const eventEls: Element[] = [];
          if (rowRoot instanceof Element) eventEls.push(rowRoot);
          if ((rowRoot as ParentNode).querySelectorAll) {
            eventEls.push(...Array.from((rowRoot as ParentNode).querySelectorAll('[data-on-click],[data-on-input],[data-on-change]')));
          }
          const seen = new Set<Element>();
          for (const evEl of eventEls) {
            if (seen.has(evEl) || evEl.closest('template')) continue;
            seen.add(evEl);
            for (const attr of Array.from(evEl.attributes || [])) {
              if (!attr.name.startsWith('data-on-')) continue;
              const evt = attr.name.slice('data-on-'.length);
              const expr = attr.value.replace(/^\{|\}$/g, '');
              (evEl as any).__pulseDirect = true; // bound here; skip root delegation
              evEl.addEventListener(evt, (event) => {
                try {
                  const { keys: scopeKeys, values: scopeValues } = scopeEntries(scope);
                  const keys = [...scopeKeys, asVar, 'row', 'index', 'e'];
                  const values = [...scopeValues, item, item, index, event];
                  const result = safeEvalExpr(expr, keys, values);
                  if (typeof result === 'function') result(event);
                } catch (err) {
                  console.error('Pulse list event error:', expr, err);
                }
              });
            }
          }

          // Nested primitives (e.g. <Show> inside a <List> row) see the row item.
          const host = rowRoot as any;
          if (host.querySelector && host.querySelector('pulse-show, pulse-list')) {
            mountPrimitives(host, rowScopeFor(item, index), primitives, templates);
          }
        };

        primitives.List({
          each: getEach,
          key: keyFn,
          host: el,
          initialNodes,
          children: (item: any, index: number) => {
            const t = document.createElement('template');
            t.innerHTML = templateHtml;
            const clone = t.content.cloneNode(true) as DocumentFragment;
            mountFreshComponents(clone, primitives.components);
            bindRow((p) => safeWalk(clone, p), clone, item, index);
            const node = clone.firstElementChild || clone;
            if (keyFn && node instanceof Element) {
              try { markKey(node, keyFn(item, index)); } catch {}
            }
            return node;
          },
          // Hydration: SSR rows are adopted in place; bind them instead of re-rendering.
          // Row binding paths start at the row root (path[0] is the root's index).
          adopt: (node: Node, item: any, index: number) => {
            bindRow((p) => (p[0] === 0 ? safeWalk(node, p.slice(1)) : null), node as Element, item, index);
          },
        });
        // Keep pulse-list host in the tree (SSR/hydration identity)
      }
    });
  }

  // Mount Shows (Basic implementation)
  if (primitives.Show) {
    const shows = container.querySelectorAll('pulse-show');
    shows.forEach(el => {
      if (!ownedByContainer(el, container)) return;
      const whenExpr = el.getAttribute('when');
      const fallbackExpr = el.getAttribute('fallback');
      const templateEl = el.querySelector('template[data-pulse-template]');

      if (whenExpr && templateEl) {
        const content = templateEl.innerHTML;

        const getWhen = () => {
          try {
            const { keys: scopeKeys, values: scopeValues } = scopeEntries(scope);
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
            const clone = t.content.cloneNode(true) as DocumentFragment;
            mountFreshComponents(clone, primitives.components);
            return clone.firstElementChild || clone;
          }
        });
        // Keep pulse-show host (adopt SSR branch)
      }
    });
  }

  // Mount Components (e.g. Navbar)
  if (primitives.components) {
    // Fresh render: replace [data-pulse-component] placeholders with component roots.
    mountFreshComponents(container, primitives.components);

    // Hydration: component roots rendered on the server carry data-p-c. Adopt the
    // ones owned directly by this container (nested ones are adopted by their parent).
    const ssrComponents = container.querySelectorAll(`[${P_COMPONENT}]`);
    ssrComponents.forEach((el) => {
      if ((el as any).__pulseAdopted) return;
      const owner = el.parentElement ? el.parentElement.closest(`[${P_COMPONENT}]`) : null;
      if (owner && owner !== container && container.contains(owner)) return;
      const componentName = el.getAttribute(P_COMPONENT);
      const Component = componentName ? primitives.components[componentName] : undefined;
      if (!Component || typeof Component !== 'function') return;
      let props: any = {};
      const raw = el.getAttribute(P_PROPS);
      if (raw) {
        try { props = JSON.parse(raw); } catch { props = {}; }
      }
      (el as any).__pulseAdopted = true;
      try {
        const result = Component({ ...props, _hydrationNode: el });
        if (result && result !== el && result instanceof Node) {
          console.warn(`[Pulse] Hydration mismatch in <${componentName}>: component returned a new tree.`);
          el.replaceWith(result);
        }
      } catch (e) {
        console.error(`Pulse: Failed to hydrate component ${componentName}:`, e);
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
    if (target.hasAttribute(dataAttr) && !(target as any).__pulseDirect) {
      const handlerName = target.getAttribute(dataAttr) || '';
      // Find component root with handlers
      let root = target;
      while (root && !(root as any).__pulseHandlers) {
        if (root.parentElement) root = root.parentElement;
        else break;
      }

      if (root && (root as any).__pulseHandlers) {
        const handlers = (root as any).__pulseHandlers;
        const scope = (root as any).__pulseScope;
        // "{increment}" and "increment" both name a handler.
        const name = handlerName.replace(/^\{\s*([\w$]+)\s*\}$/, '$1');
        const handler = handlers[name] ?? (scope && typeof scope[name] === 'function' ? scope[name] : undefined);

        if (handler && typeof handler === 'function') {
          handler(event);
          return;
        }
        // Inline handler expression, e.g. data-on-click="{() => setOpen(!open())}"
        if (scope && /[(=!?:]/.test(handlerName)) {
          const expr = handlerName.replace(/^\{([\s\S]*)\}$/, '$1');
          const { keys, values } = scopeEntries(scope);
          const result = safeEvalExpr(expr, [...keys, 'event', 'e'], [...values, event, event]);
          if (typeof result === 'function') result(event);
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

// Initialize Delegation (once per document, even if several runtime copies load;
// never while server-rendering, where `document` is the SSR DOM).
if (
  typeof window !== 'undefined' &&
  typeof document !== 'undefined' &&
  !(globalThis as any).__PULSE_SSR__ &&
  !(document as any).__pulseDelegation
) {
  (document as any).__pulseDelegation = true;
  DELEGATED_EVENTS.forEach(evt => {
    document.addEventListener(evt, handleEvent, { capture: false, passive: false });
  });
}

// Re-export adopt-and-bind API (dev-server historically imported hydrate from dom.js).
export { hydrate, hydrateAll, renderToString } from './hydration.js';
