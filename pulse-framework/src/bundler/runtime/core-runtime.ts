// ============================================================================
// FILE: src/bundler/runtime/core-runtime.ts
// Pre-built core runtime source (not compiled, this is the source)
// ============================================================================

export const CORE_RUNTIME_SOURCE = `
// Pulse v0.11.0 Core Runtime - Signal System
let activeEffect = null;
const effectStack = [];

export function createSignal(initialValue) {
  let value = initialValue;
  const subscribers = new Set();
  
  const read = () => {
    if (activeEffect) subscribers.add(activeEffect);
    return value;
  };
  
  const write = (newValue) => {
    const next = typeof newValue === 'function' ? newValue(value) : newValue;
    if (value !== next) {
      value = next;
      subscribers.forEach(effect => effect());
    }
  };
  
  return [read, write];
}

export function createEffect(fn) {
  const effect = () => {
    effectStack.push(effect);
    activeEffect = effect;
    try {
      fn();
    } finally {
      effectStack.pop();
      activeEffect = effectStack[effectStack.length - 1] || null;
    }
  };
  effect();
  return effect;
}

export function createMemo(fn) {
  const [signal, setSignal] = createSignal();
  createEffect(() => setSignal(fn()));
  return signal;
}

export function batch(fn) {
  const updates = [];
  let batching = true;
  try {
    fn();
  } finally {
    batching = false;
    updates.forEach(update => update());
  }
}

export function hydrate(selector, Component, props = {}) {
  const el = document.querySelector(selector);
  if (!el) return console.warn('[Pulse] Hydration target not found:', selector);
  
  try {
    const vnode = Component(props);
    if (vnode instanceof HTMLElement) {
      el.replaceWith(vnode);
    } else if (vnode instanceof DocumentFragment) {
      el.replaceWith(...Array.from(vnode.childNodes));
    } else if (vnode && typeof vnode === 'object' && 'nodeType' in vnode) {
      el.replaceWith(vnode);
    } else {
      console.warn('[Pulse] Component did not return a valid DOM node');
    }
  } catch (error) {
    console.error('[Pulse] Hydration error:', error);
  }
}
`;
