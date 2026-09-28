
import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mountPrimitives } from '../src/runtime/dom';
import { List } from '../src/runtime/primitives/list';
import { Show } from '../src/runtime/primitives/show';
import { createSignal, createEffect } from '../src/runtime/core';

// Mock Component
function MockButton(props: any) {
  const btn = document.createElement('button');
  btn.className = 'mock-btn';
  btn.textContent = props.label || 'Click';
  // Simulate compiler event handler attachment
  if (props.onClick) {
    btn.dataset.on = 'click';
    btn.setAttribute('data-on-click', 'handleClick');
    (btn as any).__pulseHandlers = { handleClick: props.onClick };
  }
  return btn;
}

describe('Pulse Integration Tests', () => {
  let container: HTMLDivElement;
  let originalAddEventListener: any;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    // Note: Global event delegation attaches to document, which persists.
    // We rely on the dom.ts side-effect that attaches listeners once.
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  test('Should mount custom components (Component Mounting)', async () => {
    // Simulate server-rendered placeholder
    container.innerHTML = `
      <div data-pulse-component="MockButton" label="Test Button" style="display:contents">
        <template data-pulse-template></template>
      </div>
    `;

    const clicked = createSignal(false);

    const components = {
      MockButton: (props: any) => MockButton(props) // Factory
    };

    mountPrimitives(container, {}, {
      List, Show, createEffect, components
    });

    const btn = container.querySelector('.mock-btn');
    expect(btn).not.toBeNull();
    expect(btn?.textContent).toBe('Test Button');
  });

  test('Should handle global event delegation', async () => {
    let clicked = false;
    const handleClick = () => { clicked = true; };

    // Manual setup simulating compiler output
    const btn = document.createElement('button');
    btn.setAttribute('data-on-click', 'handleClick');
    container.appendChild(btn);

    // Attach handler to root (simulating component root)
    (container as any).__pulseHandlers = { handleClick };

    // Trigger click
    btn.click();

    // We need to wait for microtask? Events are sync usually.
    await new Promise(r => setTimeout(r, 10));

    // Note: This test relies on dom.ts having attached the global listener.
    // Since dom.ts runs as side effect on import, it should work if imported.
    expect(clicked).toBe(true);
  });

  test('List should persist nodes (Fragment Exhaustion Verification)', async () => {
    container.innerHTML = `
      <pulse-list each="{items()}" data-template-id="t1"></pulse-list>
    `;

    const [items, setItems] = createSignal([1, 2]);
    const templates = {
      t1: '<div class="item">Item</div>'
    };

    mountPrimitives(container, { items }, { List, Show, createEffect }, templates);

    await new Promise(r => setTimeout(r, 10));
    expect(container.querySelectorAll('.item').length).toBe(2);

    // Update list to trigger re-use or new inserts involving template cloning
    setItems([1, 2, 3]);
    await new Promise(r => setTimeout(r, 10));

    // If fragment was consumed and not cloned properly/returned as fragment, 
    // we might see empty nodes or errors.
    expect(container.querySelectorAll('.item').length).toBe(3);
  });
});
