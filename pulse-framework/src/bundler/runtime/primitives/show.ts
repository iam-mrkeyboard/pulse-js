// ============================================================================
// FILE: src/bundler/runtime/primitives/show.ts
// Show primitive source
// ============================================================================

export const SHOW_PRIMITIVE_SOURCE = `
import { createEffect } from '../core.js';

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
         // Switch to Showing
         if (currentNode && currentNode.parentNode === container) {
            container.removeChild(currentNode);
         }
         const content = typeof props.children === 'function' ? props.children() : props.children;
         currentNode = content instanceof Node ? content : document.createTextNode(String(content || ''));
         if (currentNode.classList) currentNode.classList.add('p-enter');
         container.insertBefore(currentNode, anchor);
         isShowing = true;
       } else {
         // Switch to Hiding (Fallback)
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
