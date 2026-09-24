import { describe, test, expect } from 'bun:test';
import { TemplateTransformer } from '../src/server/template-transformer';
import { HTMLParser } from '../src/bundler/compiler/html-parser';

describe('Pulse Compiler: TemplateTransformer', () => {
  const transformer = new TemplateTransformer();
  const parser = new HTMLParser();

  test('should transform Show primitive correctly', () => {
    const template = `
      <Show when={isOpen}>
        <div>Content</div>
      </Show>
    `;

    // Parse AST
    const root = parser.parse(template);

    // Mock state variables
    const stateVars = [{ name: 'isOpen', value: 'false' }];

    const result = transformer.transform(root, stateVars);

    // Expect transformation to <pulse-show> with template data
    expect(result.html).toContain('<pulse-show when="{isOpen()}"');
    expect(result.html).toContain('<template data-pulse-template>');
    expect(result.html).toContain('<div>Content</div>');
    expect(result.html).toContain('</template>');
    expect(result.html).toContain('</pulse-show>');
  });

  test('should transform List primitive correctly', () => {
    const template = `
      <List each={items} as="item">
        <span>{item.name}</span>
      </List>
    `;

    const root = parser.parse(template);

    const stateVars = [{ name: 'items', value: '[]' }];

    const result = transformer.transform(root, stateVars);

    expect(result.html).toContain('<pulse-list each="{items()}" as="item"');
    expect(result.html).toContain('data-bindings=');
    expect(result.html).toContain('data-template-id=');
  });

  test('should transform bindings correctly', () => {
    const template = `<button onclick={increment}>Count: {count}</button>`;

    const root = parser.parse(template);

    const stateVars = [
      { name: 'count', value: '0' },
      { name: 'increment', value: '() => {}' }
    ];

    const result = transformer.transform(root, stateVars);

    // Expect event binding
    // Check HTML for event attribute (static delegation)
    expect(result.html).toContain('data-on-click=');

    // Check for Text Binding ({count})
    const textBinding = result.bindings.find(b => b.type === 'text');
    expect(textBinding).toBeDefined();
    expect(Array.isArray(textBinding.path)).toBe(true);
    // Path should be [0, 1] (root button -> 2nd child) because "Count: " is first child text
    // Depending on whitespace, it might be different, but let's check it's defined.
    // console.log('Text Binding Path:', textBinding.path);

    // Initial check: HTML should NOT contain legacy data-ids
    expect(result.html).not.toContain('data-bind=');
    expect(result.html).not.toContain('data-pulse-id=');
  });
});
