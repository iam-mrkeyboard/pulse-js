import { describe, test, expect } from 'bun:test';
import { readFileSync } from 'fs';
import path from 'path';
import { ComponentCompiler } from '../src/server/component-compiler';
import { ScriptParser } from '../src/server/script-parser';
import { TemplateTransformer } from '../src/server/template-transformer';
import { createDefaultConfig } from '../src/bundler/types';

const appRoot = path.resolve(import.meta.dir, '../../pulse-app');

async function compileComponent(rel: string) {
  const filePath = path.join(appRoot, rel);
  const content = readFileSync(filePath, 'utf8');
  const config = createDefaultConfig({ root: appRoot, debug: false });
  const compiler = new ComponentCompiler(config, new ScriptParser(), new TemplateTransformer());
  return compiler.compile(filePath, content);
}

describe('Counter compile + click', () => {
  test('Counter.pulse (bare script) emits signals and state setters', async () => {
    const code = await compileComponent('src/components/Counter.pulse');
    expect(code).toContain('createSignal');
    expect(code).toMatch(/set count\(/);
    expect(code).toMatch(/get count\(/);
    expect(code).toContain('_tpl');
    expect(code).toContain('cloneNode');
  });

  test('Counter2.pulse (<script>) emits working state façade', async () => {
    const code = await compileComponent('src/components/Counter2.pulse');
    expect(code).toContain('createSignal');
    expect(code).toMatch(/set count\(/);
    expect(code).toContain('createEffect');
  });

  test('compiled Counter2 increments DOM on click (happy-dom)', async () => {
    const code = await compileComponent('src/components/Counter2.pulse');
    let mod = code
      .replaceAll("from 'pulse/runtime/dom'", "from '../src/runtime/dom.ts'")
      .replaceAll("from 'pulse/runtime/list'", "from '../src/runtime/primitives/list.ts'")
      .replaceAll("from 'pulse/runtime/show'", "from '../src/runtime/primitives/show.ts'")
      .replaceAll("from 'pulse/runtime'", "from '../src/runtime/core.ts'")
      .replaceAll('/runtime/core.js', '../src/runtime/core.ts')
      .replaceAll('/runtime/dom.js', '../src/runtime/dom.ts')
      .replaceAll('/runtime/primitives/list.js', '../src/runtime/primitives/list.ts')
      .replaceAll('/runtime/primitives/show.js', '../src/runtime/primitives/show.ts');

    // Force event delegation init by importing dom
    const tmp = path.join(import.meta.dir, '_counter2_gen.ts');
    await Bun.write(tmp, mod);
    try {
      const { default: Counter2 } = await import(tmp + '?t=' + Date.now());
      const el = Counter2({});
      document.body.appendChild(el);
      const display = el.querySelector('.display');
      expect(display?.textContent?.trim()).toBe('0');
      const handlers = (el as any).__pulseHandlers;
      expect(handlers?.increment).toBeTypeOf('function');
      handlers.increment();
      expect(display?.textContent?.trim()).toBe('1');
      handlers.increment();
      expect(display?.textContent?.trim()).toBe('2');
      handlers.decrement();
      expect(display?.textContent?.trim()).toBe('1');
      el.remove();
    } finally {
      try { await Bun.write(tmp, '// cleaned'); } catch {}
    }
  });
});
