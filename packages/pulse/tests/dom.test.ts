import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { mountPrimitives } from '../src/runtime/dom';
import { Show } from '../src/runtime/primitives/show';
import { List } from '../src/runtime/primitives/list';
import { createSignal, createEffect } from '../src/runtime/core';

describe('Pulse DOM Runtime', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  test('mountPrimitives should initialize Show component', async () => {
    container.innerHTML = `
      <pulse-show when="{show()}">
        <template data-pulse-template>
          <span id="content">Visible</span>
        </template>
      </pulse-show>
    `;

    const [show, setShow] = createSignal(true);
    const scope = { show, setShow };

    mountPrimitives(container, scope, {
      Show,
      createEffect,
      bindings: []
    });

    await new Promise(r => setTimeout(r, 10)); // Allow microtasks

    console.log('Show Render Result:', container.innerHTML);

    const content = container.querySelector('#content');
    expect(content).not.toBeNull();
    expect(content?.textContent).toBe('Visible');

    // Test Reactivity
    setShow(false);
    await new Promise(r => setTimeout(r, 10));
    console.log('Show Hidden Result:', container.innerHTML);
    expect(container.querySelector('#content')).toBeNull();
  });

  test('mountPrimitives should initialize List component', async () => {
    container.innerHTML = `
      <pulse-list each="{items}">
         <template data-pulse-template>
            <div class="item">Item</div>
         </template>
      </pulse-list>
    `;

    const [items, setItems] = createSignal([{ id: 1 }, { id: 2 }]);
    const scope = { items, setItems };

    mountPrimitives(container, scope, {
      List,
      createEffect,
      bindings: []
    });

    await new Promise(r => setTimeout(r, 10));

    console.log('List Render Result:', container.innerHTML);

    const rendered = container.querySelectorAll('.item');
    expect(rendered.length).toBe(2);
  });
});
