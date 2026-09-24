import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { createSignal } from '../src/runtime/core';
import { List } from '../src/runtime/primitives/list';

describe('Keyed List (prefix/suffix + Map)', () => {
  let root: HTMLDivElement;

  beforeEach(() => {
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  afterEach(() => {
    root.remove();
  });

  function mount(each: () => any[], key?: (item: any, i: number) => any) {
    const frag = List({
      each,
      key: key || ((item) => item.id),
      children: (item) => {
        const el = document.createElement('div');
        el.className = 'row';
        el.dataset.id = String(item.id);
        el.textContent = item.label || String(item.id);
        return el;
      },
    });
    root.appendChild(frag);
    return () => Array.from(root.querySelectorAll('.row')) as HTMLDivElement[];
  }

  test('append reuses existing DOM nodes', () => {
    const [items, setItems] = createSignal([
      { id: 1, label: 'a' },
      { id: 2, label: 'b' },
    ]);
    const rows = mount(() => items());
    const before = rows();
    expect(before.length).toBe(2);
    const n1 = before[0];
    setItems([...items(), { id: 3, label: 'c' }]);
    const after = rows();
    expect(after.length).toBe(3);
    expect(after[0]).toBe(n1);
  });

  test('remove keeps remaining node identity', () => {
    const [items, setItems] = createSignal([
      { id: 1, label: 'a' },
      { id: 2, label: 'b' },
      { id: 3, label: 'c' },
    ]);
    const rows = mount(() => items());
    const keep = rows()[2];
    setItems(items().filter((x) => x.id !== 2));
    const after = rows();
    expect(after.map((r) => r.dataset.id)).toEqual(['1', '3']);
    expect(after[1]).toBe(keep);
  });

  test('swap reuses both nodes', () => {
    const [items, setItems] = createSignal([
      { id: 1, label: 'a' },
      { id: 2, label: 'b' },
      { id: 3, label: 'c' },
    ]);
    const rows = mount(() => items());
    const [a, b, c] = rows();
    setItems([items()[0], items()[2], items()[1]]);
    const after = rows();
    expect(after[0]).toBe(a);
    expect(after[1]).toBe(c);
    expect(after[2]).toBe(b);
  });

  test('reverse reuses all nodes', () => {
    const [items, setItems] = createSignal([
      { id: 1 },
      { id: 2 },
      { id: 3 },
    ]);
    const rows = mount(() => items());
    const before = rows();
    setItems([...items()].reverse());
    const after = rows();
    expect(after[0]).toBe(before[2]);
    expect(after[2]).toBe(before[0]);
  });

  test('clear removes all', () => {
    const [items, setItems] = createSignal([{ id: 1 }, { id: 2 }]);
    const rows = mount(() => items());
    setItems([]);
    expect(rows().length).toBe(0);
  });
});
