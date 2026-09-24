import { createEffect } from '../core.js';

export function Show(props: { when: () => any, initialNodes?: Node[], children: () => Node, fallback?: () => Node }) {

  const anchor = document.createComment('Show Anchor');
  const parent = document.createDocumentFragment();
  parent.appendChild(anchor);

  // Cache for branches
  let cachedTrueNodes: Node[] | null = null;
  let cachedFalseNodes: Node[] | null = null;

  // Track currently rendered nodes to easy detach
  let currentNodes: Node[] = [];

  // Hydration logic
  let isHydrating = !!(props.initialNodes && props.initialNodes.length > 0);
  if (isHydrating && props.initialNodes) {
    // During hydration, the nodes are already in the DOM (passed to us).
    // We adopt them into our parent fragment so they don't get lost when `el.replaceWith(parent)` happens.
    props.initialNodes.forEach(node => {
      parent.insertBefore(node, anchor);
    });

    // We assume the server rendered the "correct" initial state.
    // We populate the cache and currentNodes with what we found.
    // Determining WHICH branch it was is tricky without extra meta-data,
    // but usually we can assume the initial 'when()' evaluates to matching state.
    currentNodes = [...props.initialNodes];
  }

  createEffect(() => {
    const container = anchor.parentNode;
    if (!container) return;

    let condition = false;
    try {
      condition = !!props.when();
    } catch (err) {
      console.error('Pulse: Error evaluating Show "when":', err);
    }

    if (isHydrating) {
      // First run during hydration: trust the DOM.
      // But we should set the appropriate cache so future updates work.
      if (condition) {
        cachedTrueNodes = [...currentNodes];
      } else {
        cachedFalseNodes = [...currentNodes];
      }
      isHydrating = false;
      return;
    }

    // 1. Detach current nodes (don't destroy if we want to cache)
    // Actually, we ALWAYS want to cache in this new model.
    currentNodes.forEach(node => {
      if (node.parentNode) node.parentNode.removeChild(node);
    });
    currentNodes = [];

    // 2. Load or Create nodes for the target branch
    let targetNodes: Node[] = [];

    if (condition) {
      // TRUE Branch
      if (cachedTrueNodes) {
        console.log('[Pulse Show] Using cached TRUE branch');
        targetNodes = cachedTrueNodes;
      } else {
        console.log('[Pulse Show] Rendering new TRUE branch');
        try {
          const content = props.children();
          // content might be a Fragment or single Node
          if (content.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
            targetNodes = Array.from(content.childNodes);
          } else {
            targetNodes = [content];
          }
          cachedTrueNodes = targetNodes;
        } catch (e) {
          console.error('Pulse: Error rendering Show children:', e);
        }
      }
    } else {
      // FALSE Branch
      if (cachedFalseNodes) {
        // console.log('[Pulse Show] Using cached FALSE branch');
        targetNodes = cachedFalseNodes;
      } else if (props.fallback) {
        console.log('[Pulse Show] Rendering new FALSE branch');
        try {
          const content = props.fallback();
          if (content.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
            targetNodes = Array.from(content.childNodes);
          } else {
            targetNodes = [content];
          }
          cachedFalseNodes = targetNodes;
        } catch (e) {
          console.error('Pulse: Error rendering Show fallback:', e);
        }
      }
    }

    // 3. Mount target nodes
    targetNodes.forEach(node => {
      container.insertBefore(node, anchor);
    });
    currentNodes = targetNodes;
  });

  return parent;
}
