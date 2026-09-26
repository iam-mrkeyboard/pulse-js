/**
 * Regression tests for the production build (PR #6):
 *  - every page's static HTML is server-rendered into <div id="app"> (the body used
 *    to be empty; content only existed in island JS);
 *  - the client bundle hydrates by adopting that DOM (no remount / replaceWith).
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PulseBundler } from '../src/bundler/index';
import { createDefaultConfig } from '../src/bundler/types';

let root = '';
let dist = '';

const files: Record<string, string> = {
  'src/components/Child.pulse': `<script>
  const [open, setOpen] = createSignal(false);
</script>

<div class="child">
  <button class="child-btn" onClick={() => setOpen(!open)}>Child: {open ? 'on' : 'off'}</button>
</div>
`,
  'src/components/Nav.pulse': `<script>
  // static component
</script>

<nav class="nav"><a href="/">Home</a></nav>
`,
  'src/pages/index.pulse': `<script>
  import Child from '../components/Child.pulse';
  import Nav from '../components/Nav.pulse';

  const [count, setCount] = createSignal(0);
  const doubled = createMemo(() => count() * 2);
  const snippet = \`<style>.not-a-style { color: red }</style>\`;

  function increment() {
    setCount(count + 1);
  }
</script>

<Nav />
<main class="home">
  <h2 class="count">Count: {count}</h2>
  <p class="doubled">Doubled: {doubled}</p>
  <button class="inc" onClick={increment}>Increment</button>
  <button class="inline" onClick={() => setCount(c => c + 10)}>+10</button>
  <Show when={count > 0}>
    <p class="positive">positive</p>
  </Show>
  <div class="snippet">{snippet}</div>
  <Child />
</main>

<style>
  .home { color: #333; }
</style>
`,
  'src/pages/blog/post.pulse': `<script>
  import Nav from '../../components/Nav.pulse';
  let title = "Hello & welcome";
</script>

<Nav />
<article class="post"><h1>{title}</h1><p>Static body text.</p></article>
`,
  'src/pages/items.pulse': `<script>
  const [items, setItems] = createSignal([
    { id: 1, name: 'Apple', note: 'red' },
    { id: 2, name: 'Pear', note: 'green' },
    { id: 3, name: 'Plum', note: 'purple' },
  ]);
  const [openId, setOpenId] = createSignal(null);
  function remove(id) {
    setItems(items().filter((i) => i.id !== id));
  }
</script>

<ul class="items">
  <List each={items} as="item">
    <li class="row">
      <span class="name">{item.name}</span>
      <button class="toggle" onClick={() => setOpenId(openId() === item.id ? null : item.id)}>i</button>
      <button class="del" onClick={() => remove(item.id)}>x</button>
      <Show when={openId() === item.id}>
        <p class="note">{item.note}</p>
      </Show>
    </li>
  </List>
</ul>
`,
  'src/pages/about.pulse': `<section class="about"><h1>About</h1><p>Plain static page.</p></section>
`,
  // v0.17: plain data + List/<pre>/is:raw and a leading header comment -> static, zero JS
  'src/pages/blog/data.pulse': `// ==========================
// header comment: must not leak into the page
// ==========================
<script>
  let posts = [
    { id: 1, title: 'First post' },
    { id: 2, title: 'Second post' },
  ];
  const snippet = 'const x = () => 1;';
</script>

<!-- an HTML comment that must not render -->
<section class="data">
  <ul class="posts">
    <List each={posts} as="post" key={post.id}>
      <li class="post-row"><strong>{post.title}</strong> by Pulse</li>
    </List>
  </ul>
  <pre class="interp"><code>{snippet}</code></pre>
  <pre class="raw"><code is:raw>{notInterpolated}</code></pre>
</section>
`,
};

function appHTML(html: string): string {
  const m = html.match(/<div id="app">([\s\S]*)<\/div>\s*(<link|<script|<\/body>)/);
  return m ? m[1] : '';
}

beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-ssr-build-'));
  for (const [rel, content] of Object.entries(files)) {
    const f = path.join(root, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, content);
  }
  fs.mkdirSync(path.join(root, 'public'), { recursive: true });
  const config = createDefaultConfig({
    root,
    srcDir: './src',
    outDir: './dist',
    publicDir: './public',
    pages: { dir: './src/pages' },
    build: { minify: true, sourcemap: false, target: 'es2022', splitting: true, treeshake: true, islands: true, ssr: true },
  } as any);
  dist = path.join(root, 'dist');
  await new PulseBundler(config).build();
}, 60_000);

afterAll(() => {
  if (root && !process.env.PULSE_KEEP_FIXTURE) fs.rmSync(root, { recursive: true, force: true });
});

describe('production build: server-rendered body', () => {
  test('writes nested routes (blog/post -> dist/blog/post/index.html)', () => {
    expect(fs.existsSync(path.join(dist, 'index.html'))).toBe(true);
    expect(fs.existsSync(path.join(dist, 'blog/post/index.html'))).toBe(true);
    expect(fs.existsSync(path.join(dist, 'about/index.html'))).toBe(true);
    expect(fs.existsSync(path.join(dist, 'items/index.html'))).toBe(true);
  });

  test('every page has non-empty #app content in the raw HTML', () => {
    for (const rel of ['index.html', 'blog/post/index.html', 'about/index.html']) {
      const html = fs.readFileSync(path.join(dist, rel), 'utf8');
      expect(html).not.toMatch(/<body>\s*<\/body>/);
      const app = appHTML(html);
      expect(app.replace(/<[^>]+>/g, '').trim().length).toBeGreaterThan(10);
      expect(app).toContain('data-p-h');
    }
  });

  test('interactive page: SSR values, markers, child components, one hydration script', () => {
    const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
    const app = appHTML(html);
    expect(app).toContain('Count: <!---->0');
    expect(app).toContain('Doubled: <!---->0');
    expect(app).toContain('data-p-show="1"');
    expect(app).toContain('data-p-c="Child"');
    expect(app).toContain('data-p-c="Nav"');
    expect(app).toContain('Child: <!---->off');
    // <style> inside a script string is a string value, not the component stylesheet
    expect(app).toContain('&lt;style&gt;.not-a-style { color: red }&lt;/style&gt;');
    expect(html).not.toMatch(/<style>[^<]*\.not-a-style/);
    const scripts = html.match(/<script type="module" src="(\/assets\/[^"]+\.js)"><\/script>/);
    expect(scripts).not.toBeNull();
    expect(fs.existsSync(path.join(dist, scripts![1]))).toBe(true);
  });

  test('declarations render server-side; static page ships no JS', () => {
    const post = appHTML(fs.readFileSync(path.join(dist, 'blog/post/index.html'), 'utf8'));
    expect(post).toContain('Hello &amp; welcome');
    expect(post).not.toContain('{title}');
    expect(post).not.toContain('${props.');
    const about = fs.readFileSync(path.join(dist, 'about/index.html'), 'utf8');
    expect(appHTML(about)).toContain('Plain static page.');
    expect(about).not.toContain('<script type="module"');
  });

  test('page with only plain data (let + List + <pre>) is static and ships no JS', () => {
    const html = fs.readFileSync(path.join(dist, 'blog/data/index.html'), 'utf8');
    const app = appHTML(html);
    expect(html).not.toContain('<script type="module"');
    expect(app).toContain('<strong>First post</strong> by Pulse');
    expect(app).toContain('<strong>Second post</strong> by Pulse');
  });

  test('{expr} interpolates inside <pre><code>; is:raw keeps braces literal', () => {
    const app = appHTML(fs.readFileSync(path.join(dist, 'blog/data/index.html'), 'utf8'));
    expect(app).toMatch(/<pre class="interp"><code>const x = \(\) =&gt; 1;<\/code><\/pre>/);
    expect(app).not.toContain('{snippet}');
    expect(app).toContain('{notInterpolated}');
    expect(app).not.toContain('is:raw');
  });

  test('comments (leading // header and <!-- -->) are not emitted as page text', () => {
    const app = appHTML(fs.readFileSync(path.join(dist, 'blog/data/index.html'), 'utf8'));
    expect(app).not.toContain('header comment');
    expect(app).not.toContain('====');
    expect(app).not.toContain('must not render');
  });

  test('sourcemap: false emits no .map files', () => {
    const assets = fs.readdirSync(path.join(dist, 'assets'));
    expect(assets.some((f) => f.endsWith('.map'))).toBe(false);
    for (const f of assets.filter((f) => f.endsWith('.js'))) {
      expect(fs.readFileSync(path.join(dist, 'assets', f), 'utf8')).not.toContain('sourceMappingURL');
    }
  });
});

describe('production build: sourcemap: true', () => {
  test('emits an external .map per JS asset, linked from the file', async () => {
    const config = createDefaultConfig({
      root,
      srcDir: './src',
      outDir: './dist-map',
      publicDir: './public',
      pages: { dir: './src/pages' },
      build: { minify: true, sourcemap: true, target: 'es2022', splitting: true, treeshake: true, islands: true, ssr: true },
    } as any);
    await new PulseBundler(config).build();
    const dir = path.join(root, 'dist-map', 'assets');
    const js = fs.readdirSync(dir).filter((f) => f.endsWith('.js'));
    expect(js.length).toBeGreaterThan(0);
    for (const f of js) {
      const code = fs.readFileSync(path.join(dir, f), 'utf8');
      expect(code).toContain(`//# sourceMappingURL=${f}.map`);
      const map = JSON.parse(fs.readFileSync(path.join(dir, `${f}.map`), 'utf8'));
      expect(map.version).toBe(3);
      expect(map.sources.length).toBeGreaterThan(0);
    }
  }, 60_000);
});

describe('production build: hydration adopts the SSR DOM', () => {
  test('same nodes, no replaceWith, no mismatch warnings, interactive', async () => {
    const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
    const src = html.match(/<script type="module" src="(\/assets\/[^"]+\.js)"><\/script>/)![1];

    document.body.innerHTML = `<div id="app">${appHTML(html)}</div>`;
    const app = document.getElementById('app')!;
    const ssrRoot = app.firstElementChild!;
    const ssrNodes = Array.from(app.querySelectorAll('*'));
    const countText = app.querySelector('.count')!;
    const childRoot = app.querySelector('[data-p-c="Child"]')!;

    const warnings: string[] = [];
    const origWarn = console.warn;
    const origError = console.error;
    console.warn = (...a: any[]) => { warnings.push(a.map(String).join(' ')); };
    console.error = (...a: any[]) => { warnings.push(a.map(String).join(' ')); };
    let replaceCalls = 0;
    const origReplace = (Element.prototype as any).replaceWith;
    (Element.prototype as any).replaceWith = function (...a: any[]) {
      replaceCalls++;
      return origReplace.apply(this, a);
    };

    try {
      await import(path.join(dist, src));

      expect(app.firstElementChild).toBe(ssrRoot);
      expect(ssrNodes.every((n) => n.isConnected)).toBe(true);
      expect(replaceCalls).toBe(0);
      expect((ssrRoot as any).__pulseHandlers).toBeTruthy();
      expect((childRoot as any).__pulseAdopted).toBe(true);

      (app.querySelector('.inc') as HTMLElement).click();
      expect(countText.textContent).toBe('Count: 1');
      expect(app.querySelector('.doubled')!.textContent).toBe('Doubled: 2');
      expect(app.querySelector('.positive')).not.toBeNull();

      (app.querySelector('.inline') as HTMLElement).click();
      expect(countText.textContent).toBe('Count: 11');

      const childBtn = app.querySelector('.child-btn') as HTMLElement;
      childBtn.click();
      expect(childBtn.textContent).toBe('Child: on');
      expect(app.querySelector('.child-btn')).toBe(childBtn);

      expect(warnings.filter((w) => /mismatch|Pulse|not found/i.test(w))).toEqual([]);
    } finally {
      console.warn = origWarn;
      console.error = origError;
      (Element.prototype as any).replaceWith = origReplace;
      document.body.innerHTML = '';
    }
  });
});

describe('production build: List rows are adopted and bound', () => {
  test('SSR rows stay, handlers work, nested Show sees the row item', async () => {
    const html = fs.readFileSync(path.join(dist, 'items/index.html'), 'utf8');
    const app = appHTML(html);
    expect(app).toContain('data-p-list="1"');
    expect(app).toContain('<span class="name">Apple</span>');
    expect(app).not.toContain('list-error');
    // object items have no serializable key: no "[object Object]" keys
    expect(app).not.toContain('[object Object]');

    const src = html.match(/<script type="module" src="(\/assets\/[^"]+\.js)"><\/script>/)![1];
    document.body.innerHTML = `<div id="app">${app}</div>`;
    const rows = Array.from(document.querySelectorAll('li.row'));
    expect(rows.length).toBe(3);
    const errors: string[] = [];
    const origError = console.error;
    console.error = (...a: any[]) => { errors.push(a.map(String).join(' ')); };
    try {
      await import(path.join(dist, src));

      (rows[1].querySelector('.toggle') as HTMLElement).click();
      expect(rows[1].querySelector('.note')?.textContent).toBe('green');
      expect(rows[0].querySelector('.note')).toBeNull();

      (rows[0].querySelector('.del') as HTMLElement).click();
      const after = Array.from(document.querySelectorAll('li.row'));
      expect(after.length).toBe(2);
      expect(after[0]).toBe(rows[1]);
      expect(after[1]).toBe(rows[2]);
      expect(errors).toEqual([]);
    } finally {
      console.error = origError;
      document.body.innerHTML = '';
    }
  });
});
