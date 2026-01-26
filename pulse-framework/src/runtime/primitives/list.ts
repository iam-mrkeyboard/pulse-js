import { createEffect } from '../core.js';

export function List(props: { each: () => any[], initialNodes?: Node[], children: (item: any, index: number) => Node }) {
  const anchor = document.createComment('List Anchor');
  const parent = document.createDocumentFragment();
  parent.appendChild(anchor);

  // Map to store existing nodes for reuse
  // We use Array of nodes because children(item) might return a Fragment? 
  // Wait, component-compiler/dom returns a single NODE (div or text).
  // But if same item appears multiple times... allow it.
  const nodeMap = new Map<any, Node[]>();
  let renderedNodes: Node[] = [];

  let isHydrating = !!(props.initialNodes && props.initialNodes.length > 0);

  if (isHydrating && props.initialNodes) {
    // Initial Hydration Logic (Fast adopt)
    props.initialNodes.forEach((node, i) => {
      parent.insertBefore(node, anchor);
      renderedNodes.push(node);

      // We assume initialNodes correspond to initial items? 
      // We can't populate map accurately without the items list.
      // But we will populate the map on the FIRST run of the effect if we carefully skip render but filling state.
    });
    isHydrating = true;
  }

  createEffect(() => {
    const container = anchor.parentNode;
    if (!container) return; // Should not happen

    let items: any[] = [];
    try {
      const result = props.each();
      // Ensure result is array
      if (Array.isArray(result)) {
        items = result;
      }
    } catch (err) {
      console.error('Pulse: Error evaluating List "each":', err);
    }

    if (isHydrating) {
      // Special hydration pass: We have nodes, we have items. matching 1-to-1.
      items.forEach((item, i) => {
        const node = renderedNodes[i];
        if (node) {
          if (!nodeMap.has(item)) nodeMap.set(item, []);
          nodeMap.get(item)!.push(node);
        }
      });
      isHydrating = false;
      return;
    }

    // ===============================================
    // KEYED RECONCILIATION ALGORITHM
    // ===============================================

    const newRenderedNodes: Node[] = [];

    // 1. Mark existing nodes as available for reuse (already in nodeMap from previous render/hydration)
    // Actually, nodeMap should be maintained constantly.
    // Ideally we rebuilding it or consuming it?
    // Let's consume "current" map.

    // We create a pool of available nodes from currently rendered nodes
    // to handle duplicates correctly (first come first serve reuse).
    const available = new Map<any, Node[]>();
    renderedNodes.forEach((node, i) => {
      // We need to know which item this node belonged to?
      // We can store it on the node, or re-derive from previous items?
      // Storing on node is easiest: (node as any).__pulse_item = item
      const item = (node as any).__pulse_item;
      if (item !== undefined) {
        if (!available.has(item)) available.set(item, []);
        available.get(item)!.push(node);
      } else {
        // Orphan node? Remove it.
        if (node.parentNode) node.parentNode.removeChild(node);
      }
    });

    // 2. Build new nodes list (Reuse or Create)
    items.forEach((item, index) => {
      let node: Node | undefined;

      // Try reuse
      const pool = available.get(item);
      if (pool && pool.length > 0) {
        node = pool.shift(); // Take first available
      }

      // If no reuse, create new
      if (!node) {
        try {
          node = props.children(item, index);
          (node as any).__pulse_item = item;
        } catch (e) {
          console.error('Pulse List Render Error:', e);
        }
      }

      if (node) {
        newRenderedNodes.push(node);
      }
    });

    // 3. Cleanup unused nodes
    available.forEach((nodes) => {
      nodes.forEach(n => {
        if (n.parentNode) n.parentNode.removeChild(n);
      });
    });

    // 4. Reorder Loop
    // Use the anchor to insert before
    // Optimization: find where divergence starts

    let nextSibling = anchor;
    // Iterate backwards is sometimes easier for 'insertBefore' but let's do forward.
    // If we iterate forward, we expect node at index i.

    for (let i = 0; i < newRenderedNodes.length; i++) {
      const expectedNode = newRenderedNodes[i];

      // Current DOM state at this position?
      // We can't easily rely on DOM index because of potential other siblings (though List usually owns its siblings).
      // Let's use `anchor` relative positioning logic? 
      // Or just `insertBefore`.

      // If I call insertBefore(node, reference), and node is already there, it moves.
      // If node is already `reference.previousSibling`, we are good?

      // Let's try simple Reorder strategy:
      // Iterate through new list.
      // Ensure `newRenderedNodes[i]` is immediately before `newRenderedNodes[i+1]` (or anchor).
      // Actually, we can just insert them in order.

      // Performance note: `appendChild` or `insertBefore` removes from old position automatically.
      // So if we just run through the list and `insertBefore(node, anchor)`, it ends up in reverse order? No.

      // Correct way:
      // container.insertBefore(newRenderedNodes[i], nextSibling??)
      // If we want order 1, 2, 3.
      // We insert 1 before anchor.
      // We insert 2 before anchor.
      // Result: 1, 2, anchor.

      // BUT if we modify the DOM, `nextSibling` (the anchor) stays at end.
      // So yes, `insertBefore` moves it to the end.

      // Optimization: checking if it is already in right place.
      // `nextSibling` logic is tricky if we are moving things.

      // Simplest Robust Reorder:
      // Just iterate and append (insertBefore anchor).
      // The browser handles the move.
      // We optimize by checking `node.nextSibling !== anchor`? 

      // Better: Reference node is consistent for the loop?
      // No, we want them in order `[n1, n2, n3, ... anchor]`.
      // So n1 should be before n2.

      // If we iterate items 0..Last:
      // container.insertBefore(node, anchor);
      // This puts them all at the end in order.
      // Valid for "append only" or "reorder all".

      // Checking for cheap no-op:
      // const currentNext = (i < newRenderedNodes.length - 1) ? newRenderedNodes[i+1] : anchor;
      // Wait, if we are building the DOM...

      // Just use `insertBefore(node, anchor)`. 
      container.insertBefore(expectedNode, anchor);
    }

    renderedNodes = newRenderedNodes;
  });

  return parent;
}
