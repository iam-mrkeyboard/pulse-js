/**
 * Regressions: production pages work under a strict style-src CSP (no inline
 * <style>, no style="" attributes); component CSS is linked from a hashed file;
 * the stateful-component CSS that used to be dropped is applied.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { buildFixture, $, type Fixture } from './helpers/fixture';
import { splitDeclarations, styleClass } from '../src/server/template-transformer';
import { ComponentCompiler } from '../src/server/component-compiler';
import { ScriptParser } from '../src/server/script-parser';
import { TemplateTransformer } from '../src/server/template-transformer';

let fx: Fixture;

beforeAll(async () => {
  fx = await buildFixture({
    'src/components/Box.pulse': `<div class="box" style="border: 1px solid red">box</div>\n<style>.box { color: green; }\nbody { font-family: serif; }</style>\n`,
    'src/pages/index.pulse': `<script>
  import Box from '../components/Box.pulse';
  const [w, setW] = createSignal(10);
  const [on, setOn] = createSignal(false);
  const [rows, setRows] = createSignal([{ id: 1 }, { id: 2 }]);
</script>
<main>
  <Box />
  <p class="plain" style="margin: 0; background: url('data:image/png;base64,AA==')">plain</p>
  <p class={on() ? 'on' : 'off'} style="padding: 2px">merged</p>
  <div class="bar" style={'width: ' + w() + 'px'}>bar</div>
  <ul><List each={rows} as="r" key={r.id}><li class="row" style="color: blue">{r.id}</li></List></ul>
  <Show when={on}><span class="shown" style="font-weight: bold">yes</span></Show>
  <button class="go" onClick={() => { setW(20); setOn(true); }}>go</button>
</main>
<style>body { font-family: sans-serif; } .plain { color: black; }</style>
`,
    'src/pages/static.pulse': `<p class="s" style="color: red">static</p>\n<style>.s { font-size: 2px; }</style>\n`,
  });
});
afterAll(() => fx?.cleanup());

const cssOf = (page: string) => {
  const href = fx.html(page).match(/<link rel="stylesheet" href="(\/assets\/[^"]+\.css)">/)![1];
  return fs.readFileSync(path.join(fx.dist, href), 'utf8');
};

describe('strict style-src', () => {
  test('pages carry no inline <style> or style attributes', () => {
    for (const page of ['index', 'static']) {
      const body = fx.html(page).split('<body>')[1];
      expect(body).not.toContain('<style');
      expect(body).not.toMatch(/\sstyle="/);
    }
  });

  test('stylesheet: base rule, component CSS before page CSS, generated classes', () => {
    const css = cssOf('index');
    expect(css).toContain('pulse-list,pulse-show,[data-pulse-component]{display:contents}');
    expect(css.indexOf('font-family: serif')).toBeGreaterThan(-1);
    expect(css.indexOf('font-family: serif')).toBeLessThan(css.indexOf('font-family: sans-serif'));
    expect(css).toMatch(/\.ps-[a-z0-9]+\{border: 1px solid red !important\}/);
    expect(css).toContain("background: url('data:image/png;base64,AA==') !important");
    expect(css).toMatch(/\.ps-[a-z0-9]+\{color: blue !important\}/); // List row template
    expect(css).toMatch(/\.ps-[a-z0-9]+\{font-weight: bold !important\}/); // Show branch
    expect(css).toMatch(/\.pd-[a-z0-9]+\{width: 10px !important\}/); // SSR value of a style binding
    expect(cssOf('static')).toMatch(/\.ps-[a-z0-9]+\{color: red !important\}/);
    expect(fx.html('static')).not.toContain('<script');
  });

  test('generated classes merge with static and bound classes', () => {
    const app = fx.app();
    expect(app).toMatch(/<p class="plain ps-[a-z0-9]+">/);
    expect(app).toMatch(/<p class="off ps-[a-z0-9]+">/);
    expect(app).toMatch(/<div class="bar pd-[a-z0-9]+">/);
  });

  test('hydration: bindings keep working, style binding replaces the SSR class via CSSOM', async () => {
    const hyd = await fx.hydrate();
    expect(hyd.errors).toEqual([]);
    expect(hyd.replaceWith).toBe(0);
    $('.go')!.click();
    const merged = document.querySelector('main > p:nth-of-type(2)')!;
    expect(merged.className).toMatch(/^on ps-[a-z0-9]+$/);
    const bar = $('.bar')!;
    expect(bar.style.width).toBe('20px');
    expect(bar.className).toBe('bar');
    expect($('.shown')!.className).toMatch(/^shown ps-[a-z0-9]+$/);
    expect(document.querySelectorAll('li.row').length).toBe(2);
    for (const li of Array.from(document.querySelectorAll('li.row'))) expect(li.className).toMatch(/^row ps-/);
  });
});

describe('style helpers', () => {
  test('splitDeclarations respects quotes and parentheses', () => {
    expect(splitDeclarations(`a: b; c: url("x;y"); d: e('f;g');`)).toEqual(['a: b', 'c: url("x;y")', "d: e('f;g')"]);
    expect(styleClass('color: red !important; margin: 0')!.rule).toMatch(/\{color: red !important;margin: 0 !important\}$/);
    expect(styleClass('  ')).toBeNull();
    expect(styleClass('color: red')!.cls).toBe(styleClass('color: red')!.cls);
  });
});

describe('scoped CSS without extraction (dev)', () => {
  test('a stateful component keeps its <style> inside the element it returns', async () => {
    const cc = new ComponentCompiler({ root: '/p' } as any, new ScriptParser(), new TemplateTransformer());
    const code = await cc.compile('/p/src/C.pulse', `<script>\n  const [n, setN] = createSignal(1);\n</script>\n<p>{n}</p>\n<style>p { color: red; }</style>\n`);
    const m = code.match(/_tpl\.innerHTML = `([\s\S]*?)`;/)!;
    const t = document.createElement('template');
    t.innerHTML = m[1];
    expect(t.content.children.length).toBe(1);
    const root = t.content.firstElementChild!;
    expect(root.lastElementChild!.tagName).toBe('STYLE');
    expect(root.firstElementChild!.tagName).toBe('P');
  });
});
