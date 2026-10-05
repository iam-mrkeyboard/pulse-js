/** Regression: `sokudo dev` pages use no inline scripts (work under script-src 'self'). */
import { describe, test, expect, beforeAll, afterAll } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DevServer, rewriteRuntimeImports } from '../src/server/dev-server';
import { ErrorOverlay } from '../src/server/error-overlay';
import { createDefaultConfig } from '../src/bundler/types';
import { writeFiles } from './helpers/fixture';
import { GlobalRegistrator } from '@happy-dom/global-registrator';

const inlineScripts = (html: string) =>
  (html.match(/<script\b(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/g) || []).length;

let root = '';
let dev: DevServer;
let base = '';
const origLog = console.log;

beforeAll(async () => {
  // The test preload installs happy-dom's Response/fetch globally; Bun.serve needs
  // the native ones. The dev server's SSR re-registers the DOM keeping them.
  if (GlobalRegistrator.isRegistered) await GlobalRegistrator.unregister();
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-dev-csp-'));
  writeFiles(root, {
    'src/pages/index.pulse': `<script>\n  const [n, setN] = createSignal(1);\n</script>\n<button onClick={() => setN(n() + 1)}>{n}</button>\n`,
  });
  const port = 40000 + Math.floor(Math.random() * 20000);
  const config = createDefaultConfig({ root, srcDir: './src', pages: { dir: './src/pages' }, devServer: { port, hmr: true, open: false } } as any);
  console.log = () => {};
  const { ensureSSRDom } = await import('../src/server/ssr');
  ensureSSRDom();
  dev = new DevServer(config);
  await dev.start();
  base = `http://localhost:${port}`;
});
afterAll(() => {
  dev?.stop();
  console.log = origLog;
  fs.rmSync(root, { recursive: true, force: true });
});

describe('dev server without inline scripts', () => {
  test('page: external scripts only, no import map', async () => {
    const html = await (await fetch(base + '/')).text();
    expect(inlineScripts(html)).toBe(0);
    expect(html).not.toContain('importmap');
    expect(html).toContain('<script type="module" src="/__sokudo/hydrate.js?page=src%2Fpages%2Findex.pulse"></script>');
    expect(html).toContain('<script type="module" src="/__sokudo_client.js"></script>');
  });

  test('hydration entry imports the page and the runtime by URL', async () => {
    const r = await fetch(base + '/__sokudo/hydrate.js?page=src%2Fpages%2Findex.pulse');
    expect(r.headers.get('content-type')).toContain('javascript');
    const js = await r.text();
    expect(js).toContain('import Page from "/__modules/src/pages/index.pulse"');
    expect(js).toContain("from '/runtime/hydration.js'");
    expect((await fetch(base + '/__sokudo/hydrate.js?page=..%2F..%2Fetc%2Fpasswd.pulse')).status).toBe(400);
    expect((await fetch(base + '/__sokudo/hydrate.js')).status).toBe(400);
  });

  test('served modules import the runtime by URL (no bare specifiers)', async () => {
    const js = await (await fetch(base + '/__modules/src/pages/index.pulse')).text();
    expect(js).toContain("from '/runtime/core.js'");
    expect(js).toContain("from '/runtime/dom.js'");
    expect(js).not.toMatch(/from\s*['"]pulse(-framework)?\/runtime/);
  });

  test('error overlay page has no inline script', async () => {
    const html = ErrorOverlay.generateHTML({ type: 'compile', file: 'x.pulse', message: 'boom' } as any);
    expect(inlineScripts(html)).toBe(0);
    expect(html).toContain('<script src="/__sokudo/overlay.js"></script>');
    expect(await (await fetch(base + '/__sokudo/overlay.js')).text()).toContain('/__sokudo_hmr');
  });
});

test('rewriteRuntimeImports maps every runtime entry', () => {
  const src = [
    "import { a } from 'sokudo/runtime';",
    'import { b } from "sokudo/runtime/dom";',
    "import { List } from 'sokudo/runtime/list';",
    "import { Show } from 'sokudo/runtime/show';",
    "const h = import('sokudo/runtime/hydration');",
    "import x from 'sokudo/runtime/other';",
    "import { z } from 'pulse/runtime';",
    "const s = 'sokudo/runtime';",
  ].join('\n');
  expect(rewriteRuntimeImports(src)).toBe([
    "import { a } from '/runtime/core.js';",
    'import { b } from "/runtime/dom.js";',
    "import { List } from '/runtime/primitives/list.js';",
    "import { Show } from '/runtime/primitives/show.js';",
    "const h = import('/runtime/hydration.js');",
    "import x from 'sokudo/runtime/other';",
    "import { z } from '/runtime/core.js';",
    "const s = 'sokudo/runtime';",
  ].join('\n'));
});
