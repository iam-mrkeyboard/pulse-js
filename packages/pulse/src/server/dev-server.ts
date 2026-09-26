// ============================================================================
// FILE: src/server/dev-server.ts - MERGED WITH COMPONENT COMPILATION
// ============================================================================

import path from 'node:path';
import type { PulseConfig } from '../bundler/types';
import { HMRManager } from './hmr';
import { SSRRenderer } from './ssr';
import { CompilationCache } from './compilation-cache';
import { ErrorOverlay, type DevError } from './error-overlay';
import { FileWatcher } from './file-watcher';

import {
  ComponentPropsError,
  ComponentImportError,
} from '../bundler/compiler/errors';
import { SafeCompiler } from '../bundler/compiler/safe-compiler';
import { CompilationError } from '../bundler/compiler/errors';
import { ScriptParser } from './script-parser';

// Extracted modules
import { serveHMRClient, getHMRScript } from './hmr-client';
import { wrapHTML, serve404, generateSuggestion } from './html-wrapper';
import { TemplateTransformer } from './template-transformer';
import { ComponentCompiler } from './component-compiler';

export class DevServer {
  private hmr: HMRManager;
  private config: PulseConfig;
  private ssr: SSRRenderer;
  private server?: any;
  private cache: CompilationCache;
  private watcher: FileWatcher;
  private compiler?: ComponentCompiler; // Reusing existing name but now implies the class
  private safeCompiler?: SafeCompiler;
  private lastError?: DevError;
  private compiledComponents: Map<string, string>;
  private scriptParser: ScriptParser;
  private templateTransformer: TemplateTransformer;

  constructor(config: PulseConfig) {
    this.config = config;
    this.hmr = new HMRManager();
    this.scriptParser = new ScriptParser();
    this.cache = new CompilationCache();
    this.watcher = new FileWatcher();
    this.templateTransformer = new TemplateTransformer();
    this.compiler = new ComponentCompiler(config, this.scriptParser, this.templateTransformer);
    // SSR needs compiler
    this.ssr = new SSRRenderer(config, this.compiler);
    this.safeCompiler = new SafeCompiler(this.compiler);
    this.compiledComponents = new Map();
  }

  async start() {
    const port = this.config.devServer.port;

    this.server = Bun.serve({
      port,
      fetch: async (req, server) => {
        const url = new URL(req.url);

        // WebSocket upgrade for HMR
        if (url.pathname === '/__pulse_hmr') {
          const upgraded = server.upgrade(req);
          if (upgraded) return undefined as any;
          return new Response('Upgrade failed', { status: 500 });
        }

        // Serve HMR client script
        if (url.pathname === '/__pulse_client.js') {
          return serveHMRClient();
        }

        // Serve runtime files
        if (url.pathname.startsWith('/runtime/')) {
          return await this.serveRuntime(url.pathname);
        }

        // Serve components via absolute path
        if (url.pathname === '/__component') {
          const filePath = url.searchParams.get('path');
          if (filePath) return await this.serveComponentByPath(filePath);
          return new Response('Missing path parameter', { status: 400 });
        }

        // Serve component modules
        if (url.pathname.startsWith('/components/')) {
          return await this.serveComponent(url.pathname);
        }

        // Serve compiled modules
        if (url.pathname.startsWith('/__modules/')) {
          return await this.serveModule(url.pathname);
        }

        // Serve public assets
        if (url.pathname.startsWith('/public/')) {
          return await this.servePublic(url.pathname);
        }

        // Serve pages
        return await this.servePage(url.pathname);
      },

      websocket: {
        open: (ws) => this.hmr.addClient(ws),
        message: (ws, message) => {
          try {
            const data = JSON.parse(message.toString());
            this.handleClientMessage(ws, data);
          } catch (error) {
            // Ignore invalid messages
          }
        },
        close: (ws) => this.hmr.removeClient(ws),
      },
    });

    // Start file watching
    this.startFileWatcher();

    console.log(`\n⚡ Pulse v0.16.0 Dev Server running\n`);
    console.log(`  Local:    http://localhost:${port}`);
    console.log(`  Network:  http://0.0.0.0:${port}`);
    console.log(
      `  HMR:      ${this.config.devServer.hmr ? '✓ Enabled' : '✗ Disabled'}`,
    );
    console.log(`  Cache:    ✓ Enabled`);
    console.log(`\n  Ready in ${process.uptime().toFixed(0)}ms\n`);
  }

  private async servePage(pathname: string): Promise<Response> {
    try {
      // Clear previous error
      if (this.lastError) {
        this.lastError = undefined;
        this.hmr.clearError();
      }

      const pagesDir = path.resolve(this.config.root, this.config.pages.dir);
      let pagePath: string;

      if (pathname === '/') {
        pagePath = path.join(pagesDir, 'index.pulse');
      } else {
        const cleanPath = pathname.slice(1);
        if (cleanPath.endsWith('/')) {
          pagePath = path.join(pagesDir, cleanPath.slice(0, -1) + '.pulse');
        } else {
          pagePath = path.join(pagesDir, cleanPath + '.pulse');
        }

        // Try index file
        const indexPath = path.join(pagesDir, cleanPath, 'index.pulse');
        const indexFile = Bun.file(indexPath);
        if (await indexFile.exists()) {
          pagePath = indexPath;
        }
      }

      const file = Bun.file(pagePath);
      if (!(await file.exists())) {
        return serve404(pathname);
      }

      // SSR Render
      console.log(`🔨 SSR Compiling: ${path.basename(pagePath)}`);
      const ssrHtml = await this.ssr.renderPage(pagePath);

      // Client Hydration Script
      // We request the page as a module using ?type=module query
      // and import 'hydrate' from runtime.
      const pageBasename = path.basename(pagePath);
      const relativePageUrl = pathname === '/' ? '/index.pulse' : pathname + (pathname.endsWith('.pulse') ? '' : '.pulse');
      // For hydration, we need the matching module.
      // If pathname is /about, we want /pages/about.pulse?type=module ?? 
      // serveModule handles /__modules/, serveComponent handles /components/.
      // We can serve it via /__modules/ ? OR just explicit path?
      // DevServer maps /components/ to src?
      // Let's use a reliable path relative to root?
      // serveModule logic: /__modules/path/to/file.pulse
      // pagePath is absolute.
      const relativePath = path.relative(this.config.root, pagePath);
      const clientModuleUrl = `/__modules/${relativePath}`;

      const clientScript = `
        <script type="module">
          import Page from '${clientModuleUrl}';
          import { hydrate } from '/runtime/hydration.js';
          
          const app = document.getElementById('app');
          hydrate(Page, app);
          
          // HMR Support
          if (import.meta.hot) {
            import.meta.hot.accept(() => {
              window.location.reload();
            });
          }
        </script>
      `;

      // Compiled modules import 'pulse/runtime*' (package specifiers); map them to
      // the dev server's /runtime/ routes so the browser can resolve them.
      const importMap = {
        imports: {
          'pulse/runtime': '/runtime/core.js',
          'pulse/runtime/dom': '/runtime/dom.js',
          'pulse/runtime/list': '/runtime/primitives/list.js',
          'pulse/runtime/show': '/runtime/primitives/show.js',
          'pulse/runtime/hydration': '/runtime/hydration.js',
          'pulse-framework/runtime': '/runtime/core.js',
          'pulse-framework/runtime/dom': '/runtime/dom.js',
          'pulse-framework/runtime/list': '/runtime/primitives/list.js',
          'pulse-framework/runtime/show': '/runtime/primitives/show.js',
          'pulse-framework/runtime/hydration': '/runtime/hydration.js',
        },
      };
      const head = `<script type="importmap">${JSON.stringify(importMap)}</script>\n  ${getHMRScript(this.config)}`;

      const fullHtml = this.ssr.wrapHTML(`
        <div id="app">${ssrHtml}</div>
        ${clientScript}
      `, 'Pulse App', head);

      return new Response(fullHtml, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'X-Pulse-Page': pageBasename,
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      });

    } catch (error: any) {
      console.error('❌ Error serving page:', error.message);

      if (error instanceof ComponentPropsError || error instanceof ComponentImportError) {
        this.lastError = error.toDevError();
      } else {
        this.lastError = {
          type: 'compile',
          file: pathname,
          message: error.message,
          stack: error.stack,
          suggestion: generateSuggestion(error),
        } as DevError;
      }

      const devError = this.lastError;
      this.hmr.error(devError);

      return new Response(ErrorOverlay.generateHTML(devError), {
        status: 500,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }
  }

  private async serveRuntime(pathname: string): Promise<Response> {
    const runtimePath = pathname.replace('/runtime/', '');

    // Implement robust path finding for runtime
    let frameworkRuntimeDir = path.resolve(import.meta.dir, '../runtime');

    // Check if core.ts exists here (Source mode)
    const coreCheck = Bun.file(path.join(frameworkRuntimeDir, 'core.ts'));
    if (!(await coreCheck.exists())) {
      // If not, we might be in dist/cli, try ../../src/runtime
      frameworkRuntimeDir = path.resolve(import.meta.dir, '../../src/runtime');
    }


    // Common helper to serve TS files from src/runtime
    const serveTsFile = async (fileName: string) => {
      const filePath = path.join(frameworkRuntimeDir, fileName);
      const file = Bun.file(filePath);

      if (await file.exists()) {
        const content = await file.text();
        const transpiler = new Bun.Transpiler({ loader: 'ts' });
        const js = await transpiler.transform(content);
        return new Response(js, {
          headers: {
            'Content-Type': 'application/javascript',
            'Cache-Control': 'no-cache, no-store, must-revalidate'
          },
        });
      }
      return new Response(`console.error("Runtime file ${fileName} not found at ${filePath}")`, { status: 404 });
    };

    // Core runtime
    if (runtimePath === 'core.js') {
      return await serveTsFile('core.ts');
    }

    // Primitives
    if (runtimePath === 'primitives/list.js') {
      return await serveTsFile('primitives/list.ts');
    }
    if (runtimePath === 'primitives/show.js') {
      return await serveTsFile('primitives/show.ts');
    }

    // DOM Runtime
    if (runtimePath === 'dom.js') {
      return await serveTsFile('dom.ts');
    }

    // Hydration + SSR markers (browser resolves relative imports from these modules)
    if (runtimePath === 'hydration.js') {
      return await serveTsFile('hydration.ts');
    }
    if (runtimePath === 'ssr-markers.js') {
      return await serveTsFile('ssr-markers.ts');
    }

    // Generic fallback: /runtime/foo/bar.js → foo/bar.ts under the runtime dir
    if (runtimePath.endsWith('.js')) {
      const tsName = runtimePath.replace(/\.js$/, '.ts');
      const candidate = await serveTsFile(tsName);
      if (candidate.status !== 404) return candidate;
    }

    return new Response('console.error("Runtime file not found")', { status: 404 });
  }

  private async serveComponent(pathname: string): Promise<Response> {
    try {
      // Strip .js extension if present
      const cleanPathname = pathname.endsWith('.js') ? pathname.slice(0, -3) : pathname;
      const componentPath = path.join(
        this.config.root,
        cleanPathname
      );

      // Check cache
      let file = Bun.file(componentPath);
      let foundPath = componentPath;

      if (!(await file.exists())) {
        const srcPath = path.join(this.config.root, 'src', cleanPathname);
        file = Bun.file(srcPath);
        if (await file.exists()) {
          foundPath = srcPath;
        } else {
          return new Response('console.error("Component not found")', { status: 404 });
        }
      }

      const content = await file.text();
      const hash = this.cache.computeHash(content);
      let compiled = this.compiledComponents.get(foundPath);

      if (!compiled || !this.cache.get(foundPath, hash)) {
        console.log(`🔨 Compiling component: ${path.basename(foundPath)}`);
        // Use SafeCompiler
        const result = await this.safeCompiler!.compile(content, foundPath);

        if (result.isOk()) {
          compiled = result.value.code;
          this.compiledComponents.set(foundPath, compiled);
          this.cache.set(foundPath, hash, compiled, []);
        } else {
          // Wrap error in DevError format or throw
          const err = result.error as CompilationError;
          throw err;
        }
      }

      return new Response(compiled, {
        headers: {
          'Content-Type': 'application/javascript',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      });

    } catch (error: any) {
      console.error('Component serve error:', error);
      return new Response(`console.error("Component serve error: ${error.message}")`, {
        status: 500,
        headers: { 'Content-Type': 'application/javascript' },
      });
    }
  }

  private async serveComponentByPath(filePath: string): Promise<Response> {
    try {
      const file = Bun.file(filePath);
      if (!(await file.exists())) {
        return new Response('Component not found', { status: 404 });
      }

      const content = await file.text();
      const hash = this.cache.computeHash(content);

      // Check cache
      let compiled = this.compiledComponents.get(filePath);
      if (!compiled || !this.cache.get(filePath, hash)) {
        console.log(`🔨 Compiling component: ${path.basename(filePath)}`);
        // Use SafeCompiler
        const result = await this.safeCompiler!.compile(content, filePath);

        if (result.isOk()) {
          compiled = result.value.code;
          this.compiledComponents.set(filePath, compiled);
          this.cache.set(filePath, hash, compiled, []);
        } else {
          const err = result.error as CompilationError;
          throw err;
        }
      }

      return new Response(compiled, {
        headers: {
          'Content-Type': 'application/javascript',
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      });
    } catch (error: any) {
      console.error('Component serve error:', error);
      return new Response(this.generateErrorComponent(error, filePath), {
        headers: { 'Content-Type': 'application/javascript' },
      });
    }
  }

  private async serveModule(pathname: string): Promise<Response> {
    const modulePath = pathname.replace('/__modules/', '');
    const srcPath = path.join(this.config.root, modulePath);

    const file = Bun.file(srcPath);
    if (!(await file.exists())) {
      return new Response('console.error("Module not found")', { status: 404 });
    }

    // If it's a .pulse file, we must compile it!
    if (modulePath.endsWith('.pulse')) {
      const content = await file.text();
      const result = await this.safeCompiler!.compile(content, srcPath);

      if (result.isOk()) {
        const compiled = result.value.code;
        return new Response(compiled, {
          headers: { 'Content-Type': 'application/javascript' },
        });
      } else {
        const err = result.error as CompilationError;
        console.error('Module compilation error:', err);
        return new Response(`console.error("Module compilation error: ${err.message}")`, {
          status: 500,
          headers: { 'Content-Type': 'application/javascript' }
        });
      }
    }

    return new Response(file);
  }

  private async servePublic(pathname: string): Promise<Response> {
    const publicPath = path.join(this.config.root, pathname);
    const file = Bun.file(publicPath);
    if (await file.exists()) {
      return new Response(file);
    }
    return new Response('Not Found', { status: 404 });
  }

  private generateErrorComponent(error: Error, path: string): string {
    return `
      export default function ErrorComponent() {
        const el = document.createElement('div');
        el.style.cssText = 'border: 2px solid red; padding: 20px; margin: 10px; background: #fff0f0; border-radius: 8px; font-family: monospace;';
        el.innerHTML = \`
          <h3 style="color: #d32f2f; margin-top: 0;">⚠️ Component Error</h3>
          <p><strong>File:</strong> ${path}</p>
          <div style="background: #ffebee; padding: 10px; border-radius: 4px; overflow-x: auto;">
            <p style="margin: 0; color: #b71c1c;"><strong>Error:</strong> ${error.message.replace(/`/g, '\\`')}</p>
          </div>
          <pre style="margin-top: 10px; font-size: 11px; color: #555;">${(error.stack || '').replace(/`/g, '\\`')}</pre>
        \`;
        return el;
      }
    `;
  }

  private startFileWatcher(): void {
    this.watcher.watch(
      this.config.root,
      {
        recursive: true,
        ignored: ['**/node_modules/**', '**/.git/**', '**/dist/**'],
        extensions: ['.pulse', '.ts', '.css', '.js']
      },
      (event) => {
        const filePath = event.file;
        console.log(`📝 File ${event.type}: ${path.basename(filePath)}`);

        // Clear cache
        this.cache.invalidate(filePath);

        // Handle HMR
        if (this.config.devServer.hmr) {
          if (filePath.endsWith('.css')) {
            this.hmr.broadcast({ type: 'css-update', path: '/' + path.relative(this.config.root, filePath) });
          } else {
            this.hmr.broadcast({ type: 'full-reload' });
          }
        }
      }
    );
  }

  private handleClientMessage(ws: any, data: any): void {
    if (data.type === 'ping') {
      ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
    }
  }


  stop(): void {
    this.watcher.close();
    this.server?.stop();
    console.log('\n👋 Dev server stopped\n');
  }
}
