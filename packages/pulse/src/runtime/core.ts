// ============================================================================
// FILE: src/runtime/core.ts
// Automatic Dependency Tracking Reactivity System
// ============================================================================

// Global context for dependency tracking
let context: Effect | null = null;

// ----------------------------------------------------------------------------
// Types
// ----------------------------------------------------------------------------

export type Accessor<T> = () => T;
export type Setter<T> = (newValue: T | ((prev: T) => T)) => void;
export type Signal<T> = [Accessor<T>, Setter<T>];

interface ReactiveNode {
  subscribers: Set<Effect>;
}

interface Effect {
  execute(): void;
  cleanup?: () => void;
  dependencies: Set<ReactiveNode>;
  disposed?: boolean;
}

/** Nested createRoot owners collect child effects for disposal. */
let ownerStack: Effect[][] | null = null;

// ----------------------------------------------------------------------------
// Core Primitives
// ----------------------------------------------------------------------------

export function createSignal<T>(initialValue: T): Signal<T> {
  let value = initialValue;
  const node: ReactiveNode = { subscribers: new Set() };

  const read = () => {
    if (context) {
      context.dependencies.add(node);
      node.subscribers.add(context);
    }
    return value;
  };

  const write = (newValue: T | ((prev: T) => T)) => {
    const nextValue = newValue instanceof Function ? newValue(value) : newValue;
    if (value !== nextValue) {
      value = nextValue;
      // Notify subscribers
      // We need to copy subscribers to avoid infinite loops if an effect modifies the signal it reads?
      // Usually reactivity systems batch or copy.
      const subs = [...node.subscribers];
      for (const sub of subs) {
        queueEffect(sub);
      }
    }
  };

  return [read, write];
}

export function createEffect(fn: () => void | (() => void)) {
  const effect: Effect = {
    execute() {
      if (effect.disposed) return;
      // Cleanup previous dependencies
      cleanup(effect);

      const prevContext = context;
      context = effect;

      try {
        const result = fn();
        if (typeof result === 'function') {
          effect.cleanup = result;
        }
      } finally {
        context = prevContext;
      }
    },
    dependencies: new Set()
  };

  if (ownerStack && ownerStack.length > 0) {
    ownerStack[ownerStack.length - 1].push(effect);
  }

  effect.execute();
}

/**
 * Collect effects created inside `fn` and return a disposer.
 * List uses this so removed rows drop their effects (createSelector, label, …).
 */
export function createRoot<T>(fn: (dispose: () => void) => T): T {
  const owned: Effect[] = [];
  if (!ownerStack) ownerStack = [];
  ownerStack.push(owned);
  let closed = false;
  const dispose = () => {
    if (closed) return;
    closed = true;
    for (let i = owned.length - 1; i >= 0; i--) disposeEffect(owned[i]);
    owned.length = 0;
  };
  try {
    return fn(dispose);
  } finally {
    ownerStack.pop();
    if (ownerStack.length === 0) ownerStack = null;
  }
}

export function onCleanup(fn: () => void) {
  if (context) {
    const prev = context.cleanup;
    context.cleanup = prev
      ? () => { prev(); fn(); }
      : fn;
  }
}

export function createMemo<T>(fn: () => T): Accessor<T> {
  const [signal, setSignal] = createSignal<T>(undefined as any);

  createEffect(() => {
    setSignal(fn());
  });

  return signal;
}

// ----------------------------------------------------------------------------
// Internal Helpers
// ----------------------------------------------------------------------------

function cleanup(effect: Effect) {
  // Remove this effect from all its dependencies' subscriber lists
  for (const dep of effect.dependencies) {
    dep.subscribers.delete(effect);
  }
  effect.dependencies.clear();

  // Run user cleanup
  if (effect.cleanup) {
    effect.cleanup();
    effect.cleanup = undefined;
  }
}

function disposeEffect(effect: Effect) {
  effect.disposed = true;
  cleanup(effect);
}

// Batching & Scheduler
const batchQueue = new Set<Effect>();
let batchDepth = 0;

export function batch(fn: () => void) {
  batchDepth++;
  try {
    fn();
  } finally {
    batchDepth--;
    if (batchDepth === 0) {
      flushUpdates();
    }
  }
}

function flushUpdates() {
  if (batchQueue.size > 0) {
    const effects = Array.from(batchQueue);
    batchQueue.clear();
    effects.forEach(effect => {
      if (!effect.disposed) effect.execute();
    });
  }
}

// Internal Helper to queue effect
function queueEffect(effect: Effect) {
  if (effect.disposed) return;
  if (batchDepth > 0) {
    batchQueue.add(effect);
  } else {
    effect.execute();
  }
}

/**
 * Selector that only notifies subscribers whose match status changed.
 * `isSelected(key)` is O(1) to read; a source update wakes the keys that
 * entered or left the match (typically 2 for a selected-id).
 */
export function createSelector<T, U = T>(
  source: Accessor<T>,
  equals: (key: U, value: T) => boolean = (key, value) => (key as unknown as T) === value,
): (key: U) => boolean {
  const subs = new Map<U, Set<Effect>>();
  let current = untrack(source);
  let primed = false;

  createEffect(() => {
    const next = source();
    const prev = current;
    current = next;
    if (primed) {
      for (const [key, effects] of [...subs]) {
        if (equals(key, prev) !== equals(key, next)) {
          for (const effect of [...effects]) {
            queueEffect(effect);
          }
        }
      }
    }
    primed = true;
  });

  return (key: U) => {
    if (context) {
      let set = subs.get(key);
      if (!set) {
        set = new Set();
        subs.set(key, set);
      }
      set.add(context);
      const effect = context;
      onCleanup(() => {
        set!.delete(effect);
        if (set!.size === 0) subs.delete(key);
      });
    }
    return equals(key, current);
  };
}

// Untrack: Run a function without tracking dependencies
export function untrack<T>(fn: () => T): T {
  const prevContext = context;
  context = null;
  try {
    return fn();
  } finally {
    context = prevContext;
  }
}
