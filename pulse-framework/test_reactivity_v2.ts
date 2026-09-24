
import { createSignal, createEffect, createMemo } from './src/runtime/reactivity-v2';

console.log('--- Testing Reactivity V2 ---');

// Test 1: Basic Signal
const [count, setCount] = createSignal(0);
console.log('Initial count:', count()); // 0

let effectRunCount = 0;
let observedValue = -1;

// Test 2: Effect with Auto-Tracking
createEffect(() => {
  observedValue = count();
  effectRunCount++;
  console.log(`Effect ran. Count is now: ${observedValue}`);
});

if (observedValue === 0 && effectRunCount === 1) {
  console.log('✅ Effect ran initially');
} else {
  console.error('❌ Effect failed initial run');
}

// Test 3: Update Signal
setCount(1);
if (observedValue === 1 && effectRunCount === 2) {
  console.log('✅ Effect reacted to update');
} else {
  console.error('❌ Effect failed to react');
}

// Test 4: Derived State (Memo)
const [name, setName] = createSignal('Pulse');
const greeting = createMemo(() => `Hello ${name()}`);

console.log('Memo initial:', greeting());

if (greeting() === 'Hello Pulse') {
  console.log('✅ Memo initial value correct');
} else {
  console.error('❌ Memo initial value wrong');
}

setName('World');
if (greeting() === 'Hello World') {
  console.log('✅ Memo updated correctly');
} else {
  console.error('❌ Memo failed to update');
}

console.log('--- Done ---');
