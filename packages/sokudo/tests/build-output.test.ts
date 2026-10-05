/**
 * Regressions: stale hashed outputs are removed on rebuild (other files are kept).
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { buildFixture, writeFiles, type Fixture } from './helpers/fixture';

const page = (n: number) => `<script>
  import CardA from '../components/a/Card.pulse';
  import CardB from '../components/b/Card.pulse';
  const [count, setCount] = createSignal(${n});
</script>
<main><CardA /><CardB /><button class="inc" onClick={() => setCount(count() + 1)}>{count}</button></main>
`;

let fx: Fixture;
const assets = () => fs.readdirSync(path.join(fx.dist, 'assets')).sort();

beforeAll(async () => {
  fx = await buildFixture({
    'src/components/a/Card.pulse': `<div class="card">A</div>\n<style>.card { color: red; }</style>\n`,
    'src/components/b/Card.pulse': `<div class="card">B</div>\n<style>.card { color: blue; }</style>\n`,
    'src/pages/index.pulse': page(0),
    'src/pages/old.pulse': `<p>old page</p>\n`,
  });
});
afterAll(() => fx?.cleanup());

describe('stale outputs', () => {
  test('rebuild removes old hashed assets and deleted pages, keeps other files', async () => {
    const first = assets();
    fs.writeFileSync(path.join(fx.dist, 'assets', 'keep-me.js'), '// user file');
    fs.writeFileSync(path.join(fx.dist, 'robots.txt'), 'User-agent: *');
    writeFiles(fx.root, { 'src/pages/index.pulse': page(5) });
    fs.rmSync(path.join(fx.root, 'src/pages/old.pulse'));
    await fx.rebuild();
    const second = assets();
    const entry = (l: string[]) => l.filter((f) => /^page-index-[a-z0-9]{8}\.js$/.test(f));
    expect(entry(second).length).toBe(1);
    expect(entry(second)[0]).not.toBe(entry(first)[0]);
    for (const f of first) {
      if (f === 'keep-me.js') continue;
      if (!second.includes(f)) expect(fs.existsSync(path.join(fx.dist, 'assets', f))).toBe(false);
    }
    expect(second).toContain('keep-me.js');
    expect(fs.existsSync(path.join(fx.dist, 'robots.txt'))).toBe(true);
    expect(fs.existsSync(path.join(fx.dist, 'old'))).toBe(false);
    // Every referenced asset exists, nothing unreferenced (but keep-me.js) is left.
    const html = fx.html();
    for (const m of html.matchAll(/\/assets\/([\w.-]+)/g)) expect(second).toContain(m[1]);
  });

  test('without a record (older dist) only hashed build assets are removed', async () => {
    const stale = path.join(fx.dist, 'assets', 'chunk-abcd1234.js');
    fs.writeFileSync(stale, '// stale');
    fs.writeFileSync(path.join(fx.dist, 'assets', 'chunk-abcd1234.js.gz'), '');
    fs.rmSync(path.join(fx.dist, '.sokudo-files.json'));
    await fx.rebuild();
    expect(fs.existsSync(stale)).toBe(false);
    expect(fs.existsSync(stale + '.gz')).toBe(false);
    expect(fs.existsSync(path.join(fx.dist, 'assets', 'keep-me.js'))).toBe(true);
    expect(fs.existsSync(path.join(fx.dist, 'robots.txt'))).toBe(true);
  });
});
