// ============================================================================
// FILE: src/runtime/hydration.ts
// Adopt-and-bind hydration — NEVER rebuild SSR DOM when it matches.
// ============================================================================

import { markRoot, P_HYDRATED } from './ssr-markers.js';

export type HydrateOptions = {
  props?: Record<string, any>;
  /** Called when SSR tree mismatches and we fall back to client render. */
  onMismatch?: (reason: string) => void;
};

/**
 * Hydrate a Component into an existing SSR container.
 *
 * Contract:
 * - If `target` (or its first element child) looks like SSR output, pass it as
 *   `_hydrationNode` so the component binds effects/events to existing nodes.
 * - On mismatch / missing root, fall back to client render and warn.
 * - Does NOT call replaceWith on a matching SSR root.
 */
export function hydrate(
  Component: (props?: any) => Node,
  target: string | Element,
  options: HydrateOptions = {},
): Node | null {
  const el =
    typeof target === 'string' ? document.querySelector(target) : target;

  if (!el) {
    console.warn(`[Pulse] Hydration target not found: ${target}`);
    return null;
  }

  const props = { ...(options.props || {}) };
  const ssrRoot = findSSRRoot(el);

  try {
    if (ssrRoot) {
      // Adopt path
      props._hydrationNode = ssrRoot;
      const result = Component(props);
      // Component returns the same node when adopting
      if (result && result !== ssrRoot && result instanceof Node) {
        // Soft mismatch: component created a new tree despite _hydrationNode
        options.onMismatch?.('component-returned-new-tree');
        console.warn(
          '[Pulse] Hydration mismatch: component returned a new tree; adopting returned node via replace.',
        );
        ssrRoot.replaceWith(result);
        markRoot(result instanceof Element ? result : ssrRoot);
        return result;
      }
      if (ssrRoot instanceof Element) markRoot(ssrRoot);
      return ssrRoot;
    }

    // No SSR root — client render
    options.onMismatch?.('missing-ssr-root');
    if (typeof process === 'undefined' || process.env?.NODE_ENV !== 'production') {
      console.warn('[Pulse] No SSR root found; falling back to client render.');
    }
    const node = Component(props);
    el.appendChild(node);
    if (node instanceof Element) markRoot(node);
    return node;
  } catch (err: any) {
    console.error('[Pulse] Hydration error:', err);
    options.onMismatch?.(`error:${err?.message || err}`);
    // Last-resort fallback
    try {
      el.innerHTML = '';
      const node = Component(options.props || {});
      el.appendChild(node);
      return node;
    } catch (e2) {
      console.error('[Pulse] Client render fallback failed:', e2);
      return null;
    }
  }
}

function findSSRRoot(container: Element): Element | null {
  // Prefer explicit marker, else first element child (typical #app > component-root)
  const marked = container.querySelector(`:scope > [${P_HYDRATED}], :scope [${P_HYDRATED}]`);
  if (marked && container.contains(marked)) {
    // Prefer direct child
    for (const child of Array.from(container.children)) {
      if (child.hasAttribute(P_HYDRATED)) return child;
    }
    return marked;
  }
  if (container.firstElementChild) return container.firstElementChild;
  return null;
}

/**
 * Render a component to an HTML string with hydration markers (for SSR / tests).
 * Runs the component in the current document (happy-dom or browser).
 */
export function renderToString(
  Component: (props?: any) => Node,
  props: Record<string, any> = {},
): string {
  const holder = document.createElement('div');
  document.body.appendChild(holder);
  try {
    const node = Component(props);
    holder.appendChild(node);
    if (node instanceof Element) markRoot(node);
    // Ensure list rows have keys if List marked them; already handled in List.
    return holder.innerHTML;
  } finally {
    holder.remove();
  }
}

export function hydrateAll(): void {
  const islands = document.querySelectorAll('[data-island]');
  if (islands.length === 0) return;

  islands.forEach(async (el) => {
    const islandId = el.getAttribute('data-island');
    if (!islandId) return;
    try {
      const module = await import(`/islands/${islandId}.js`);
      const propsAttr = el.getAttribute('data-props');
      const props = propsAttr ? JSON.parse(propsAttr) : {};
      hydrate(module.default, el as HTMLElement, { props });
    } catch (error: any) {
      console.error(`✗ Failed to hydrate island: ${islandId}`, error);
    }
  });
}

// Auto-hydrate islands if present (SPA islands mode)
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  const run = () => {
    if (document.querySelector('[data-island]')) hydrateAll();
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  }
}
