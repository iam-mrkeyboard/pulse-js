import { describe, test, expect } from 'bun:test';
import { TemplateTransformer } from '../src/server/compiler/template-transformer';

describe('TemplateTransformer', () => {
  const tx = new TemplateTransformer();

  test('binds text expressions for state vars', () => {
    const { html, bindings } = tx.transform(
      `<div class="c">{count}</div>`,
      [{ name: 'count', value: '0' }],
      [],
      [],
    );
    expect(bindings.length).toBeGreaterThan(0);
    expect(html).toMatch(/data-bind|data-pulse/);
  });

  test('emits pulse-list for List primitive', () => {
    const { html } = tx.transform(
      `<List each={items} as="item" key={item.id}><span>{item.name}</span></List>`,
      [{ name: 'items', value: '[]' }],
      [],
      [],
    );
    expect(html).toContain('pulse-list');
    expect(html).toContain('data-template-id');
  });
});
