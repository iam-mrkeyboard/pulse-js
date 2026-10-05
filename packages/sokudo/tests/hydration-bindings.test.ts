/**
 * Regressions: text bindings whose SSR value is '' (no text node in the HTML),
 * Show branch bindings/fallback/text content, and delegated events of any type
 * inside a Show within a List row.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { buildFixture, $, type Fixture } from './helpers/fixture';

let fx: Fixture;

beforeAll(async () => {
  fx = await buildFixture({
    'src/pages/index.pulse': `<script>
  const [msg, setMsg] = createSignal('');
  const [a, setA] = createSignal('');
  const [b, setB] = createSignal('');
  const [open, setOpen] = createSignal(true);
  const [n, setN] = createSignal(1);
  const [rows, setRows] = createSignal([{ id: 1, name: 'a' }, { id: 2, name: 'b' }]);
  const [log, setLog] = createSignal('none');
</script>
<main>
  <p class="msg">{msg}</p>
  <p class="pair">{a}{b}<span class="after">x</span></p>
  <button class="set" onClick={() => { setMsg('hello'); setA('A'); setB('B'); }}>set</button>
  <Show when={open}><p class="inshow">{n}</p><p class="second">two</p></Show>
  <div class="txt"><Show when={open}>plain text</Show></div>
  <div class="fb"><Show when={!open()} fallback={'closed ' + n()}><b>open</b></Show></div>
  <button class="inc" onClick={() => setN(n() + 1)}>inc</button>
  <button class="toggle" onClick={() => setOpen(!open())}>toggle</button>
  <button class="add" onClick={() => setRows([...rows(), { id: 3, name: 'c' }])}>add</button>
  <ul><List each={rows} as="row" key={row.id}>
    <li class="r"><Show when={open}><input class="k" onKeydown={(e) => setLog(row.name + ':' + e.key)} onFocus={() => setLog('focus ' + row.name)} onDblclick={() => setLog('dbl ' + row.name)} /><em class="rn">{row.name}</em></Show></li>
  </List></ul>
  <p class="log">{log}</p>
</main>
`,
  });
});

afterAll(() => fx?.cleanup());

describe('hydration bindings', () => {
  let hyd: { errors: string[]; replaceWith: number };
  beforeAll(async () => { hyd = await fx.hydrate(); });

  test('hydrates without errors or replaceWith', () => {
    expect(hyd.errors).toEqual([]);
    expect(hyd.replaceWith).toBe(0);
  });

  test("text binding rendered as '' on the server updates after hydration", () => {
    expect(fx.app()).toContain('<p class="msg"></p>');
    $('.set')!.click();
    expect($('.msg')!.textContent).toBe('hello');
    expect($('.pair')!.textContent).toBe('ABx');
    expect($('.pair .after')!.textContent).toBe('x');
  });

  test('text binding inside a top-level Show renders and updates', () => {
    expect(fx.app()).toMatch(/<p class="inshow">1<\/p>/);
    expect($('.second')).not.toBeNull();
    $('.inc')!.click();
    expect($('.inshow')!.textContent).toBe('2');
  });

  test('Show fallback expression is evaluated; text branches hide; one anchor', () => {
    expect($('.fb')!.textContent).toBe('closed 2');
    $('.toggle')!.click(); // open -> false
    expect($('.txt')!.textContent!.trim()).toBe('');
    expect($('.fb')!.textContent).toBe('open');
    expect($('.inshow')).toBeNull();
    $('.toggle')!.click(); // open -> true
    expect($('.txt')!.textContent!.trim()).toBe('plain text');
    expect($('.inshow')!.textContent).toBe('2');
    for (const show of Array.from(document.querySelectorAll('pulse-show'))) {
      const anchors = Array.from(show.childNodes).filter((c) => c.nodeType === 8 && (c as Comment).data === 'Show Anchor');
      expect(anchors.length).toBe(1);
    }
  });

  test('row bindings inside a Show within a List row bind the live content', () => {
    expect(Array.from(document.querySelectorAll('.rn')).map((e) => e.textContent)).toEqual(['a', 'b']);
  });

  test('keydown / focus / dblclick inside a Show in a List row get the row', () => {
    const inputs = document.querySelectorAll('.k');
    inputs[1].dispatchEvent(new (window as any).KeyboardEvent('keydown', { key: 'x', bubbles: true }));
    expect($('.log')!.textContent).toBe('b:x');
    inputs[0].dispatchEvent(new (window as any).FocusEvent('focus', { bubbles: false }));
    expect($('.log')!.textContent).toBe('focus a');
    inputs[1].dispatchEvent(new (window as any).MouseEvent('dblclick', { bubbles: true }));
    expect($('.log')!.textContent).toBe('dbl b');
  });

  test('rows added after hydration get row context and bindings', () => {
    $('.add')!.click();
    expect(Array.from(document.querySelectorAll('.rn')).map((e) => e.textContent)).toEqual(['a', 'b', 'c']);
    document.querySelectorAll('.k')[2].dispatchEvent(new (window as any).KeyboardEvent('keydown', { key: 'y', bubbles: true }));
    expect($('.log')!.textContent).toBe('c:y');
  });
});
