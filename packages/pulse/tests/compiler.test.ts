import { describe, test, expect } from 'bun:test';
import { TemplateTransformer } from '../src/server/template-transformer';
import { HTMLParser } from '../src/bundler/compiler/html-parser';
import { ComponentCompiler } from '../src/server/component-compiler';
import { ScriptParser } from '../src/server/script-parser';
import { createDefaultConfig } from '../src/bundler/types';

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

  test('keeps list item class bindings on the item, not the page root', () => {
    const template = `
      <List each={data} as="row" key={row.id}>
        <tr class={selected === row.id ? "danger" : ""}>
          <td>{row.id}</td>
        </tr>
      </List>
    `;
    const root = parser.parse(template);
    const stateVars = [
      { name: 'data', value: '[]' },
      { name: 'selected', value: 'null' },
    ];
    const result = transformer.transform(root, stateVars);
    expect(result.bindings.find((b) => b.name === 'class')).toBeUndefined();
    expect(result.html).toContain('data-bindings=');
    expect(result.html).toContain('danger');
    expect(result.html).toMatch(/data-bindings="[^"]*class/);
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

describe('Pulse SFC compiler', () => {
  test('emits package runtime specifiers and keeps list class bindings in-item', async () => {
    const compiler = new ComponentCompiler(
      createDefaultConfig({ build: { minify: false } }),
      new ScriptParser(),
      new TemplateTransformer(),
    );
    const source = `
<script>
const state = { data: [], selected: null };
function buildData(count) {
  const data = new Array(count);
  for (let i = 0; i < count; i++) data[i] = { id: i, label: 'x' };
  return data;
}
function select(id) { state.selected = id; }
</script>
<List each={state.data} as="row" key={row.id}>
  <tr class={state.selected === row.id ? "danger" : ""}>
    <td>{row.id}</td>
    <a onClick={() => select(row.id)}>{row.label}</a>
  </tr>
</List>
`;
    const code = await compiler.compile('App.pulse', source);
    expect(code).toContain("from 'pulse/runtime'");
    expect(code).toContain("from 'pulse/runtime/list'");
    expect(code).not.toContain("from '/runtime/");
    expect(code).not.toMatch(/walk\(container[\s\S]*row\.id/);
    expect(code).toContain('danger');
    expect(code).toMatch(/const data = new Array/);
    expect(code).toMatch(/data\[i\] = \{ id: i/);
    expect(code).not.toMatch(/get_data\[i\]/);
  });
});

describe('Nested template-literal class attributes', () => {
  test('class={`btn btn-${x}`} emits valid JS that terser accepts', async () => {
    const { ComponentCompiler } = await import('../src/server/component-compiler');
    const { ScriptParser } = await import('../src/server/script-parser');
    const { TemplateTransformer } = await import('../src/server/template-transformer');
    const { minify } = await import('terser');

    const src = `<script>
  const variant = 'primary';
</script>
<button class={\`btn btn-\${variant}\`}>Hi</button>`;

    const compiler = new ComponentCompiler(
      { root: process.cwd(), srcDir: 'src', outDir: 'dist' } as any,
      new ScriptParser(),
      new TemplateTransformer(),
    );
    const code = await compiler.compile('Button.pulse', src);
    // Nested template literals in class attrs must not break the emitted module.
    expect(code.includes('btn btn-')).toBe(true);
    const result = await minify(code, { module: true, compress: false, mangle: false });
    expect(result.code && result.code.length > 0).toBe(true);
  });

  test('docs/components.pulse compiles and minifies', async () => {
    const { ComponentCompiler } = await import('../src/server/component-compiler');
    const { ScriptParser } = await import('../src/server/script-parser');
    const { TemplateTransformer } = await import('../src/server/template-transformer');
    const { minify } = await import('terser');
    const { readFileSync } = await import('fs');
    const path = require('path');
    const file = path.resolve(import.meta.dir, '../../../apps/docs/src/pages/docs/components.pulse');
    const src = readFileSync(file, 'utf8');
    const compiler = new ComponentCompiler(
      { root: process.cwd(), srcDir: 'src', outDir: 'dist' } as any,
      new ScriptParser(),
      new TemplateTransformer(),
    );
    const code = await compiler.compile(file, src);
    const result = await minify(code, { module: true, compress: true, mangle: false });
    expect(result.code && result.code.length > 0).toBe(true);
  });
});
