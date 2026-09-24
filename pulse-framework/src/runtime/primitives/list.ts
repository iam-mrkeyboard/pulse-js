import { createEffect, createRoot, createSignal, onCleanup } from '../core.js';
import { P_KEY, markKey, collectKeyedRows } from '../ssr-markers.js';

interface VirtualConfig {
  rowHeight: number;
  containerHeight?: number;
}

export type ListProps = {
  each: () => any[];
  key?: (item: any, index: number) => any;
  children: (item: any, index: number) => Node;
  initialNodes?: Node[];
  /** When set, reconcile inside this host (no replaceWith). Preferred for SSR/hydration. */
  host?: Element;
  virtual?: VirtualConfig;
  flip?: boolean;
};

type Entry = { key: any; node: Node; item: any; dispose?: () => void };

/**
 * Keyed List — prefix/suffix + Map, then LIS only on the changed middle.
 * Host mode keeps SSR rows in place and adopts them by data-p-key.
 */
export function List(props: ListProps) {
  const anchor = document.createComment('List Anchor');
  const frag = document.createDocumentFragment();

  const cache = new Map<any, Entry>();
  let prevKeys: any[] = [];
  let renderedNodes: Node[] = [];
  let hydrating = false;

  const [getScrollTop, setScrollTop] = createSignal(0);
  let scrollContainer: HTMLElement | null = null;

  // Place anchor
  if (props.host) {
    // Adopt existing keyed rows already in the host
    const existing = collectKeyedRows(props.host);
    if (existing.length > 0 || (props.initialNodes && props.initialNodes.length > 0)) {
      hydrating = true;
    }
    props.host.appendChild(anchor);
  } else {
    frag.appendChild(anchor);
    if (props.initialNodes && props.initialNodes.length > 0) {
      hydrating = true;
      for (const n of props.initialNodes) {
        frag.insertBefore(n, anchor);
        renderedNodes.push(n);
      }
    }
  }

  const keyOf = (item: any, index: number) =>
    props.key ? props.key(item, index) : item;

  const getRects = (nodes: Node[]) => {
    const rects = new Map<Node, DOMRect>();
    for (const n of nodes) {
      if (n instanceof Element) rects.set(n, n.getBoundingClientRect());
    }
    return rects;
  };

  const tagNode = (node: Node, k: any) => {
    if (node instanceof Element) markKey(node, k);
    (node as any).__pulse_item = k;
    return node;
  };

  createEffect(() => {
    const parent = (props.host || anchor.parentNode) as HTMLElement | null;
    if (!parent) return;

    if (props.virtual && !scrollContainer) {
      scrollContainer = parent;
      const onScroll = () => setScrollTop(scrollContainer!.scrollTop);
      scrollContainer.addEventListener('scroll', onScroll, { passive: true });
      onCleanup(() => scrollContainer?.removeEventListener('scroll', onScroll));
    }

    let items: any[] = [];
    try {
      const r = props.each();
      if (Array.isArray(r)) items = r;
    } catch (e) {
      console.error('Pulse List each error:', e);
    }

    let startIndex = 0;
    let workItems = items;
    if (props.virtual) {
      const { rowHeight } = props.virtual;
      const scrollTop = getScrollTop();
      const containerHeight =
        props.virtual.containerHeight || scrollContainer?.clientHeight || window.innerHeight;
      startIndex = Math.floor(scrollTop / rowHeight);
      const endIndex = Math.min(
        items.length,
        Math.ceil((scrollTop + containerHeight) / rowHeight) + 2,
      );
      workItems = items.slice(startIndex, endIndex);
    }

    const newKeys = workItems.map((it, i) => keyOf(it, startIndex + i));

    if (hydrating) {
      // Adopt by key from host children / initialNodes
      const byKey = new Map<any, Node>();
      if (props.host) {
        for (const { key, node } of collectKeyedRows(props.host)) {
          byKey.set(key, node);
          // also allow numeric/string coercion
          byKey.set(String(key), node);
        }
      }
      const fallbackNodes = props.initialNodes || renderedNodes;
      for (let i = 0; i < workItems.length; i++) {
        const k = newKeys[i];
        let node =
          byKey.get(k) ??
          byKey.get(String(k)) ??
          fallbackNodes[i];
        if (node) {
          tagNode(node, k);
          cache.set(k, { key: k, node, item: workItems[i] });
        }
      }
      prevKeys = newKeys;
      renderedNodes = newKeys.map((k) => cache.get(k)!.node).filter(Boolean);
      hydrating = false;
      return;
    }

    const prevRects = props.flip && !props.virtual ? getRects(renderedNodes) : null;

    const mountChild = (item: any, index: number, k: any): Entry => {
      let dispose: () => void = () => {};
      const node = createRoot((d) => {
        dispose = d;
        try {
          return props.children(item, index);
        } catch (e) {
          console.error('Pulse List render error:', e);
          return document.createComment('list-error');
        }
      });
      tagNode(node, k);
      (node as any).__pulse_data = item;
      const entry: Entry = { key: k, node, item, dispose };
      cache.set(k, entry);
      return entry;
    };

    const dropEntry = (k: any) => {
      const entry = cache.get(k);
      if (!entry) return;
      entry.dispose?.();
      if (entry.node.parentNode) entry.node.parentNode.removeChild(entry.node);
      cache.delete(k);
    };

    if (newKeys.length === 0) {
      if (cache.size > 0) {
        for (const entry of cache.values()) entry.dispose?.();
        cache.clear();
        if (props.host) {
          const keep: Node[] = [];
          for (const child of Array.from(parent.childNodes)) {
            if (child === anchor || (child as Element).tagName === 'TEMPLATE') keep.push(child);
          }
          parent.replaceChildren(...keep);
          if (anchor.parentNode !== parent) parent.appendChild(anchor);
        } else {
          parent.replaceChildren(anchor);
        }
      }
      prevKeys = newKeys;
      renderedNodes = [];
      return;
    }

    let start = 0;
    const minLen = Math.min(prevKeys.length, newKeys.length);
    while (start < minLen && prevKeys[start] === newKeys[start]) start++;

    let endOld = prevKeys.length - 1;
    let endNew = newKeys.length - 1;
    while (endOld >= start && endNew >= start && prevKeys[endOld] === newKeys[endNew]) {
      endOld--;
      endNew--;
    }

    let ref: Node =
      endNew + 1 < newKeys.length
        ? (cache.get(newKeys[endNew + 1])?.node ?? anchor)
        : anchor;

    const place = (entry: Entry, index: number) => {
      if (props.virtual && entry.node instanceof HTMLElement) {
        const actualIndex = startIndex + index;
        entry.node.style.position = 'absolute';
        entry.node.style.top = `${actualIndex * props.virtual.rowHeight}px`;
        entry.node.style.left = '0';
        entry.node.style.right = '0';
      }
    };

    // Fast path: only additions in the middle (create / append). Skip LIS.
    if (start > endOld) {
      for (let i = endNew; i >= start; i--) {
        const k = newKeys[i];
        let entry = cache.get(k);
        if (!entry) entry = mountChild(workItems[i], startIndex + i, k);
        else {
          entry.item = workItems[i];
          (entry.node as any).__pulse_data = workItems[i];
        }
        place(entry, i);
        parent.insertBefore(entry.node, ref);
        ref = entry.node;
      }
    } else {
      const toBePatched = endNew - start + 1;
      const keyToNewIndex = new Map<any, number>();
      for (let i = start; i <= endNew; i++) keyToNewIndex.set(newKeys[i], i);

      const newIndexToOldIndexMap = new Array(Math.max(0, toBePatched)).fill(0);
      let moved = false;
      let maxNewIndexSoFar = 0;

      for (let i = start; i <= endOld; i++) {
        const k = prevKeys[i];
        const newIndex = keyToNewIndex.get(k);
        if (newIndex === undefined) {
          dropEntry(k);
        } else {
          const entry = cache.get(k);
          if (entry) {
            entry.item = workItems[newIndex];
            (entry.node as any).__pulse_data = workItems[newIndex];
          }
          newIndexToOldIndexMap[newIndex - start] = i + 1;
          if (newIndex >= maxNewIndexSoFar) {
            maxNewIndexSoFar = newIndex;
          } else {
            moved = true;
          }
        }
      }

      // LIS only when existing middle nodes actually reordered (swap / shuffle).
      const increasing = moved ? longestIncreasingSubsequence(newIndexToOldIndexMap) : [];
      let j = increasing.length - 1;

      for (let i = endNew; i >= start; i--) {
        const k = newKeys[i];
        const pos = i - start;
        let entry = cache.get(k);
        if (!entry) {
          entry = mountChild(workItems[i], startIndex + i, k);
          place(entry, i);
          parent.insertBefore(entry.node, ref);
        } else {
          place(entry, i);
          if (moved && (j < 0 || pos !== increasing[j])) {
            parent.insertBefore(entry.node, ref);
          } else if (moved) {
            j--;
          }
        }
        ref = entry.node;
      }
    }

    const newRendered: Node[] = [];
    for (const k of newKeys) {
      const e = cache.get(k);
      if (e) newRendered.push(e.node);
    }

    if (prevRects && !props.virtual) {
      for (const node of newRendered) {
        if (!(node instanceof HTMLElement)) continue;
        const prev = prevRects.get(node);
        if (!prev) continue;
        const current = node.getBoundingClientRect();
        const dx = prev.left - current.left;
        const dy = prev.top - current.top;
        if (dx !== 0 || dy !== 0) {
          node.style.transform = `translate(${dx}px, ${dy}px)`;
          node.style.transition = 'none';
          requestAnimationFrame(() => {
            node.style.transform = '';
            node.style.transition = 'transform 0.3s ease-out';
          });
        }
      }
    }

    prevKeys = newKeys;
    renderedNodes = newRendered;
  });

  // Host mode: list lives inside host; return host for identity. Otherwise return fragment.
  return props.host ? (props.host as unknown as DocumentFragment) : frag;
}

/** Vue/Inferno-style LIS. `arr[i] === 0` means a new node and is skipped. Returns indices into `arr`. */
function longestIncreasingSubsequence(arr: number[]): number[] {
  const p = arr.slice();
  const result = [0];
  let i: number, j: number, u: number, v: number, c: number;
  const len = arr.length;
  for (i = 0; i < len; i++) {
    const arrI = arr[i];
    if (arrI !== 0) {
      j = result[result.length - 1];
      if (arr[j] < arrI) {
        p[i] = j;
        result.push(i);
        continue;
      }
      u = 0;
      v = result.length - 1;
      while (u < v) {
        c = ((u + v) / 2) | 0;
        if (arr[result[c]] < arrI) u = c + 1;
        else v = c;
      }
      if (arrI < arr[result[u]]) {
        if (u > 0) p[i] = result[u - 1];
        result[u] = i;
      }
    }
  }
  u = result.length;
  v = result[u - 1];
  while (u-- > 0) {
    result[u] = v;
    v = p[v];
  }
  return result;
}
