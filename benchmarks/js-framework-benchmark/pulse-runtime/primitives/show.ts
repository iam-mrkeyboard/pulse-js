import { createEffect } from '../core.js';
import { P_SHOW } from '../ssr-markers.js';

export type ShowProps = {
  when: () => any;
  initialNodes?: Node[];
  children: () => Node;
  fallback?: () => Node;
  /** Keep SSR content inside this host (pulse-show); do not replaceWith. */
  host?: Element;
};

export function Show(props: ShowProps) {
  const anchor = document.createComment('Show Anchor');
  const frag = document.createDocumentFragment();

  let cachedTrueNodes: Node[] | null = null;
  let cachedFalseNodes: Node[] | null = null;
  let currentNodes: Node[] = [];
  let isHydrating = false;

  if (props.host) {
    props.host.setAttribute(P_SHOW, '1');
    // Existing rendered branch nodes (everything except <template>)
    const existing = Array.from(props.host.childNodes).filter(
      (n) => n.nodeType === Node.ELEMENT_NODE && (n as HTMLElement).tagName !== 'TEMPLATE',
    );
    if (existing.length > 0 || (props.initialNodes && props.initialNodes.length)) {
      isHydrating = true;
      currentNodes = props.initialNodes?.length ? [...props.initialNodes] : existing;
    }
    props.host.appendChild(anchor);
  } else {
    frag.appendChild(anchor);
    if (props.initialNodes && props.initialNodes.length > 0) {
      isHydrating = true;
      props.initialNodes.forEach((node) => {
        frag.insertBefore(node, anchor);
      });
      currentNodes = [...props.initialNodes];
    }
  }

  createEffect(() => {
    const container = (props.host || anchor.parentNode) as ParentNode | null;
    if (!container) return;

    let condition = false;
    try {
      condition = !!props.when();
    } catch (err) {
      console.error('Pulse: Error evaluating Show "when":', err);
    }

    if (isHydrating) {
      if (condition) cachedTrueNodes = [...currentNodes];
      else cachedFalseNodes = [...currentNodes];
      isHydrating = false;
      return;
    }

    currentNodes.forEach((node) => {
      if (node.parentNode) node.parentNode.removeChild(node);
    });
    currentNodes = [];

    let targetNodes: Node[] = [];

    if (condition) {
      if (cachedTrueNodes) {
        targetNodes = cachedTrueNodes;
      } else {
        try {
          const content = props.children();
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
    } else if (cachedFalseNodes) {
      targetNodes = cachedFalseNodes;
    } else if (props.fallback) {
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

    targetNodes.forEach((node) => {
      container.insertBefore(node, anchor);
    });
    currentNodes = targetNodes;
  });

  return props.host ? (props.host as unknown as DocumentFragment) : frag;
}
