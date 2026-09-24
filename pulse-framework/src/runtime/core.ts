// Pulse reactivity — fine-grained signals (measured: effect-per-binding + direct DOM writes beat batched DOM flush)

let activeEffect: Effect | null = null;

export type Accessor<T> = () => T;
export type Setter<T> = (v: T | ((prev: T) => T)) => void;
export type Signal<T> = [Accessor<T>, Setter<T>];

interface ReactiveNode {
  subscribers: Set<Effect>;
}

interface Effect {
  run: () => void;
  deps: Set<ReactiveNode>;
  cleanups: Array<() => void>;
  disposed: boolean;
}

let batchDepth = 0;
const batchQueue = new Set<Effect>();

function cleanupEffect(effect: Effect) {
  for (const node of effect.deps) node.subscribers.delete(effect);
  effect.deps.clear();
  for (const c of effect.cleanups) {
    try { c(); } catch (e) { console.error(e); }
  }
  effect.cleanups = [];
}

function queueEffect(effect: Effect) {
  if (effect.disposed) return;
  if (batchDepth > 0) {
    batchQueue.add(effect);
  } else {
    effect.run();
  }
}

export function batch<T>(fn: () => T): T {
  batchDepth++;
  try {
    return fn();
  } finally {
    batchDepth--;
    if (batchDepth === 0 && batchQueue.size) {
      const q = [...batchQueue];
      batchQueue.clear();
      for (const e of q) e.run();
    }
  }
}

export function createSignal<T>(initial: T): Signal<T> {
  let value = initial;
  const node: ReactiveNode = { subscribers: new Set() };

  const read: Accessor<T> = () => {
    if (activeEffect && !activeEffect.disposed) {
      node.subscribers.add(activeEffect);
      activeEffect.deps.add(node);
    }
    return value;
  };

  const write: Setter<T> = (next) => {
    const v = typeof next === 'function' ? (next as (p: T) => T)(value) : next;
    if (!Object.is(value, v)) {
      value = v;
      for (const sub of [...node.subscribers]) queueEffect(sub);
    }
  };

  return [read, write];
}

export function createEffect(fn: () => void | (() => void)): () => void {
  const effect: Effect = {
    deps: new Set(),
    cleanups: [],
    disposed: false,
    run() {
      if (effect.disposed) return;
      cleanupEffect(effect);
      const prev = activeEffect;
      activeEffect = effect;
      try {
        const result = fn();
        if (typeof result === 'function') effect.cleanups.push(result);
      } finally {
        activeEffect = prev;
      }
    },
  };
  effect.run();
  return () => {
    effect.disposed = true;
    cleanupEffect(effect);
  };
}

export function onCleanup(fn: () => void) {
  if (activeEffect) activeEffect.cleanups.push(fn);
}

export function createMemo<T>(fn: () => T): Accessor<T> {
  const [get, set] = createSignal<T>(undefined as T);
  createEffect(() => set(fn()));
  return get;
}

export const createDerived = createMemo;
