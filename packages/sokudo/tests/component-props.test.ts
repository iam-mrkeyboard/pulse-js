/** Regression: component props written as {expr} are values (live getters), not literal strings. */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import { buildFixture, $, type Fixture } from './helpers/fixture';

let fx: Fixture;

beforeAll(async () => {
  fx = await buildFixture({
    'src/components/Badge.pulse': `<span class="badge" title={tip}>{label}</span>\n`,
    'src/components/Esc.pulse': `<i class="esc">{props.text}</i>\n`,
    'src/components/Live.pulse': `<script>
  const [x, setX] = createSignal(0);
</script>
<span class="live">{props.count}/{x}</span>
`,
    'src/components/Item.pulse': `<b class="item">{name}</b>\n`,
    'src/pages/index.pulse': `<script>
  import Badge from '../components/Badge.pulse';
  import Esc from '../components/Esc.pulse';
  import Live from '../components/Live.pulse';
  import Item from '../components/Item.pulse';
  const [msg, setMsg] = createSignal('');
  const [n, setN] = createSignal(1);
  const [rows, setRows] = createSignal([{ id: 1, name: 'a' }, { id: 2, name: 'b' }]);
</script>
<main>
  <Badge label={msg() || "empty"} tip="A &amp; B" />
  <Esc text={'<b>' + msg() + '</b>'} />
  <Live count={n} />
  <ul><List each={rows} as="row" key={row.id}><li><Item name={row.name + n()} /></li></List></ul>
  <button class="go" onClick={() => { setMsg('hi'); setN(n() + 1); }}>go</button>
</main>
`,
  });
});

afterAll(() => fx?.cleanup());

describe('component props', () => {
  test('server render evaluates {expr} props', () => {
    const app = fx.app();
    expect(app).toContain('<span class="badge" title="A &amp; B">empty</span>');
    expect(app).toContain('&lt;b&gt;&lt;/b&gt;');
    expect(app).toMatch(/<span class="live">1<!---->\/<!---->0<\/span>/);
    expect(app).toContain('<b class="item">a1</b>');
    expect(app).not.toContain('msg()');
    expect(app).not.toContain('data-p-props');
  });

  test('props stay reactive after hydration (no replaceWith)', async () => {
    const hyd = await fx.hydrate();
    expect(hyd.errors).toEqual([]);
    expect(hyd.replaceWith).toBe(0);
    $('.go')!.click();
    expect($('.badge')!.textContent).toBe('hi');
    expect($('.badge')!.getAttribute('title')).toBe('A & B');
    expect($('.esc')!.textContent).toBe('<b>hi</b>');
    expect($('.esc')!.children.length).toBe(0);
    expect($('.live')!.textContent).toBe('2/0');
    expect(Array.from(document.querySelectorAll('.item')).map((e) => e.textContent)).toEqual(['a2', 'b2']);
  });
});
