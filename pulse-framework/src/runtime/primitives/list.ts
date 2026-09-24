import { createEffect } from '../core.js';

export type ListProps = {
  each: () => any[];
  /** Stable key for each item. Defaults to the item value itself. */
  key?: (item: any, index: number) => any;
  children: (item: any, index: number) => Node;
  initialNodes?: Node[];
};

type Entry = { key: any; node: Node };

/**
 * Keyed List using common-prefix/suffix + Map (bench winner vs always-insertBefore and LIS
 * on js-framework-benchmark-style ops — see bench/RESULTS.md).
 */
export function List(props: ListProps) {
  const anchor = document.createComment('List');
  const frag = document.createDocumentFragment();
  frag.appendChild(anchor);

  const cache = new Map<any, Entry>();
  let prevKeys: any[] = [];
  let hydrating = !!(props.initialNodes && props.initialNodes.length > 0);

  if (hydrating && props.initialNodes) {
    for (const n of props.initialNodes) {
      frag.insertBefore(n, anchor);
    }
  }

  const keyOf = (item: any, index: number) =>
    props.key ? props.key(item, index) : item;

  createEffect(() => {
    const parent = anchor.parentNode;
    if (!parent) return;

    let items: any[] = [];
    try {
      const r = props.each();
      if (Array.isArray(r)) items = r;
    } catch (e) {
      console.error('Pulse List each error:', e);
    }

    const newKeys = items.map((it, i) => keyOf(it, i));

    if (hydrating) {
      const nodes = props.initialNodes || [];
      for (let i = 0; i < items.length; i++) {
        const k = newKeys[i];
        const node = nodes[i];
        if (node) cache.set(k, { key: k, node });
      }
      prevKeys = newKeys;
      hydrating = false;
      return;
    }

    // Common prefix
    let start = 0;
    const minLen = Math.min(prevKeys.length, newKeys.length);
    while (start < minLen && prevKeys[start] === newKeys[start]) start++;

    // Common suffix
    let endOld = prevKeys.length - 1;
    let endNew = newKeys.length - 1;
    while (endOld >= start && endNew >= start && prevKeys[endOld] === newKeys[endNew]) {
      endOld--;
      endNew--;
    }

    const newMid = new Set(newKeys.slice(start, endNew + 1));
    for (let i = start; i <= endOld; i++) {
      const k = prevKeys[i];
      if (!newMid.has(k)) {
        const entry = cache.get(k);
        if (entry) {
          if (entry.node.parentNode) entry.node.parentNode.removeChild(entry.node);
          cache.delete(k);
        }
      }
    }

    let ref: Node =
      endNew + 1 < newKeys.length
        ? (cache.get(newKeys[endNew + 1])?.node ?? anchor)
        : anchor;

    for (let i = endNew; i >= start; i--) {
      const k = newKeys[i];
      let entry = cache.get(k);
      if (!entry) {
        let node: Node;
        try {
          node = props.children(items[i], i);
        } catch (e) {
          console.error('Pulse List render error:', e);
          node = document.createComment('list-error');
        }
        entry = { key: k, node };
        cache.set(k, entry);
      }
      parent.insertBefore(entry.node, ref);
      ref = entry.node;
    }

    prevKeys = newKeys;
  });

  return frag;
}
