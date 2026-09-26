import { describe, test, expect } from 'bun:test';
import { createSignal, createEffect, createMemo, batch, createSelector } from '../src/runtime/core';

describe('Pulse Core Reactivity', () => {
  test('createSignal should track values', () => {
    const [count, setCount] = createSignal(0);
    expect(count()).toBe(0);
    setCount(1);
    expect(count()).toBe(1);
  });

  test('createEffect should run initially', () => {
    let value = 0;
    createEffect(() => {
      value = 1;
    });
    expect(value).toBe(1);
  });

  test('createEffect should re-run when signal changes (async scheduler)', async () => {
    const [count, setCount] = createSignal(0);
    let double = 0;

    createEffect(() => {
      double = count() * 2;
    });

    expect(double).toBe(0);
    setCount(2);
    // Should depend on scheduler. If microtask, we await.
    // Assuming flushUpdates or await null works for microtasks.
    await new Promise(r => setTimeout(r, 0));
    expect(double).toBe(4);
  });

  test('createMemo should compute derived values', async () => {
    const [count, setCount] = createSignal(1);
    const double = createMemo(() => count() * 2);

    expect(double()).toBe(2);
    setCount(2);
    await new Promise(r => setTimeout(r, 0)); // Allow scheduler to run
    expect(double()).toBe(4);
  });

  test('scheduler should batch updates', async () => {
    const [count, setCount] = createSignal(0);
    let runs = 0;

    createEffect(() => {
      count();
      runs++;
    });

    expect(runs).toBe(1);

    // Multiple updates in same tick
    // Multiple updates in same tick
    batch(() => {
      setCount(1);
      setCount(2);
      setCount(3);
    });

    await new Promise(r => setTimeout(r, 0));

    // Should run once for initial, and once for batched update (or twice total)
    // Actually, createEffect runs synchronously initially. 
    // Then setting 1, 2, 3 should trigger scheduler. 
    // Scheduler deduplicates/batches? 
    // Pulse scheduler implemented in previous steps uses queueMicrotask and Set.
    // So it should run ONCE for the final value.
    expect(runs).toBe(2);
    expect(count()).toBe(3);
  });

  test('createSelector only notifies keys whose match status changed', () => {
    const [selected, setSelected] = createSignal<number | null>(null);
    const isSelected = createSelector(selected);
    const runs = new Map<number, number>();
    for (let i = 1; i <= 20; i++) {
      const id = i;
      createEffect(() => {
        isSelected(id);
        runs.set(id, (runs.get(id) || 0) + 1);
      });
    }
    for (let i = 1; i <= 20; i++) expect(runs.get(i)).toBe(1);

    setSelected(4);
    expect(runs.get(4)).toBe(2);
    for (let i = 1; i <= 20; i++) {
      if (i !== 4) expect(runs.get(i)).toBe(1);
    }

    setSelected(9);
    expect(runs.get(4)).toBe(3);
    expect(runs.get(9)).toBe(2);
    for (let i = 1; i <= 20; i++) {
      if (i !== 4 && i !== 9) expect(runs.get(i)).toBe(1);
    }
  });
});
