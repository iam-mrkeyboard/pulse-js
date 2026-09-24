import { createEffect, createSignal, onCleanup } from '../core.js';

interface VirtualConfig {
  rowHeight: number;
  containerHeight?: number;
}

export type ListProps = {
  each: () => any[];
  /** Stable key for each item. Defaults to the item value itself. */
  key?: (item: any, index: number) => any;
  children: (item: any, index: number) => Node;
  initialNodes?: Node[];
  /** Opt-in windowed rendering */
  virtual?: VirtualConfig;
  /** Opt-in FLIP move animations (off by default — measured as hot-path cost) */
  flip?: boolean;
};

type Entry = { key: any; node: Node; item: any };

/**
 * Keyed List — common prefix/suffix + Map (bench winner vs always-insertBefore / LIS).
 * Keeps restructure features: optional virtualization + opt-in FLIP.
 */
export function List(props: ListProps) {
  const anchor = document.createComment('List Anchor');
  const frag = document.createDocumentFragment();
  frag.appendChild(anchor);

  const cache = new Map<any, Entry>();
  let prevKeys: any[] = [];
  let renderedNodes: Node[] = [];
  let hydrating = !!(props.initialNodes && props.initialNodes.length > 0);

  const [getScrollTop, setScrollTop] = createSignal(0);
  let scrollContainer: HTMLElement | null = null;

  if (hydrating && props.initialNodes) {
    for (const n of props.initialNodes) {
      frag.insertBefore(n, anchor);
      renderedNodes.push(n);
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

  createEffect(() => {
    const parent = anchor.parentNode as HTMLElement | null;
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
      const nodes = props.initialNodes || renderedNodes;
      for (let i = 0; i < workItems.length; i++) {
        const k = newKeys[i];
        const node = nodes[i];
        if (node) {
          cache.set(k, { key: k, node, item: workItems[i] });
          (node as any).__pulse_item = workItems[i];
        }
      }
      prevKeys = newKeys;
      hydrating = false;
      return;
    }

    const prevRects = props.flip && !props.virtual ? getRects(renderedNodes) : null;

    // --- prefix / suffix + Map ---
    let start = 0;
    const minLen = Math.min(prevKeys.length, newKeys.length);
    while (start < minLen && prevKeys[start] === newKeys[start]) start++;

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
          node = props.children(workItems[i], startIndex + i);
        } catch (e) {
          console.error('Pulse List render error:', e);
          node = document.createComment('list-error');
        }
        (node as any).__pulse_item = workItems[i];
        entry = { key: k, node, item: workItems[i] };
        cache.set(k, entry);
      }

      if (props.virtual && entry.node instanceof HTMLElement) {
        const actualIndex = startIndex + i;
        entry.node.style.position = 'absolute';
        entry.node.style.top = `${actualIndex * props.virtual.rowHeight}px`;
        entry.node.style.left = '0';
        entry.node.style.right = '0';
      }

      parent.insertBefore(entry.node, ref);
      ref = entry.node;
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

  return frag;
}
