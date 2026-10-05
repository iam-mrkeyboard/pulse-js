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
    if (!el) throw new Error(`Sokudo Runtime: Invalid path traversal at index ${index}`);

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
// Binding helpers used by compiled components
// ----------------------------------------------------------------------------

/** walk() that returns null instead of throwing. */
export function nodeAt(root: Node, path: number[]): Node | null {
  let el: Node | null = root;
  for (let i = 0; i < path.length; i++) {
    if (!el) return null;
    el = el.childNodes[path[i]] || null;
  }
  return el;
}

/**
 * Text node for a text binding at `path` under `root`. An empty string renders
 * no text node in serialized HTML, so after SSR the slot can be missing (or hold
 * the next sibling); in that case an empty Text node is inserted at the slot so
 * the binding still has a node to update. Call in document order.
 */
export function textAt(root: Node, path: number[]): Text | null {
  const parent = path.length > 1 ? nodeAt(root, path.slice(0, -1)) : root;
  if (!parent) return null;
  const node = parent.childNodes[path[path.length - 1]] || null;
  if (node && node.nodeType === 3) return node as Text;
  const t = document.createTextNode('');
  parent.insertBefore(t, node);
  return t;
}

/**
 * Attribute binding write. `style` goes through CSSOM (`style.cssText`), which a
 * Content-Security-Policy without 'unsafe-inline' allows; a style attribute set
 * with setAttribute would be blocked.
 */
export function setAttr(el: Element, name: string, value: any) {
  if (name === 'style') {
    (el as HTMLElement).style.cssText = value == null ? '' : String(value);
    // A production server render moves inline styles into generated "pd-" classes
    // (strict style-src CSP); once the binding owns the style, drop them.
    if (!(el as any).__pd) {
      (el as any).__pd = 1;
      const cl = el.classList;
      for (let i = cl.length - 1; i >= 0; i--) if (cl[i].startsWith('pd-')) cl.remove(cl[i]);
    }
  } else el.setAttribute(name, String(value));
}

// ----------------------------------------------------------------------------
// Primitives Mounting (List, Show)
// ----------------------------------------------------------------------------

type Binding = { type: string; path: number[]; name?: string; x: number };

/** Row context as stored on a List row root for delegated events. */
type RowRef = RowCtx & { t: string };

/** True when `el` is not nested inside another List/Show owned by `container`. */
function ownedByContainer(el: Element, container: Element | DocumentFragment): boolean {
  let p = el.parentElement;
  while (p && p !== container) {
    const tag = p.tagName;
    if (tag === 'PULSE-LIST' || tag === 'PULSE-SHOW') return false;
    p = p.parentElement;
  }
  return true;
}

/**
 * Bind compiled List-row / Show-branch bindings. `resolve(path)` finds an
 * element (attribute bindings), `resolveText(path)` the text node of a text
 * binding (created when SSR dropped an empty one). Resolution runs in binding
 * (document) order before any effect, so repaired text slots keep later paths right.
 */
function applyBindings(
  bindings: Binding[],
  x: Function[],
  resolve: (path: number[]) => Node | null,
  resolveText: (path: number[]) => Text | null,
  v: any, i: any, p: any[],
  effect: (fn: () => void) => void,
) {
  const n = bindings.length;
  const targets: Array<Node | null> = new Array(n);
  for (let k = 0; k < n; k++) {
    const b = bindings[k];
    targets[k] = b.type === 'text' ? resolveText(b.path) : resolve(b.path);
  }
  for (let k = 0; k < n; k++) {
    const target = targets[k];
    if (!target) continue;
    const b = bindings[k];
    const fn = x[b.x];
    if (b.type === 'text') {
      effect(() => {
        let value: any;
        try { value = fn(v, i, p); } catch (e) { value = ''; }
        (target as Text).data = String(value);
      });
    } else {
      const name = b.name as string;
      const isProp = name === 'value' || name === 'checked';
      effect(() => {
        let value: any;
        try { value = fn(v, i, p); } catch (e) { value = ''; }
        if (isProp) (target as any)[name] = value;
        else setAttr(target as Element, name, value);
      });
    }
  }
}

/** Nearest row context of component `tag` at or above `el` (stops at `stop`). */
function rowCtxOf(el: Node | null, tag: string, stop: Node | null): RowRef | null {
  let n: any = el;
  while (n && n !== stop) {
    const c = n.__pctx as RowRef | undefined;
    if (c && c.t === tag) return c;
    if (n.__px && n.__px.t === tag) return null;
    n = n.parentNode;
  }
  return null;
}

/** Props for a component placeholder / SSR root: compiled closure ("<tag>:<n>") or plain attributes. */
function componentProps(el: Element, exprs: ExprTable | null | undefined, ctx: RowCtx | null, attr: string): { props: any; ref: string | null } {
  const ref = el.getAttribute(attr);
  const fn = resolveRef(exprs, ref);
  if (fn) {
    const c = ctx || rowCtxOf(el, exprs!.t, null);
    const props = c ? fn(c.v, c.i, c.p) : fn();
    return { props, ref };
  }
  return { props: null, ref: null };
}

/**
 * Replace `[data-pulse-component]` placeholders under `root` with freshly rendered
 * component roots (fresh render, or content a Show/List creates later).
 */
function mountFreshComponents(root: ParentNode, components: Record<string, any> | undefined, exprs?: ExprTable | null, ctx: RowCtx | null = null) {
  if (!components || !root || !(root as any).querySelectorAll) return;
  const componentEls = root.querySelectorAll('[data-pulse-component]');
  componentEls.forEach(el => {
    const componentName = el.getAttribute('data-pulse-component');
    if (!componentName) return;

    const Component = components[componentName];
    if (Component && typeof Component === 'function') {
      // Props: compiled closure (expressions stay live via getters) or, for
      // hand-written markup, the placeholder's attributes as strings.
      let { props, ref } = componentProps(el, exprs, ctx, 'data-pulse-props');
      if (!props) {
        props = {};
        Array.from(el.attributes).forEach(attr => {
          if (attr.name.startsWith('data-pulse-')) return;
          if (attr.name === 'style' || attr.name === 'class') return;
          props[attr.name] = attr.value;
        });
      }

      // Handle Children
      const templateEl = el.querySelector('template[data-pulse-template]');
      if (templateEl) {
        props.children = Array.from((template(templateEl.innerHTML)() as DocumentFragment).childNodes);
      }

      try {
        const componentNode = Component(props);
        if (componentNode) {
          // Remember which component rendered here so hydration can adopt it later
          // (SSR serializes this attribute; the placeholder itself is gone).
          if (componentNode instanceof Element) {
            (componentNode as any).__pulseAdopted = true;
            componentNode.setAttribute(P_COMPONENT, componentName);
            if (ref) {
              componentNode.setAttribute(P_PROPS_REF, ref);
            } else if (Object.keys(props).some((k) => k !== 'children')) {
              const { children: _c, ...plain } = props;
              componentNode.setAttribute(P_PROPS, JSON.stringify(plain));
            }
          }
          el.replaceWith(componentNode);
        }
      } catch (e) {
        console.error(`Sokudo: Failed to mount component ${componentName}:`, e);
      }
    }
  });
}

/** Attribute on an SSR component root naming the parent's compiled props closure. */
const P_PROPS_REF = 'data-p-pr';

export function mountPrimitives(
  container: HTMLElement | DocumentFragment,
  exprs: ExprTable | null | undefined,
  primitives: { List: any, Show: any, createEffect: any, components?: any },
  templates: Record<string, string> = {},
  ctx: RowCtx | null = null
) {
  if (!container) return;
  // Re-ensure defaults on the current document (idempotent).
  delegate(DELEGATED_EVENTS);
  // Closure arguments for List each / Show when evaluated in this container.
  const cv = ctx ? ctx.v : undefined;
  const ci = ctx ? ctx.i : undefined;
  const cp = ctx ? ctx.p : NO_PARENTS;
  const effect = primitives.createEffect;

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
        const bindings: Binding[] = bindingsStr ? JSON.parse(bindingsStr) : [];
        const x = exprs!.x;
        const tag = exprs!.t;
        // Items of the enclosing rows, passed to row closures as `$p`.
        const rowParents = ctx ? [...cp, cv] : NO_PARENTS;
        const hasNested = /<pulse-(show|list)\b/.test(templateHtml);

        const getEach = () => {
          try {
            let result = eachFn(cv, ci, cp);
            // Unwrap signal accessors: each="{items}" where items is () => T[]
            if (typeof result === 'function') result = result();
            return Array.isArray(result) ? result : [];
          } catch (e) {
            console.error('Sokudo: Failed to evaluate List each:', e);
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

        const bindRow = (
          resolve: (path: number[]) => Node | null,
          resolveText: (path: number[]) => Text | null,
          rowRoot: Node, item: any, index: number,
        ) => {
          // Delegated events inside the row (any type, incl. Show content rendered
          // later) find the row item here.
          (rowRoot as any).__pctx = { t: tag, v: item, i: index, p: rowParents } as RowRef;
          applyBindings(bindings, x, resolve, resolveText, item, index, rowParents, effect);
          // Nested primitives (e.g. <Show> inside a <List> row) see the row item.
          if (hasNested && (rowRoot as any).querySelector) {
            mountPrimitives(rowRoot as HTMLElement, exprs, primitives, templates, { v: item, i: index, p: rowParents });
          }
        };

        primitives.List({
          each: getEach,
          key: keyFn,
          host: el,
          initialNodes,
          children: (item: any, index: number) => {
            const clone = rowTemplate() as DocumentFragment;
            mountFreshComponents(clone, primitives.components, exprs, { v: item, i: index, p: rowParents });
            const node = clone.firstElementChild || clone;
            bindRow((p) => nodeAt(clone, p), (p) => textAt(clone, p), node, item, index);
            if (keyFn && node instanceof Element) {
              try { markKey(node, keyFn(item, index)); } catch {}
            }
            return node;
          },
          // Hydration: SSR rows are adopted in place; bind them instead of re-rendering.
          // Row binding paths start at the row root (path[0] is the root's index).
          adopt: (node: Node, item: any, index: number) => {
            bindRow(
              (p) => (p[0] === 0 ? nodeAt(node, p.slice(1)) : null),
              (p) => (p[0] === 0 && p.length > 1 ? textAt(node, p.slice(1)) : null),
              node, item, index,
            );
          },
        });
        // Keep pulse-list host in the tree (SSR/hydration identity)
      }
    });
  }

  // Mount Shows
  if (primitives.Show) {
    const shows = container.querySelectorAll('pulse-show');
    shows.forEach(el => {
      if (!ownedByContainer(el, container)) return;
      const whenFn = resolveRef(exprs, el.getAttribute('when'));
      if (!whenFn) return;
      const fallbackFn = resolveRef(exprs, el.getAttribute('fallback'));
      const templateEl = el.querySelector(':scope > template[data-pulse-template]') || el.querySelector('template[data-pulse-template]');

      if (templateEl) {
        const branchHtml = templateEl.innerHTML;
        const branchTemplate = template(branchHtml);
        const bindingsStr = el.getAttribute('data-bindings');
        const bindings: Binding[] = bindingsStr ? JSON.parse(bindingsStr) : [];
        const x = exprs!.x;
        const hasNested = /<pulse-(show|list)\b/.test(branchHtml);

        const getWhen = () => {
          try {
            let result = whenFn(cv, ci, cp);
            if (typeof result === 'function') result = result();
            return result;
          } catch (e) { return false; }
        };

        // SSR branch: every node after the <template>, up to the SSR anchor.
        const initialNodes: Node[] = [];
        let offset = -1;
        const kids = el.childNodes;
        for (let k = 0; k < kids.length; k++) {
          const n = kids[k];
          if (n === templateEl) { offset = k + 1; continue; }
          if (offset < 0) continue;
          if (n.nodeType === 8 && (n as Comment).data === 'Show Anchor') break;
          initialNodes.push(n);
        }
        // Only whitespace (hand-written markup around the <template>): nothing to adopt.
        if (!initialNodes.some((n) => n.nodeType !== 3 || /\S/.test((n as Text).data))) initialNodes.length = 0;

        el.setAttribute('data-p-show', '1');

        // Fallback text follows its expression (fallback={'closed ' + n()}).
        const fallbackText = (t: Text) => {
          effect(() => {
            let v: any;
            try { v = fallbackFn!(cv, ci, cp); } catch { v = ''; }
            t.data = v == null ? '' : String(v);
          });
          return t;
        };
        const whenNow = initialNodes.length ? getWhen() : false;
        if (initialNodes.length && !whenNow && fallbackFn && initialNodes.length === 1 && initialNodes[0].nodeType === 3) {
          fallbackText(initialNodes[0] as Text);
        }

        // Hydration: bind the SSR branch in place when it is the "when" branch.
        if (initialNodes.length && offset >= 0 && whenNow) {
          const shift = (p: number[]) => [p[0] + offset, ...p.slice(1)];
          applyBindings(bindings, x, (p) => nodeAt(el, shift(p)), (p) => textAt(el, shift(p)), cv, ci, cp, effect);
          // Primitives inside the branch are owned by this Show, not the outer container.
          if (hasNested) mountPrimitives(el as HTMLElement, exprs, { ...primitives, components: undefined }, templates, ctx);
        }

        primitives.Show({
          when: getWhen,
          host: el,
          initialNodes,
          fallback: fallbackFn ? () => fallbackText(document.createTextNode('')) : undefined,
          children: () => {
            const clone = branchTemplate() as DocumentFragment;
            mountFreshComponents(clone, primitives.components, exprs, ctx);
            applyBindings(bindings, x, (p) => nodeAt(clone, p), (p) => textAt(clone, p), cv, ci, cp, effect);
            if (hasNested) mountPrimitives(clone, exprs, primitives, templates, ctx);
            return clone;
          }
        });
        // Keep pulse-show host (adopt SSR branch)
      }
    });
  }

  // Mount Components (e.g. Navbar)
  if (primitives.components) {
    // Fresh render: replace [data-pulse-component] placeholders with component roots.
    mountFreshComponents(container, primitives.components, exprs, ctx);

    // Hydration: component roots rendered on the server carry data-p-c. Adopt the
    // ones owned directly by this container (nested ones are adopted by their parent).
    const ssrComponents = container.querySelectorAll(`[${P_COMPONENT}]`);
    ssrComponents.forEach((el) => {
      if ((el as any).__pulseAdopted) return;
      const owner = el.parentElement ? el.parentElement.closest(`[${P_COMPONENT}]`) : null;
      if (owner && owner !== container && (container as Node).contains(owner)) return;
      const componentName = el.getAttribute(P_COMPONENT);
      const Component = componentName ? primitives.components[componentName] : undefined;
      if (!Component || typeof Component !== 'function') return;
      let { props } = componentProps(el, exprs, null, P_PROPS_REF);
      if (!props) {
        props = {};
        const raw = el.getAttribute(P_PROPS);
        if (raw) {
          try { props = JSON.parse(raw); } catch { props = {}; }
        }
      }
      (el as any).__pulseAdopted = true;
      try {
        // Set (not spread): spreading would read the props getters once and drop reactivity.
        props._hydrationNode = el;
        const result = Component(props);
        if (result && result !== el && result instanceof Node) {
          console.warn(`[Sokudo] Hydration mismatch in <${componentName}>: component returned a new tree.`);
          el.replaceWith(result);
        }
      } catch (e) {
        console.error(`Sokudo: Failed to hydrate component ${componentName}:`, e);
      }
    });
  }
} // End mountPrimitives

// ----------------------------------------------------------------------------
// Global Event Delegation
// ----------------------------------------------------------------------------
const DELEGATED_EVENTS = ['click', 'input', 'change', 'submit', 'keydown', 'keyup', 'focus', 'blur'];
/** Events that do not bubble: delegated in the capture phase. */
const NON_BUBBLING = new Set(['focus', 'blur', 'mouseenter', 'mouseleave', 'pointerenter', 'pointerleave', 'load', 'error', 'scroll', 'toggle', 'invalid']);

function handleEvent(event: Event) {
  if ((globalThis as any).__SOKUDO_SSR__) return;
  let target = event.target as HTMLElement | null;
  if (target && target.nodeType !== 1) target = target.parentElement;
  const dataAttr = `data-on-${event.type.toLowerCase()}`;

  // Bubble up
  while (target && target !== document.body) {
    if (target.hasAttribute && target.hasAttribute(dataAttr)) {
      const ref = target.getAttribute(dataAttr) || '';
      const colon = ref.indexOf(':');
      if (colon > 0) {
        // Compiled handler "<tag>:<index>": run the closure of the component that
        // owns it (nearest ancestor root with that tag; also finds the parent for
        // markup it passed into a child's slot). Inside a List row the closure gets
        // the row item / index / enclosing rows from the nearest row root.
        const tag = ref.slice(0, colon);
        let root: any = target;
        let row: RowRef | null = null;
        while (root && !(root.__px && root.__px.t === tag)) {
          if (!row && root.__pctx && root.__pctx.t === tag) row = root.__pctx;
          root = root.parentElement;
        }
        const fn = root ? root.__px.x[+ref.slice(colon + 1)] : undefined;
        if (typeof fn === 'function') {
          const result = row ? fn(event, row.v, row.i, row.p) : fn(event);
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
      console.warn(`Sokudo: Handler '${ref}' not found`, target);
    }
    target = target.parentElement as HTMLElement | null;
  }
}

/**
 * Listen for `names` at the document (once per type per document). Compiled
 * components call this with the event types their markup uses, so any
 * `on<event>` works, not only the default set.
 *
 * Registration is allowed even while `__SOKUDO_SSR__` is set (happy-dom during
 * `renderPageStrict`): the first import of this module can happen during SSR in
 * tests/builds, and skipping then would leave the shared document with no
 * listeners after the flag clears. `handleEvent` no-ops under SSR instead.
 */
export function delegate(names: string[]) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const doc = document as any;
  const seen: Set<string> = doc.__pulseEvents || (doc.__pulseEvents = new Set());
  for (const evt of names) {
    if (seen.has(evt)) continue;
    seen.add(evt);
    document.addEventListener(evt, handleEvent, { capture: NON_BUBBLING.has(evt), passive: false });
  }
}

// Hydration Helper (prefer runtime/hydration.ts for full adopt-and-bind API)
export function hydrateDOM(Component: any, container: HTMLElement) {
  const hydrationRoot = container.firstElementChild as HTMLElement | null;
  if (hydrationRoot) {
    Component({ _hydrationNode: hydrationRoot });
  } else {
    console.warn('Sokudo Hydration: No SSR root found, falling back to mount.');
    const node = Component();
    container.appendChild(node);
  }
}

// Initialize Delegation for the default event set (once per document, even if
// several runtime copies load; never while server-rendering).
delegate(DELEGATED_EVENTS);

// Re-export adopt-and-bind API (dev-server historically imported hydrate from dom.js).
export { hydrate, hydrateAll, renderToString } from './hydration.js';
