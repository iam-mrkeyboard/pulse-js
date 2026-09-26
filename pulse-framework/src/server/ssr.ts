// ============================================================================
// FILE: src/server/ssr.ts - FIXED
// ============================================================================

import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { type PulseConfig } from '../bundler/types';
import path from 'node:path';
import { type ComponentCompiler } from './component-compiler';
import { markRoot } from '../runtime/ssr-markers';
import { pulsePlugin } from './pulse-plugin';

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
  constructor(private config: PulseConfig, private compiler: ComponentCompiler) { }

  /** Render a page to HTML (root element with hydration markers). Throws on failure. */
  async renderPageStrict(pagePath: string, props: Record<string, any> = {}): Promise<string> {
    // 1. Bundle the page for the server (compile .pulse, resolve pulse/runtime)
    const buildResult = await Bun.build({
      entrypoints: [pagePath],
      target: 'bun',
      format: 'esm',
      external: ['bun:test', 'lightningcss', 'ultrahtml', 'acorn', 'estree-walker'],
      sourcemap: 'none',
      plugins: [pulsePlugin(this.compiler)],
    });

    if (!buildResult.success) {
      throw new Error(buildResult.logs.map((l) => l.message).join('\n'));
    }

    // 2. Write to a per-page cache file (hash of the path avoids basename collisions)
    const cacheDir = path.join(this.config.root, '.pulse/cache/ssr');
    const key = Bun.hash(pagePath).toString(36);
    const outFile = path.join(cacheDir, `${path.basename(pagePath)}.${key}.mjs`);
    await Bun.write(outFile, buildResult.outputs[0]);

    // 3. Import (cache-busted) and execute. __PULSE_SSR__ tells the runtime it is
    // rendering on the server (e.g. skip document-level event delegation).
    const g = globalThis as any;
    const prevFlag = g.__PULSE_SSR__;
    g.__PULSE_SSR__ = true;
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
        return rootNode.outerHTML;
      }
      const holder = document.createElement('div');
      holder.appendChild(rootNode);
      return holder.innerHTML;
    } finally {
      g.__PULSE_SSR__ = prevFlag;
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
  wrapHTML(content: string, title = 'Pulse App', head = ''): string {
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
