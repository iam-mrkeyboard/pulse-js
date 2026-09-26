import { describe, test, expect } from 'bun:test';
import { hydrate, renderToString } from '../src/runtime/hydration';
import { P_HYDRATED } from '../src/runtime/ssr-markers';
import { createSignal, createEffect } from '../src/runtime/core';

/** Minimal component that adopts _hydrationNode like compiled output. */
function Counter(props: any = {}) {
  let root: HTMLElement;
  if (props._hydrationNode) {
    root = props._hydrationNode;
  } else {
    root = document.createElement('div');
    root.className = 'counter';
    root.setAttribute(P_HYDRATED, '1');
    const display = document.createElement('span');
    display.className = 'display';
    display.textContent = '0';
    root.appendChild(display);
  }
  const [count, setCount] = createSignal(0);
  createEffect(() => {
    const display = root.querySelector('.display');
    if (display) display.textContent = String(count());
  });
  (root as any).__inc = () => setCount(count() + 1);
  return root;
}

describe('hydrate (adopt-and-bind)', () => {
  test('preserves SSR node identity and updates existing text', () => {
    const html = renderToString(Counter);
    const mount = document.createElement('div');
    document.body.appendChild(mount);
    mount.innerHTML = html;
    const ssrRoot = mount.firstElementChild!;
    const ssrDisplay = mount.querySelector('.display')!;

    hydrate(Counter, mount);
    expect(mount.firstElementChild).toBe(ssrRoot);
    expect(mount.querySelector('.display')).toBe(ssrDisplay);
    (ssrRoot as any).__inc();
    expect(ssrDisplay.textContent).toBe('1');
    mount.remove();
  });
});

describe('dev-server runtime allowlist', () => {
  test('hydration.ts and ssr-markers.ts are served as JS', async () => {
    // Lightweight: transpile the same way serveRuntime does
    const hyd = await Bun.file(new URL('../src/runtime/hydration.ts', import.meta.url)).text();
    const markers = await Bun.file(new URL('../src/runtime/ssr-markers.ts', import.meta.url)).text();
    const t = new Bun.Transpiler({ loader: 'ts' });
    const hydJs = await t.transform(hyd);
    const markersJs = await t.transform(markers);
    expect(hydJs).toContain('hydrate');
    expect(markersJs).toContain('data-p-h');
    // dom re-exports hydrate
    const dom = await Bun.file(new URL('../src/runtime/dom.ts', import.meta.url)).text();
    expect(dom).toContain("from './hydration.js'");
  });
});
