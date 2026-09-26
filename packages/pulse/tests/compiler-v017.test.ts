/**
 * v0.17 compiler fixes: page classifier, script declarations, template parsing.
 */
import { describe, test, expect } from 'bun:test';
import { usesReactiveScript } from '../src/bundler/dependency-analyzer';
import { ScriptParser } from '../src/server/script-parser';
import { HTMLParser } from '../src/bundler/compiler/html-parser';
import { UnifiedParser } from '../src/bundler/compiler/unified-parser';

describe('classifier: usesReactiveScript', () => {
  test('plain data is not reactive', () => {
    expect(usesReactiveScript(`let posts = [{ id: 1, title: 'a' }];\nconst year = 2026;`)).toBe(false);
    expect(usesReactiveScript(`import Nav from './Nav.pulse';\nlet title = "createSignal() in a string";`)).toBe(false);
  });
  test('signals, effects, lifecycle, state and browser APIs are reactive', () => {
    expect(usesReactiveScript(`const [c, setC] = createSignal(0);`)).toBe(true);
    expect(usesReactiveScript(`createEffect(() => {});`)).toBe(true);
    expect(usesReactiveScript(`onMount(() => {});`)).toBe(true);
    expect(usesReactiveScript(`state.count = 1;`)).toBe(true);
    expect(usesReactiveScript(`const t = localStorage.getItem('t');`)).toBe(true);
    expect(usesReactiveScript(`setTimeout(() => {}, 10);`)).toBe(true);
  });
  test('untokenizable script is treated as reactive (safe default)', () => {
    expect(usesReactiveScript("let x = 'unterminated")).toBe(true);
  });
});

describe('ScriptParser: function vs data declarations', () => {
  const p = new ScriptParser();
  test('a string that contains "=>" is data, not a handler', () => {
    const r = p.parse(`const code = 'createMemo(() => count * 2)' + '\\n';`);
    expect(r.declarations.map((d) => d.name)).toEqual(['code']);
    expect(r.functions).toEqual([]);
  });
  test('arrow and function expressions are handlers', () => {
    const r = p.parse(`const inc = () => setC(c + 1);\nconst dec = async function () {};`);
    expect(r.functions.map((f) => f.name)).toEqual(['inc', 'dec']);
  });
});

describe('HTMLParser: raw text, comments, whitespace', () => {
  const parse = (s: string) => new HTMLParser().parse(s) as any;
  test('<pre>/<code> children are parsed (expressions interpolate)', () => {
    const code = parse('<pre><code>{code}</code></pre>').children[0].children[0];
    expect(code.children).toEqual([{ type: 'expression', content: 'code' }]);
  });
  test('is:raw keeps children as literal text and is stripped', () => {
    const code = parse('<code is:raw>{a} <b>{c}</b></code>').children[0];
    expect(code.attributes.has('is:raw')).toBe(false);
    expect(code.children.length).toBe(1);
    expect(code.children[0]).toMatchObject({ type: 'text', content: '{a} <b>{c}</b>' });
  });
  test('comments are dropped from the tree', () => {
    const root = parse('<div><!-- note --><p>x</p></div>');
    expect(root.children[0].children.map((c: any) => c.tag)).toEqual(['p']);
  });
  test('a space after an inline element is kept; block-level indentation is dropped', () => {
    const p = parse('<div>\n  <p><strong>v0.17</strong> — a release</p>\n</div>').children[0];
    expect(p.children.length).toBe(1);
    expect(p.children[0].children[1]).toEqual({ type: 'text', content: ' — a release' });
  });
  test('<pre> keeps whitespace verbatim', () => {
    const pre = parse('<pre>  a\n    b\n</pre>').children[0];
    expect(pre.children).toEqual([{ type: 'text', content: '  a\n    b\n' }]);
  });
});

describe('UnifiedParser: leading comments before the template', () => {
  test('// and <!-- --> header comments are not part of the template', () => {
    const ast: any = new UnifiedParser().parse(`// ===\n// header\n<!-- note -->\n<script>\n  let a = 1;\n</script>\n<p>{a}</p>\n`, 'x.pulse');
    expect(ast.template.code).not.toContain('header');
    expect(ast.template.code).not.toContain('note');
    expect(ast.template.code.trim()).toBe('<p>{a}</p>');
  });
});
