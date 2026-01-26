// ============================================================================
// FILE: src/server/runtime/inline-runtime.ts
// Extracted from dev-server.ts - Core runtime source code
// ============================================================================

/**
 * Returns the source code for the core runtime (served to browser)
 */
export function getInlineRuntime(): string {
  return `
// Pulse v0.11.0 Core Runtime
let activeEffect = null;
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
activeEffect = effect;
try {
fn();
} finally {
activeEffect = null;
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
`;
}
