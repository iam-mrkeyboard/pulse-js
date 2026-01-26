// ============================================================================
// FILE: src/server/primitives/inline-show.ts
// Extracted from dev-server.ts - Show primitive source code
// ============================================================================

/**
 * Returns the source code for the Show primitive (served to browser)
 */
export function getInlineShowPrimitive(): string {
  return `
// Pulse Show Primitive
import { createEffect } from '/runtime/core.js';

export function Show(props) {
  const anchor = document.createComment('show');
  const container = document.createElement('div');
  container.style.display = 'contents';
  container.appendChild(anchor);
  
  let currentNode = null;
  let isShowing = false;
  let init = true;
  
  createEffect(() => {
    const condition = typeof props.when === 'function' ? props.when() : props.when;
    const shouldShow = !!condition;

    if (init || shouldShow !== isShowing) {
       if (shouldShow) {
         if (currentNode && currentNode.parentNode === container) {
            container.removeChild(currentNode);
         }
         const content = typeof props.children === 'function' ? props.children() : props.children;
         currentNode = content instanceof Node ? content : document.createTextNode(String(content || ''));
         if (currentNode.classList) currentNode.classList.add('p-enter');
         container.insertBefore(currentNode, anchor);
         isShowing = true;
       } else {
         if (currentNode && currentNode.parentNode === container) {
            container.removeChild(currentNode);
         }
         if (props.fallback) {
            const fallback = typeof props.fallback === 'function' ? props.fallback() : props.fallback;
            currentNode = fallback instanceof Node ? fallback : document.createTextNode(String(fallback || ''));
             if (currentNode.classList) currentNode.classList.add('p-enter');
            container.insertBefore(currentNode, anchor);
         } else {
            currentNode = null;
         }
         isShowing = false;
       }
       init = false;
    }
  });
  
  return container;
}
`;
}
