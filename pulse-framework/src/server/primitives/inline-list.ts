// ============================================================================
// FILE: src/server/primitives/inline-list.ts
// Extracted from dev-server.ts - List primitive source code
// ============================================================================

/**
 * Returns the source code for the List primitive (served to browser)
 */
export function getInlineListPrimitive(): string {
  return `
// Pulse List Primitive
import { createEffect } from '/runtime/core.js';

export function List(props) {
  const container = document.createElement('div');
  container.style.display = 'contents';
  container.setAttribute('data-pulse-list', 'true');
  
  const itemsGetter = typeof props.each === 'function' ? props.each : () => props.each || [];
  const template = props.children;
  const keyFn = props.key || ((item, index) => item?.id ?? item?.key ?? index);
  
  let prevItems = [];
  let prevNodes = new Map();
  
  createEffect(() => {
    const items = itemsGetter();
    console.log('[List Debug] items:', items);
    const newItems = Array.isArray(items) ? items : [];
    
    const newKeys = new Map();
    newItems.forEach((item, index) => {
      const key = keyFn(item, index);
      newKeys.set(key, { item, index });
    });

    const oldKeys = new Map();
    prevItems.forEach((item, index) => {
      const key = keyFn(item, index);
      oldKeys.set(key, { item, index });
    });
    
    const nodesToKeep = new Map();
    const nodesToAdd = [];
    const nodesToRemove = [];
    
    newKeys.forEach((newData, key) => {
      if (oldKeys.has(key)) {
        const oldData = oldKeys.get(key);
        const node = prevNodes.get(key);
        if (node && oldData.item === newData.item) {
          nodesToKeep.set(key, { node, item: newData.item, index: newData.index });
        } else {
          nodesToAdd.push({ key, item: newData.item, index: newData.index });
        }
      } else {
        nodesToAdd.push({ key, item: newData.item, index: newData.index });
      }
    });
    
    oldKeys.forEach((oldData, key) => {
      if (!newKeys.has(key)) {
        const node = prevNodes.get(key);
        if (node) nodesToRemove.push({ key, node });
      }
    });
    
    nodesToRemove.forEach(({ key, node }) => {
      if (node.parentNode === container) container.removeChild(node);
      prevNodes.delete(key);
    });
    
    const newNodes = new Map();
    nodesToKeep.forEach(({ node }, key) => {
      newNodes.set(key, node);
    });

    nodesToAdd.forEach(({ key, item, index }) => {
      const node = typeof template === 'function' ? template(item, index) : document.createTextNode(String(item));
      newNodes.set(key, node instanceof Node ? node : document.createTextNode(String(node)));
    });
    
    const fragment = document.createDocumentFragment();
    newItems.forEach((item, index) => {
      const key = keyFn(item, index);
      const node = newNodes.get(key);
      if (node) fragment.appendChild(node);
    });
    
    container.innerHTML = '';
    container.appendChild(fragment);
    
    prevItems = newItems;
    prevNodes = newNodes;
  });
  
  return container;
}
`;
}
