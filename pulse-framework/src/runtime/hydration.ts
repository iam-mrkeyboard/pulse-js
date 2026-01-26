// ============================================================================
// FILE: src/runtime/hydration.ts - FIXED
// ============================================================================

export function hydrate(
  selector: string,
  Component: Function,
  props: Record<string, any> = {},
): void {
  const el = document.querySelector(selector);

  if (!el) {
    console.warn(`Hydration target not found: ${selector}`);
    return;
  }

  try {
    const vnode = Component(props);

    if (vnode instanceof HTMLElement) {
      el.replaceWith(vnode);
    } else if (vnode instanceof DocumentFragment) {
      el.replaceWith(...Array.from(vnode.childNodes));
    } else if (vnode && typeof vnode === 'object' && 'nodeType' in vnode) {
      el.replaceWith(vnode as Node);
    } else {
      console.warn('Component did not return a valid DOM node');
    }
  } catch (error: any) {
    console.error(`Hydration error for ${selector}:`, error);
  }
}

export function hydrateAll(): void {
  const islands = document.querySelectorAll('[data-island]');

  if (islands.length === 0) {
    console.log('No islands found to hydrate');
    return;
  }

  console.log(`Hydrating ${islands.length} islands...`);

  islands.forEach(async (el) => {
    const islandId = el.getAttribute('data-island');
    if (!islandId) return;

    try {
      const module = await import(`/islands/${islandId}.js`);
      const propsAttr = el.getAttribute('data-props');
      const props = propsAttr ? JSON.parse(propsAttr) : {};

      hydrate(`[data-island="${islandId}"]`, module.default, props);
      console.log(`✓ Hydrated island: ${islandId}`);
    } catch (error: any) {
      console.error(`✗ Failed to hydrate island: ${islandId}`, error);
    }
  });
}

// Auto-hydrate on load
if (typeof window !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hydrateAll);
  } else {
    hydrateAll();
  }
}
