// ============================================================================
// FILE: src/bundler/runtime/primitives/portal.ts
// Portal primitive source
// ============================================================================

export const PORTAL_PRIMITIVE_SOURCE = `
import { createEffect } from '../core.js';

export function Portal(props) {
  const placeholder = document.createComment('portal');
  
  createEffect(() => {
    const target = typeof props.target === 'string' 
      ? document.querySelector(props.target)
      : props.target;
    
    if (!target) {
      console.warn('Portal target not found:', props.target);
      return;
    }
    
    const content = typeof props.children === 'function' ? props.children() : props.children;
    const node = content instanceof Node ? content : document.createTextNode(String(content || ''));
    
    target.appendChild(node);
    
    return () => {
      if (node.parentNode === target) target.removeChild(node);
    };
  });
  
  return placeholder;
}
`;
