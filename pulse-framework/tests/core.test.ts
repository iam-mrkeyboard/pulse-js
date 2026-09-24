import { describe, test, expect } from 'bun:test';
import { createSignal, createEffect, createMemo, batch } from '../src/runtime/core';

describe('Pulse core reactivity', () => {
  test('createSignal get/set', () => {
    const [count, setCount] = createSignal(0);
    expect(count()).toBe(0);
    setCount(2);
    expect(count()).toBe(2);
  });

  test('createEffect tracks and re-runs synchronously', () => {
    const [count, setCount] = createSignal(0);
    let seen = -1;
    createEffect(() => {
      seen = count();
    });
    expect(seen).toBe(0);
    setCount(5);
    expect(seen).toBe(5);
  });

  test('batch coalesces effect runs', () => {
    const [a, setA] = createSignal(0);
    const [b, setB] = createSignal(0);
    let runs = 0;
    createEffect(() => {
      a();
      b();
      runs++;
    });
    expect(runs).toBe(1);
    batch(() => {
      setA(1);
      setB(2);
    });
    expect(runs).toBe(2);
    expect(a()).toBe(1);
    expect(b()).toBe(2);
  });

  test('createMemo derives', () => {
    const [n, setN] = createSignal(2);
    const doubled = createMemo(() => n() * 2);
    expect(doubled()).toBe(4);
    setN(3);
    expect(doubled()).toBe(6);
  });
});
