/** Minimal SSR / hydration markers (HTML size sensitive). */
export const P_HYDRATED = 'data-p-h';      // component root was SSR'd
export const P_KEY = 'data-p-key';         // keyed list row
export const P_LIST = 'data-p-list';        // list host (pulse-list)
export const P_SHOW = 'data-p-show';        // show host (pulse-show)
export const P_TEXT = 'data-p-t';          // optional: element whose textContent is bound (rare)
export const P_COMPONENT = 'data-p-c';     // child component root (name) rendered by a parent
export const P_PROPS = 'data-p-props';     // JSON props for a child component root (only when present)

/** Bookend comments for a bare text binding when a dedicated element isn't available. */
export const TEXT_OPEN = 'p';
export const TEXT_CLOSE = '/p';

export function markRoot(el: Element) {
  el.setAttribute(P_HYDRATED, '1');
}

export function markKey(el: Element, key: string | number) {
  el.setAttribute(P_KEY, String(key));
}

export function readKey(el: Element): string | null {
  return el.getAttribute(P_KEY);
}

/** Collect keyed element children of a list host (skip <template>). */
export function collectKeyedRows(host: Element): { key: string; node: Element }[] {
  const out: { key: string; node: Element }[] = [];
  for (const child of Array.from(host.children)) {
    if (child.tagName === 'TEMPLATE') continue;
    const key = child.getAttribute(P_KEY);
    if (key != null) out.push({ key, node: child });
    else out.push({ key: String(out.length), node: child });
  }
  return out;
}
