/**
 * Regressions: same-named components in different folders get distinct, stable scope ids.
 */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';
import { buildFixture, writeFiles, type Fixture } from './helpers/fixture';
import { ComponentCompiler } from '../src/server/component-compiler';

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

describe('scope ids', () => {
  const scopes = (html: string) => [...html.matchAll(/class="(data-v-[a-z0-9]+) pulse-component-card"/g)].map((m) => m[1]);

  test('same file name in different folders -> different scope ids', () => {
    const ids = scopes(fx.app());
    expect(ids.length).toBe(2);
    expect(ids[0]).not.toBe(ids[1]);
  });

  test('scope ids are stable across builds', async () => {
    const before = scopes(fx.app());
    await fx.rebuild();
    expect(scopes(fx.app())).toEqual(before);
  });

  test('hash depends on the relative path and the content', () => {
    const h = ComponentCompiler.scopeHash;
    expect(h('/p/src/a/Card.pulse', 'x', '/p')).toBe(h('/p/src/a/Card.pulse', 'x', '/p'));
    expect(h('/p/src/a/Card.pulse', 'x', '/p')).toBe(h('/q/src/a/Card.pulse', 'x', '/q'));
    expect(h('/p/src/a/Card.pulse', 'x', '/p')).not.toBe(h('/p/src/b/Card.pulse', 'x', '/p'));
    expect(h('/p/src/a/Card.pulse', 'x', '/p')).not.toBe(h('/p/src/a/Card.pulse', 'y', '/p'));
  });
});

