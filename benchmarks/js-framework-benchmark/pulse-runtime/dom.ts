// ============================================================================
// FILE: src/runtime/dom.ts
// Efficient DOM Runtime using Template Cloning and Path Traversal.
//
// Template expressions (List each/key, row bindings, Show when, event handlers)
// are compiled to closures by the SFC compiler; markup refers to them by
// "<tag>:<index>". This runtime never turns strings into code (no eval /
// new Function), so pages run under a CSP without 'unsafe-eval'.
// ============================================================================

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
 * Compiler-generated expression table of one component instance: `t` is the
 * component tag used in "<tag>:<index>" references, `x` the closures.
 */
export interface ExprTable {
  t: string;
  x: Function[];
}

/** Row context for closures inside a List row: item, index, enclosing rows' items. */
interface RowCtx {
  v: any;
  i: number;
  p: any[];
}

const NO_PARENTS: any[] = [];

/** Resolve a "<tag>:<index>" reference against `table`; undefined if it belongs to another component. */
function resolveRef(table: ExprTable | null | undefined, ref: string | null): Function | undefined {
  if (!table || !ref) return undefined;
  const colon = ref.indexOf(':');
  if (colon < 0 || ref.slice(0, colon) !== table.t) return undefined;
  return table.x[+ref.slice(colon + 1)];
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
  exprs: ExprTable | null | undefined,
  primitives: { List: any, Show: any, createEffect: any, components?: any },
  templates: Record<string, string> = {},
  ctx: RowCtx | null = null
) {
  if (!container) return;
  // Closure arguments for List each / Show when evaluated in this container.
  const cv = ctx ? ctx.v : undefined;
  const ci = ctx ? ctx.i : undefined;
  const cp = ctx ? ctx.p : NO_PARENTS;

  // Mount Lists
  if (primitives.List) {
    const lists = container.querySelectorAll('pulse-list');
    lists.forEach(el => {
      if (!ownedByContainer(el, container)) return;
      // Lists of other components (nested roots, slots) carry another tag.
      const eachFn = resolveRef(exprs, el.getAttribute('each'));
      if (!eachFn) return;
      const keyAttr = el.getAttribute('key');
      const keyX = keyAttr ? exprs!.x[+keyAttr] : undefined;
      const templateId = el.getAttribute('data-template-id');
      const bindingsStr = el.getAttribute('data-bindings');

      const inlineTpl = el.querySelector('template[data-pulse-template], template');
      const templateHtml = (templateId && templates[templateId])
        || (inlineTpl ? inlineTpl.innerHTML : '')
        || '';
      if (templateHtml) {
        const bindings: Array<{ type: string; path: number[]; name?: string; x: number }> = bindingsStr ? JSON.parse(bindingsStr) : [];
        const x = exprs!.x;
        // Items of the enclosing rows, passed to row closures as `$p`.
        const rowParents = ctx ? [...cp, cv] : NO_PARENTS;

        const getEach = () => {
          try {
            let result = eachFn(cv, ci, cp);
            // Unwrap signal accessors: each="{items}" where items is () => T[]
            if (typeof result === 'function') result = result();
            return Array.isArray(result) ? result : [];
          } catch (e) {
            console.error('Pulse: Failed to evaluate List each:', e);
            return [];
          }
        };

        // Parse the row template once per list; each row is a deep clone.
        const rowTemplate = template(templateHtml);

        const keyFn = keyX
          ? (item: any, index: number) => keyX(item, index, rowParents)
          : undefined;

        // Adopt existing SSR rows (skip <template>)
        const initialNodes = Array.from(el.childNodes).filter(
          (n) => n.nodeType === Node.ELEMENT_NODE && (n as HTMLElement).tagName !== 'TEMPLATE'
        );

        el.setAttribute('data-p-list', '1');

        const bindRow = (resolve: (path: number[]) => Node | null, rowRoot: Element | DocumentFragment, item: any, index: number) => {
          for (const b of bindings) {
            const target = resolve(b.path);
            if (!target) continue;
            const fn = x[b.x];
            const isText = b.type === 'text';
            const name = b.name as string;
            const isProp = name === 'value' || name === 'checked';

            primitives.createEffect(() => {
              let value: any;
              try { value = fn(item, index, rowParents); } catch (e) { value = ''; }
              if (isText) {
                target.textContent = String(value);
              } else if (isProp) {
                (target as any)[name] = value;
              } else {
                (target as Element).setAttribute(name, String(value));
              }
            });
          }

          const eventEls: Element[] = [];
          if (rowRoot instanceof Element) eventEls.push(rowRoot);
          if ((rowRoot as ParentNode).querySelectorAll) {
            eventEls.push(...Array.from((rowRoot as ParentNode).querySelectorAll('[data-on-click],[data-on-input],[data-on-change]')));
          }
          const seen = new Set<Element>();
          for (const evEl of eventEls) {
            if (seen.has(evEl) || evEl.closest('template')) continue;
            // Elements of a nested List's rows are bound by that List (with its row).
            const ownerList = evEl.closest('pulse-list');
            if (ownerList && ownerList !== el) continue;
            seen.add(evEl);
            for (const attr of Array.from(evEl.attributes || [])) {
              if (!attr.name.startsWith('data-on-')) continue;
              const handler = resolveRef(exprs, attr.value);
              if (!handler) continue;
              const evt = attr.name.slice('data-on-'.length);
              (evEl as any).__pulseDirect = true; // bound here; skip root delegation
              evEl.addEventListener(evt, (event) => {
                try {
                  const result = handler(event, item, index, rowParents);
                  if (typeof result === 'function') result(event);
                } catch (err) {
                  console.error('Pulse list event error:', err);
                }
              });
            }
          }

          // Nested primitives (e.g. <Show> inside a <List> row) see the row item.
          const host = rowRoot as any;
          if (host.querySelector && host.querySelector('pulse-show, pulse-list')) {
            mountPrimitives(host, exprs, primitives, templates, { v: item, i: index, p: rowParents });
          }
        };

        primitives.List({
          each: getEach,
          key: keyFn,
          host: el,
          initialNodes,
          children: (item: any, index: number) => {
            const clone = rowTemplate() as DocumentFragment;
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
      const whenFn = resolveRef(exprs, el.getAttribute('when'));
      if (!whenFn) return;
      const fallbackExpr = el.getAttribute('fallback');
      const templateEl = el.querySelector('template[data-pulse-template]');

      if (templateEl) {
        const branchTemplate = template(templateEl.innerHTML);

        const getWhen = () => {
          try {
            let result = whenFn(cv, ci, cp);
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
            const clone = branchTemplate() as DocumentFragment;
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
  let target = event.target as HTMLElement | null;
  const dataAttr = `data-on-${event.type.toLowerCase()}`;

  // Bubble up
  while (target && target !== document.body) {
    if (target.hasAttribute(dataAttr) && !(target as any).__pulseDirect) {
      const ref = target.getAttribute(dataAttr) || '';
      const colon = ref.indexOf(':');
      if (colon > 0) {
        // Compiled handler "<tag>:<index>": run the closure of the component that
        // owns it (the nearest ancestor root with that tag; also finds the parent
        // for markup it passed into a child's slot).
        const tag = ref.slice(0, colon);
        let root: any = target;
        while (root && !(root.__px && root.__px.t === tag)) root = root.parentElement;
        const fn = root ? root.__px.x[+ref.slice(colon + 1)] : undefined;
        if (typeof fn === 'function') {
          const result = fn(event);
          if (typeof result === 'function') result(event);
          return;
        }
      } else {
        // Named handler on a hand-written root: data-on-click="increment" / "{increment}".
        let root: any = target;
        while (root && !root.__pulseHandlers) root = root.parentElement;
        const name = ref.replace(/^\{\s*([\w$]+)\s*\}$/, '$1');
        const handler = root ? root.__pulseHandlers[name] : undefined;
        if (typeof handler === 'function') {
          handler(event);
          return;
        }
      }
      console.warn(`Pulse: Handler '${ref}' not found`, target);
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
