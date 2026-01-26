// Reactivity System Implementation

let activeEffect: (() => void) | null = null;
const effectStack: (() => void)[] = [];

export function createSignal<T>(initialValue: T) {
  let value = initialValue;
  const subscribers = new Set<() => void>();

  const read = () => {
    if (activeEffect) {
      if (!subscribers.has(activeEffect)) {
        // console.log('[Pulse Core] Signal read: subscribing effect.', 'Subscribers:', subscribers.size + 1);
        subscribers.add(activeEffect);
      }
    } else {
      // console.log('[Pulse Core] Signal read: no active effect. Value:', value);
    }
    return value;
  };

  const write = (newValue: T | ((prev: T) => T)) => {
    // Handle function updates
    const nextValue = typeof newValue === 'function'
      ? (newValue as Function)(value)
      : newValue;

    if (value !== nextValue) {
      // console.log('[Pulse Core] Signal write:', value, '->', nextValue, 'Subscribers:', subscribers.size);
      value = nextValue;
      // Notify subscribers
      // Snapshot to avoid infinite loops if effects mutate same signal
      const runQueue = [...Array.from(subscribers)];
      if (runQueue.length > 0) {
        // console.log('[Pulse Core] Notifying', runQueue.length, 'subscribers');
      } else {
        // console.warn('[Pulse Core] Signal updated but no subscribers!');
      }
      runQueue.forEach(fn => fn());
    }
  };

  return [read, write] as const;
}

export function createEffect(fn: () => void) {
  const effect = () => {
    if (effectStack.includes(effect)) return; // Prevent recursive cycles

    try {
      activeEffect = effect;
      effectStack.push(effect);
      fn();
    } finally {
      effectStack.pop();
      activeEffect = effectStack[effectStack.length - 1] || null;
    }
  };

  effect(); // Initial run
}

export function createMemo<T>(fn: () => T) {
  const [val, setVal] = createSignal<T>(undefined as any);

  createEffect(() => {
    setVal(fn());
  });

  return val;
}

export function createDerived<T>(fn: () => T) {
  return createMemo(fn);
}
