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
}

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

  effect.execute();
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
      // We might need to check disposal if we support it
      effect.execute();
    });
  }
}

// Internal Helper to queue effect
function queueEffect(effect: Effect) {
  if (batchDepth > 0) {
    batchQueue.add(effect);
  } else {
    effect.execute();
  }
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
