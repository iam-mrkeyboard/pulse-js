/**
 * CSP safety: Pulse must never turn strings into code in the browser (no eval,
 * no new Function), so pages run under `script-src 'self'` without 'unsafe-eval'.
 * Template expressions are compiled to closures (see compileClosure).
 */
import { describe, test, expect } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { compileClosure, TemplateTransformer } from '../src/server/template-transformer';
import { ComponentCompiler } from '../src/server/component-compiler';
import { ScriptParser } from '../src/server/script-parser';
import { createDefaultConfig } from '../src/bundler/types';

const EVAL_RE = /\bnew\s+Function\b|(?<![\w$.])Function\s*\(|(?<![\w$.])eval\s*\(|\bsetTimeout\s*\(\s*['"`]|\bsetInterval\s*\(\s*['"`]/;

/** Drop comments and string/template literal contents so prose doesn't count. */
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:\\])\/\/.*$/gm, '$1');
}

function filesUnder(dir: string, ext: RegExp): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...filesUnder(p, ext));
    else if (ext.test(e.name)) out.push(p);
  }
  return out;
}

describe('compileClosure', () => {
  test('top-level value and handler closures', () => {
    expect(compileClosure('count() > 0', [], false)).toBe('() => (count() > 0)');
    expect(compileClosure('increment', [], true)).toBe('() => (increment)');
    expect(compileClosure('() => setOpen(!open())', [], true)).toBe('() => (() => setOpen(!open()))');
    expect(compileClosure('setValue(e.target.value)', [], true)).toBe('(e) => (setValue(e.target.value))');
    expect(compileClosure('save(event)', [], true)).toBe('(e) => { const event = e; return (save(event)); }');
  });

  test('row closures get item/index and enclosing rows', () => {
    expect(compileClosure('row.id', ['row'], false)).toBe('(row) => (row.id)');
    expect(compileClosure('index + 1', ['row'], false)).toBe('(row, index) => (index + 1)');
    expect(compileClosure('group.name + tag', ['group', 'tag'], false))
      .toBe('(tag, index, $p) => { const group = $p[0]; return (group.name + tag); }');
    expect(compileClosure('() => remove(row.id)', ['row'], true)).toBe('(e, row) => (() => remove(row.id))');
    // `row` aliases the row item in handlers (as before), whatever `as` is.
    expect(compileClosure('pick(row)', ['todo'], true)).toBe('(e, todo) => { const row = todo; return (pick(row)); }');
    // Inner as-name shadows an outer one with the same name.
    expect(compileClosure('item.x', ['item', 'item'], false)).toBe('(item) => (item.x)');
    expect(compileClosure('{ a: 1 }', [], false)).toBe('() => ({ a: 1 })');
  });

  test('invalid expressions fail the build instead of the page', () => {
    expect(() => compileClosure('a +', [], false)).toThrow(/cannot compile template expression/);
    expect(() => compileClosure('a b', [], false)).toThrow(/cannot compile template expression/);
  });

  test('transformer references closures from markup, never code', () => {
    const t = new TemplateTransformer();
    const { HTMLParser } = require('../src/bundler/compiler/html-parser');
    const root = new HTMLParser().parse(`<List each={todos} as="todo" key="id">
  <li class={todo.done ? 'done' : ''}><input bind:value={draft} /><button onClick={() => remove(todo.id)}>x</button>
    <Show when={todo.open}><List each={todo.tags} as="tag"><i onClick={() => pick(todo, tag)}>{tag}</i></List></Show>
  </li>
</List>`);
    const r = t.transform(root, [{ name: 'todos', value: '[]' }, { name: 'draft', value: "''" }], [], [], 'c1');
    const markup = r.html + JSON.stringify(Object.fromEntries(r.templates));
    expect(markup).not.toMatch(/=>|todo\.|remove\(|pick\(/);
    expect(r.exprs).toContain('(todo) => (todo.id)'); // key="id" shorthand
    expect(r.exprs).toContain('(e, tag, index, $p) => { const todo = $p[0]; return (() => pick(todo, tag)); }');
    for (const src of r.exprs) expect(() => new Function(`return [${src}]`)).not.toThrow(); // valid JS (test-side check only)
  });
});

describe('no string-to-code in the browser', () => {
  test('runtime sources contain no eval / new Function / Function()', () => {
    const dir = path.resolve(import.meta.dir, '../src/runtime');
    const offenders = filesUnder(dir, /\.ts$/).filter((f) => EVAL_RE.test(codeOnly(fs.readFileSync(f, 'utf8'))));
    expect(offenders).toEqual([]);
  });

  test('bundled browser runtime contains no eval / new Function', async () => {
    const rt = path.resolve(import.meta.dir, '../src/runtime');
    const r = await Bun.build({
      entrypoints: ['core.ts', 'dom.ts', 'hydration.ts', 'primitives/list.ts', 'primitives/show.ts'].map((f) => path.join(rt, f)),
      target: 'browser',
      format: 'esm',
      minify: true,
    });
    expect(r.success).toBe(true);
    for (const out of r.outputs) {
      const code = await out.text();
      expect(EVAL_RE.test(code)).toBe(false);
    }
  });

  test('compiled output of every docs/example component has no eval / new Function', async () => {
    const repo = path.resolve(import.meta.dir, '../../..');
    const files = [
      ...filesUnder(path.join(repo, 'apps/docs/src'), /\.pulse$/),
      ...filesUnder(path.join(repo, 'examples'), /\.pulse$/).filter((f) => !f.includes('node_modules')),
    ];
    expect(files.length).toBeGreaterThan(30);
    const compiler = new ComponentCompiler(createDefaultConfig({}), new ScriptParser(), new TemplateTransformer());
    const offenders: string[] = [];
    for (const f of files) {
      const code = await compiler.compile(f, fs.readFileSync(f, 'utf8'));
      // Module code outside the markup template literals (the page text may talk about eval).
      const moduleOnly = code.replace(/(innerHTML = )`(?:\\[\s\S]|[^`\\])*`/g, '$1``');
      if (/new Function|safeEvalExpr|__accessors/.test(moduleOnly)) offenders.push(path.relative(repo, f));
      // Markup references compiled closures ("<tag>:<n>"); it never carries code.
      const refs = [
        ...code.matchAll(/<pulse-(?:list|show)[^>]*?\s(?:each|when)=\\?"([^"\\]*)/g),
        ...code.matchAll(/\sdata-on-[a-z]+=\\?"([^"\\]*)/g),
      ].map((m) => m[1]);
      for (const r of refs) if (!/^[\w$]+:\d+$/.test(r)) offenders.push(`${path.relative(repo, f)}: ${r}`);
    }
    expect(offenders).toEqual([]);
  }, 60_000);
});
