// ============================================================================
// FILE: src/server/ssr.ts - FIXED
// ============================================================================

import { GlobalRegistrator } from '@happy-dom/global-registrator';
import { type PulseConfig } from '../bundler/types';
import path from 'node:path';
import { type ComponentCompiler } from './component-compiler';
import { type PageCompiler } from './page-compiler';

// Register DOM globals once
GlobalRegistrator.register();

export class SSRRenderer {
  constructor(private config: PulseConfig, private compiler: ComponentCompiler) { }

  async renderPage(pagePath: string, props: Record<string, any> = {}): Promise<string> {
    try {
      // 1. Bundle the page for the server (resolving runtime/components)
      const buildResult = await Bun.build({
        entrypoints: [pagePath],
        target: 'bun',
        format: 'esm',
        external: ['bun:test', 'lightningcss', 'ultrahtml', 'acorn', 'estree-walker'], // Dependencies of compiler, not runtime
        // But runtime has NO deps except core.
        sourcemap: 'none',
        plugins: [
          {
            name: 'pulse-ssr-loader',
            setup: (build) => {
              // Resolve Runtime
              build.onResolve({ filter: /^\/runtime\// }, (args) => {
                const subPath = args.path.replace('/runtime/', '');
                // Resolve to source
                let runtimeDir = path.resolve(this.config.root, '../pulse-framework/src/runtime');

                // Fallback for when running in framework repo vs app repo
                // If config.root is app, framework is in ../pulse-framework ?
                // Or try relative import from this file?
                // This file is in src/server/
                // runtime is in src/runtime/
                // So using import.meta.dir is safer.
                runtimeDir = path.resolve(import.meta.dir, '../runtime');

                // Handle extension (ts)
                const target = path.join(runtimeDir, subPath.replace('.js', '.ts'));
                return { path: target };
              });

              // Load .pulse files
              build.onLoad({ filter: /\.pulse$/ }, async (args) => {
                const content = await Bun.file(args.path).text();
                // Compile using the specific component compiler logic
                // For 'page' components, strictly speaking we treat them as components for imports,
                // BUT the entry point is a page.
                // PageCompiler produces logic+template. ComponentCompiler produces module.
                // SSR expects a component-like export (default function).
                // ComponentCompiler produces exactly that!
                // PageCompiler produces... just HTML string?
                // Wait. PageCompiler implementation:
                // return `compileInteractive/compileStatic`.
                // Interactive returns HTML string (with script tags).
                // ComponentCompiler returns JS module string.
                // FOR SSR: We need the JS Module version of the Page so we can execute it!
                // So we should use ComponentCompiler for the page too?
                // A Page IS a component.
                // But PageCompiler injects the boilerplate wrapper?
                // If we want to render the body content, ComponentCompiler is better.
                // We wrap it in <html> later.

                const compiled = await this.compiler.compile(args.path, content);
                return {
                  contents: compiled,
                  loader: 'js',
                };
              });
            },
          },
        ],
      });

      if (!buildResult.success) {
        throw new Error(buildResult.logs.map(l => l.message).join('\n'));
      }

      // 2. Load the bundle
      // We can't easily import() a Blob/Output in Bun yet without writing?
      // Actually we can response with it, but we want to execute it in this process.
      // Easiest debug method: Write to cache file.
      const cacheDir = path.join(this.config.root, '.pulse/cache/ssr');
      const outFile = path.join(cacheDir, path.basename(pagePath) + '.mjs');
      await Bun.write(outFile, buildResult.outputs[0]);

      // 3. Import and Execute
      // Invalidate cache? 
      // Dynamic import signature changes with timestamp query?
      const modulePath = `${outFile}?t=${Date.now()}`;
      const module = await import(modulePath);

      const Component = module.default;

      // 4. Render
      // Component returns a DOM Node (HappyDOM node)
      const rootNode = Component(props);

      // Serialize
      return rootNode.outerHTML;

    } catch (error: any) {
      console.error('SSR Error:', error);
      return `<div style="color:red">SSR Error: ${error.message}</div>`;
    }
  }

  // Helper to wrap HTML with proper document structure
  wrapHTML(content: string, title = 'Pulse App'): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <script type="module" src="/@vite/client"></script> <!-- Placeholder for HMR if needed --> 
</head>
<body>
  ${content}
</body>
</html>`;
  }
}
