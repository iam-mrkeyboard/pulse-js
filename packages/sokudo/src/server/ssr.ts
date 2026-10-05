// ============================================================================
// FILE: src/server/ssr.ts - FIXED
// ============================================================================

import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { type SokudoConfig } from '../bundler/types';
import path from 'node:path';
import { type ComponentCompiler } from './component-compiler';
import { markRoot } from '../runtime/ssr-markers';
import { sokudoPlugin } from './sokudo-plugin';
import { styleClass } from './template-transformer';

/** Layout of Sokudo's wrapper elements (instead of style="display:contents" in extract mode). */
export const SOKUDO_BASE_CSS = 'pulse-list,pulse-show,[data-pulse-component]{display:contents}';

/**
 * Register happy-dom DOM globals once for SSR, but keep Bun's own networking /
 * stream globals. happy-dom replaces Response/Request/Headers/fetch, which made
 * Bun.serve reject the dev server's responses ("Expected a Response object").
 */
const KEEP_NATIVE = [
  'Response', 'Request', 'Headers', 'fetch', 'FormData', 'Blob', 'File',
  'ReadableStream', 'WritableStream', 'TransformStream', 'WebSocket',
  'URL', 'URLSearchParams', 'AbortController', 'AbortSignal',
  'TextEncoder', 'TextDecoder',
] as const;

export function ensureSSRDom(): void {
  if (GlobalRegistrator.isRegistered) return;
  const saved: Record<string, unknown> = {};
  for (const k of KEEP_NATIVE) saved[k] = (globalThis as any)[k];
  GlobalRegistrator.register();
  for (const k of KEEP_NATIVE) {
    if (saved[k] !== undefined) (globalThis as any)[k] = saved[k];
  }
}

ensureSSRDom();

export class SSRRenderer {
  /** .pulse files compiled for the last rendered page (its component tree). */
  public lastFiles: string[] = [];
  /** Rules for inline styles the last render produced (extract mode). */
  public lastStyleRules: string[] = [];

  constructor(private config: SokudoConfig, private compiler: ComponentCompiler, private options: { extractStyles?: boolean } = {}) { }

  /**
   * Strict style-src CSP: move style attributes the render produced (style
   * bindings, runtime-set styles) into generated "pd-" classes.
   */
  private extractInlineStyles(root: Element): string[] {
    const rules: string[] = [];
    const els = [root, ...Array.from(root.querySelectorAll('[style]'))];
    for (const el of els) {
      const css = el.getAttribute('style');
      if (css === null) continue;
      el.removeAttribute('style');
      const sc = styleClass(css, 'pd');
      if (!sc) continue;
      el.classList.add(sc.cls);
      if (!rules.includes(sc.rule)) rules.push(sc.rule);
    }
    return rules;
  }

  /** Render a page to HTML (root element with hydration markers). Throws on failure. */
  async renderPageStrict(pagePath: string, props: Record<string, any> = {}): Promise<string> {
    const files: string[] = [];
    this.lastFiles = files;
    this.lastStyleRules = [];
    // 1. Bundle the page for the server (compile .pulse, resolve sokudo/runtime)
    const buildResult = await Bun.build({
      entrypoints: [pagePath],
      target: 'bun',
      format: 'esm',
      external: ['bun:test', 'lightningcss', 'acorn', 'estree-walker'],
      sourcemap: 'none',
      plugins: [sokudoPlugin(this.compiler, (file) => files.push(file))],
    });

    if (!buildResult.success) {
      throw new Error(buildResult.logs.map((l) => l.message).join('\n'));
    }

    // 2. Write to a per-page cache file (hash of the path avoids basename collisions)
    const cacheDir = path.join(this.config.root, '.sokudo/cache/ssr');
    const key = Bun.hash(pagePath).toString(36);
    const outFile = path.join(cacheDir, `${path.basename(pagePath)}.${key}.mjs`);
    await Bun.write(outFile, buildResult.outputs[0]);

    // 3. Import (cache-busted) and execute. __SOKUDO_SSR__ tells the runtime it is
    // rendering on the server (e.g. skip document-level event delegation).
    const g = globalThis as any;
    const prevFlag = g.__SOKUDO_SSR__;
    g.__SOKUDO_SSR__ = true;
    try {
      const module = await import(`${outFile}?t=${Date.now()}`);
      const Component = module.default;
      if (typeof Component !== 'function') {
        throw new Error(`Page ${pagePath} has no default component export`);
      }

      // 4. Render: component returns a (happy-dom) Node
      const rootNode = Component(props);
      if (rootNode instanceof Element) {
        markRoot(rootNode);
        if (this.options.extractStyles) this.lastStyleRules = this.extractInlineStyles(rootNode);
        return rootNode.outerHTML;
      }
      const holder = document.createElement('div');
      holder.appendChild(rootNode);
      if (this.options.extractStyles) {
        this.lastStyleRules = Array.from(holder.children).flatMap((c) => this.extractInlineStyles(c));
      }
      return holder.innerHTML;
    } finally {
      g.__SOKUDO_SSR__ = prevFlag;
    }
  }

  async renderPage(pagePath: string, props: Record<string, any> = {}): Promise<string> {
    try {
      return await this.renderPageStrict(pagePath, props);
    } catch (error: any) {
      console.error('SSR Error:', error);
      return `<div style="color:red">SSR Error: ${String(error?.message || error).replace(/</g, '&lt;')}</div>`;
    }
  }

  // Helper to wrap HTML with proper document structure
  wrapHTML(content: string, title = 'Sokudo App', head = ''): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  ${head}
</head>
<body>
  ${content}
</body>
</html>`;
  }
}
