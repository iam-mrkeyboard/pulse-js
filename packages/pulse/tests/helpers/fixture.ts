/** Build a throwaway Pulse project and hydrate its pages in happy-dom. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PulseBundler } from '../../src/bundler/index';
import { createDefaultConfig } from '../../src/bundler/types';

export interface Fixture {
  root: string;
  dist: string;
  result: any;
  html(page?: string): string;
  /** Server-rendered markup inside <div id="app">. */
  app(page?: string): string;
  /** Load the page's SSR markup into document.body and run its client bundle. */
  hydrate(page?: string): Promise<{ errors: string[]; replaceWith: number }>;
  rebuild(): Promise<any>;
  cleanup(): void;
}

export function writeFiles(root: string, files: Record<string, string>) {
  for (const [rel, content] of Object.entries(files)) {
    const f = path.join(root, rel);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, content);
  }
}

export async function buildFixture(files: Record<string, string>, prefix = 'pulse-fx-'): Promise<Fixture> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  writeFiles(root, files);
  const config = createDefaultConfig({
    root, srcDir: './src', outDir: './dist', publicDir: './public', pages: { dir: './src/pages' },
    build: { minify: false, sourcemap: false, target: 'es2022', splitting: true, treeshake: true, islands: true, ssr: true },
  } as any);
  const dist = path.join(root, 'dist');
  const build = async () => {
    const result = await new PulseBundler(config).build();
    if (result.errors?.length) throw new Error('build failed: ' + JSON.stringify(result.errors));
    return result;
  };
  const result = await build();
  const fx: Fixture = {
    root, dist, result,
    html: (page = 'index') => fs.readFileSync(path.join(dist, `${page}.html`), 'utf8'),
    app: (page = 'index') => {
      const m = fx.html(page).match(/<div id="app">([\s\S]*)<\/div>\s*(<link|<script|<\/body>)/);
      if (!m) throw new Error('no #app in ' + page);
      return m[1];
    },
    async hydrate(page = 'index') {
      const html = fx.html(page);
      const src = html.match(/<script type="module" src="(\/assets\/[^"]+\.js)"><\/script>/);
      document.body.innerHTML = `<div id="app">${fx.app(page)}</div>`;
      const errors: string[] = [];
      const oe = console.error, ow = console.warn;
      console.error = (...a: any[]) => { errors.push(a.map(String).join(' ')); };
      console.warn = (...a: any[]) => { errors.push(a.map(String).join(' ')); };
      const proto = (window as any).Element.prototype;
      const orig = proto.replaceWith;
      let replaceWith = 0;
      proto.replaceWith = function (this: any, ...args: any[]) { replaceWith++; return orig.apply(this, args); };
      try {
        if (src) await import(path.join(dist, src[1]));
      } finally {
        proto.replaceWith = orig;
        console.error = oe; console.warn = ow;
      }
      return { errors, replaceWith };
    },
    rebuild: build,
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
  return fx;
}

export const $ = (sel: string) => document.querySelector(sel) as HTMLElement | null;
export const tick = () => new Promise((r) => setTimeout(r, 0));
