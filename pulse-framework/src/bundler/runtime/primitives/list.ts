// Bundler inlined List source (prefix/suffix + Map — see bench/RESULTS.md)
export { List } from '../../../runtime/primitives/list';

export const LIST_PRIMITIVE_SOURCE = `
import { createEffect } from '../core.js';

export function List(props) {
  const anchor = document.createComment('List');
  const frag = document.createDocumentFragment();
  frag.appendChild(anchor);

  const cache = new Map();
  let prevKeys = [];
  let hydrating = !!(props.initialNodes && props.initialNodes.length > 0);

  if (hydrating && props.initialNodes) {
    for (const n of props.initialNodes) frag.insertBefore(n, anchor);
  }

  const keyOf = (item, index) => props.key ? props.key(item, index) : item;

  createEffect(() => {
    const parent = anchor.parentNode;
    if (!parent) return;

    let items = [];
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
        if (nodes[i]) cache.set(k, { key: k, node: nodes[i] });
      }
      prevKeys = newKeys;
      hydrating = false;
      return;
    }

    let start = 0;
    const minLen = Math.min(prevKeys.length, newKeys.length);
    while (start < minLen && prevKeys[start] === newKeys[start]) start++;

    let endOld = prevKeys.length - 1;
    let endNew = newKeys.length - 1;
    while (endOld >= start && endNew >= start && prevKeys[endOld] === newKeys[endNew]) {
      endOld--; endNew--;
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

    let ref = endNew + 1 < newKeys.length
      ? (cache.get(newKeys[endNew + 1])?.node ?? anchor)
      : anchor;

    for (let i = endNew; i >= start; i--) {
      const k = newKeys[i];
      let entry = cache.get(k);
      if (!entry) {
        let node;
        try { node = props.children(items[i], i); }
        catch (e) {
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
`;
