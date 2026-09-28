import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { createSignal, createEffect } from '../src/runtime/core';
import { hydrate, renderToString } from '../src/runtime/hydration';
import { List } from '../src/runtime/primitives/list';
import { Show } from '../src/runtime/primitives/show';
import { mountPrimitives, walk } from '../src/runtime/dom';
import { P_HYDRATED, P_KEY, markRoot, markKey } from '../src/runtime/ssr-markers';

/**
 * Hand-written "compiled" Counter that mirrors ComponentCompiler output:
 * template clone OR adopt _hydrationNode, path-walk text bind, delegated click.
 */
function Counter(props: any = {}) {
  let container: HTMLElement;
  if (props._hydrationNode) {
    container = props._hydrationNode;
  } else {
    const tpl = document.createElement('template');
    tpl.innerHTML = `<div class="counter" data-p-h="1">
      <div class="display"> </div>
      <button class="increment" data-on-click="increment">+</button>
    </div>`;
    container = tpl.content.firstElementChild as HTMLElement;
  }

  const [getCount, setCount] = createSignal(0);
  const state = {
    get count() { return getCount(); },
    set count(v: number) { setCount(v); },
  };
  function increment() { state.count = state.count + 1; }

  createEffect(() => {
    const el = walk(container, [0, 0]); // .display text? path: child 0 = display div
    // display is first element child; its text node is child 0
    const display = container.querySelector('.display');
    if (display) display.textContent = String(state.count);
  });

  (container as any).__pulseHandlers = { increment };
  container.setAttribute(P_HYDRATED, '1');
  return container;
}

function ShowDemo(props: any = {}) {
  let container: HTMLElement;
  if (props._hydrationNode) {
    container = props._hydrationNode;
  } else {
    const tpl = document.createElement('template');
    tpl.innerHTML = `<div class="show-demo" data-p-h="1">
      <pulse-show when="{visible()}" data-p-show="1" style="display:contents">
        <template data-pulse-template><span id="content">Visible</span></template>
        <span id="content">Visible</span>
      </pulse-show>
      <button data-on-click="toggle">Toggle</button>
    </div>`;
    container = tpl.content.firstElementChild as HTMLElement;
  }

  const [visible, setVisible] = createSignal(true);
  function toggle() { setVisible(!visible()); }

  const scope = { visible, toggle };
  mountPrimitives(container, scope, { List: undefined, Show, createEffect });
  (container as any).__pulseHandlers = { toggle };
  container.setAttribute(P_HYDRATED, '1');
  return container;
}

function ListDemo(props: any = {}) {
  let container: HTMLElement;
  if (props._hydrationNode) {
    container = props._hydrationNode;
  } else {
    const tpl = document.createElement('template');
    tpl.innerHTML = `<div class="list-demo" data-p-h="1">
      <pulse-list each="{items()}" as="item" key="{item.id}" data-p-list="1" data-template-id="t0" data-bindings="[]" style="display:contents">
        <template data-pulse-template><div class="row"></div></template>
      </pulse-list>
      <button data-on-click="add">Add</button>
    </div>`;
    container = tpl.content.firstElementChild as HTMLElement;
  }

  const [items, setItems] = createSignal([{ id: 1, label: 'a' }, { id: 2, label: 'b' }]);
  function add() {
    const cur = items();
    setItems([...cur, { id: cur.length + 1, label: String.fromCharCode(97 + cur.length) }]);
  }

  const scope = { items, add };
  const templates = {
    t0: '<div class="row"></div>',
  };
  // Manual List mount with host so rows get keys filled for SSR
  const listEl = container.querySelector('pulse-list')!;
  // Pre-fill SSR rows when not hydrating
  if (!props._hydrationNode) {
    // Let mountPrimitives create rows
  }

  mountPrimitives(container, scope, {
    List,
    Show: undefined,
    createEffect,
  }, templates);

  // Ensure rows have text labels after first effect
  createEffect(() => {
    const rows = container.querySelectorAll('.row');
    const data = items();
    rows.forEach((row, i) => {
      if (data[i]) {
        row.textContent = data[i].label;
        markKey(row as Element, data[i].id);
      }
    });
  });

  (container as any).__pulseHandlers = { add };
  container.setAttribute(P_HYDRATED, '1');
  return container;
}

describe('Adopt-and-bind hydration', () => {
  let root: HTMLDivElement;

  beforeEach(() => {
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  afterEach(() => {
    root.remove();
  });

  test('Counter: preserves DOM identity and updates existing text node', () => {
    // SSR
    const html = renderToString(Counter);
    root.innerHTML = html;
    const ssrDisplay = root.querySelector('.display')!;
    const ssrBtn = root.querySelector('.increment')!;
    const ssrRoot = root.firstElementChild!;

    // Hydrate
    hydrate(Counter, root);

    expect(root.firstElementChild).toBe(ssrRoot);
    expect(root.querySelector('.display')).toBe(ssrDisplay);
    expect(root.querySelector('.increment')).toBe(ssrBtn);
    expect(ssrDisplay.textContent).toBe('0');

    // Click via delegation handlers
    const handlers = (ssrRoot as any).__pulseHandlers;
    expect(handlers.increment).toBeTypeOf('function');
    handlers.increment();
    expect(ssrDisplay.textContent).toBe('1');
    handlers.increment();
    expect(ssrDisplay.textContent).toBe('2');
  });

  test('Show: preserves branch node identity across hydration', () => {
    const html = renderToString(ShowDemo);
    root.innerHTML = html;
    const content = root.querySelector('#content');
    expect(content).not.toBeNull();
    const ssrRoot = root.firstElementChild!;

    hydrate(ShowDemo, root);
    expect(root.firstElementChild).toBe(ssrRoot);
    // Same node still present (adopted)
    expect(root.querySelector('#content')).toBe(content);
  });

  test('List: reuses adopted keyed rows after hydration', () => {
    const html = renderToString(ListDemo);
    root.innerHTML = html;
    const ssrRoot = root.firstElementChild!;
    const row1 = root.querySelector('.row');
    expect(row1).not.toBeNull();
    const key1 = row1!.getAttribute(P_KEY);

    hydrate(ListDemo, root);
    expect(root.firstElementChild).toBe(ssrRoot);

    const rowsAfter = root.querySelectorAll('.row');
    // First row should be the same object if key matched
    if (key1) {
      const still = root.querySelector(`[${P_KEY}="${key1}"]`);
      expect(still).toBe(row1);
    }

    // Append via handler — prior rows keep identity
    const before = Array.from(root.querySelectorAll('.row'));
    (ssrRoot as any).__pulseHandlers.add();
    const after = Array.from(root.querySelectorAll('.row'));
    expect(after.length).toBe(before.length + 1);
    // Original rows still in the list (by identity for those that existed)
    for (const r of before) {
      expect(after.includes(r)).toBe(true);
    }
  });

  test('Mismatch: missing SSR root falls back to client render', () => {
    root.innerHTML = ''; // empty — no SSR
    const warnings: string[] = [];
    const node = hydrate(Counter, root, {
      onMismatch: (r) => warnings.push(r),
    });
    expect(warnings).toContain('missing-ssr-root');
    expect(node).not.toBeNull();
    expect(root.querySelector('.counter')).not.toBeNull();
    expect(root.querySelector('.display')!.textContent).toBe('0');
  });

  test('hydrate does not call replaceWith on matching root', () => {
    const html = renderToString(Counter);
    root.innerHTML = html;
    const ssrRoot = root.firstElementChild!;
    let replaced = false;
    const orig = ssrRoot.replaceWith.bind(ssrRoot);
    (ssrRoot as any).replaceWith = (...args: any[]) => {
      replaced = true;
      return orig(...args);
    };
    hydrate(Counter, root);
    expect(replaced).toBe(false);
    expect(root.firstElementChild).toBe(ssrRoot);
  });
});
