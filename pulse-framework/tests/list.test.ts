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

  test('distant swap reuses nodes and does not move the whole list', () => {
    const initial = Array.from({ length: 20 }, (_, i) => ({ id: i + 1, label: String(i + 1) }));
    const [items, setItems] = createSignal(initial);
    const rows = mount(() => items());
    const before = rows();
    const n1 = before[1];
    const n18 = before[18];

    let moves = 0;
    const parent = n1.parentNode as HTMLElement;
    const orig = parent.insertBefore.bind(parent);
    parent.insertBefore = ((node: Node, ref: Node | null) => {
      moves++;
      return orig(node, ref);
    }) as any;

    const next = items().slice();
    const tmp = next[1];
    next[1] = next[18];
    next[18] = tmp;
    setItems(next);

    const after = rows();
    expect(after[1]).toBe(n18);
    expect(after[18]).toBe(n1);
    expect(after[0]).toBe(before[0]);
    expect(after[19]).toBe(before[19]);
    expect(moves).toBeLessThanOrEqual(4);
  });
});

describe('List duplicate keys', () => {
  test('warns in development when keys collide', () => {
    const warnings: string[] = [];
    const orig = console.warn;
    console.warn = (...args: any[]) => { warnings.push(String(args[0])); };
    try {
      const host = document.createElement('tbody');
      document.body.appendChild(host);
      const [items, setItems] = createSignal([{ id: 1 }, { id: 1 }]);
      List({
        each: () => items(),
        key: (r: any) => r.id,
        children: (r: any) => {
          const tr = document.createElement('tr');
          tr.dataset.id = String(r.id);
          return tr;
        },
        host,
      } as any);
      expect(warnings.some(w => w.includes('Duplicate key'))).toBe(true);
      host.remove();
    } finally {
      console.warn = orig;
    }
  });
});

describe('List item identity remount', () => {
  test('same key with new object remounts the row', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const [items, setItems] = createSignal([{ id: 1, label: 'a' }]);
    let mounts = 0;
    List({
      each: () => items(),
      key: (r: any) => r.id,
      children: (r: any) => {
        mounts++;
        const el = document.createElement('div');
        el.textContent = r.label;
        el.dataset.id = String(r.id);
        return el;
      },
      host,
    } as any);
    expect(mounts).toBe(1);
    expect(host.firstElementChild?.textContent).toBe('a');
    setItems([{ id: 1, label: 'b' }]);
    expect(mounts).toBe(2);
    expect(host.firstElementChild?.textContent).toBe('b');
    host.remove();
  });

  test('same key same object reference does not remount', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const row = { id: 1, label: 'a' };
    const [items, setItems] = createSignal([row]);
    let mounts = 0;
    List({
      each: () => items(),
      key: (r: any) => r.id,
      children: (r: any) => {
        mounts++;
        const el = document.createElement('div');
        el.textContent = r.label;
        return el;
      },
      host,
    } as any);
    expect(mounts).toBe(1);
    setItems([row]); // same ref
    expect(mounts).toBe(1);
    host.remove();
  });
});
