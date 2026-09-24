// ============================================================================
// FILE: src/server/dev-server.ts - MERGED WITH COMPONENT COMPILATION
// ============================================================================

import path from 'node:path';
import type { PulseConfig } from '../bundler/types';
import { HMRManager } from './hmr';
import { SSRRenderer } from './ssr';
import { ModuleGraph } from './module-graph';
import { CompilationCache } from './compilation-cache';
import { ErrorOverlay, type DevError } from './error-overlay';
import { FileWatcher } from './file-watcher';

import { DependencyAnalyzer } from '../bundler/analyzer/dependency-analyzer';
import { HotReload } from './hot-reload';
import {
  ComponentPropsError,
  ComponentImportError,
} from '../bundler/compiler/errors';
import { HTMLParser, type ParsedNode, type ParsedExpression } from '../bundler/compiler/html-parser';
import { ReactivityTransformer } from '../bundler/compiler/reactivity-transformer';
import { CSSScoper } from '../bundler/compiler/css-scoper';
import { ScriptParser, type ScriptParseResult } from './script-parser';

// Extracted modules
import { serveHMRClient, getHMRScript } from './runtime/hmr-client';
import { wrapHTML, serve404, generateSuggestion } from './utils/html-wrapper';
import { getInlineListPrimitive } from './primitives/inline-list';
import { getInlineShowPrimitive } from './primitives/inline-show';
import { getInlineRuntime } from './runtime/inline-runtime';
import { TemplateTransformer } from './compiler/template-transformer';
import { getMountScript } from './compiler/mount-script-generator';
import { PageCompiler } from './compiler/page-compiler';
import { ComponentCompiler } from './compiler/component-compiler';

export class DevServer {
  private hmr: HMRManager;
  private config: PulseConfig;
  private ssr: SSRRenderer;
  private server?: any;
  private moduleGraph: ModuleGraph;
  private cache: CompilationCache;
  private watcher: FileWatcher;
  private analyzer: DependencyAnalyzer;
  private compiler?: ComponentCompiler; // Reusing existing name but now implies the class
  private pageCompiler: PageCompiler;
  private lastError?: DevError;
  private hotReload: HotReload;
  private htmlParser: HTMLParser;
  private reactivityTransformer: ReactivityTransformer;
  private compiledComponents: Map<string, string>;
  private scriptParser: ScriptParser;
  private templateTransformer: TemplateTransformer;

  constructor(config: PulseConfig) {
    this.config = config;
    this.hmr = new HMRManager();
    this.ssr = new SSRRenderer();
    this.moduleGraph = new ModuleGraph();
    this.cache = new CompilationCache();
    this.watcher = new FileWatcher();
    this.analyzer = new DependencyAnalyzer(config);
    this.hotReload = new HotReload(this.moduleGraph, this.hmr);
    this.htmlParser = new HTMLParser();
    this.scriptParser = new ScriptParser();
    this.templateTransformer = new TemplateTransformer();
    this.pageCompiler = new PageCompiler(config, this.scriptParser, this.templateTransformer);
    this.compiler = new ComponentCompiler(config, this.scriptParser, this.templateTransformer);
    this.reactivityTransformer = new ReactivityTransformer();
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

    console.log(`\n⚡ Pulse v0.13.0 Dev Server running\n`);
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
      // Clear previous error if page loads successfully
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

        // Try index file in directory
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

      // Add to module graph
      const module = this.moduleGraph.addModule(pagePath, 'page');

      // Check cache
      const content = await file.text();
      const hash = this.cache.computeHash(content);
      const cached = this.cache.get(pagePath, hash);

      let html: string;
      if (cached) {
        html = cached;
        console.log(`📦 Cache hit: ${path.basename(pagePath)}`);
      } else {
        console.log(`🔨 Compiling: ${path.basename(pagePath)}`);
        html = await this.pageCompiler.compile(pagePath, content);
        this.cache.set(pagePath, hash, html, []);
        this.moduleGraph.updateModule(pagePath, hash, html);
      }

      return new Response(html, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'X-Pulse-Page': path.basename(pagePath),
          'Cache-Control': 'no-cache, no-store, must-revalidate',
        },
      });
    } catch (error: any) {
      console.error('❌ Error serving page:', error.message);

      // Handle specific error types
      if (error instanceof ComponentPropsError) {
        this.lastError = error.toDevError();
      } else if (error instanceof ComponentImportError) {
        this.lastError = error.toDevError();
      } else {
        this.lastError = {
          type: 'compile',
          file: pathname,
          message: error.message,
          stack: error.stack,
          suggestion: generateSuggestion(error),
        };
      }

      const devError = this.lastError || { type: 'runtime', message: 'Unknown error' } as DevError;
      this.hmr.error(devError);

      return new Response(ErrorOverlay.generateHTML(devError), {
        status: 500,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }
  }

  private async serveRuntime(pathname: string): Promise<Response> {
    const runtimePath = pathname.replace('/runtime/', '');
    // Framework package root (this file lives in src/server/)
    const frameworkSrc = path.resolve(import.meta.dir, '..');

    const serveTsFile = async (absolutePath: string) => {
      const file = Bun.file(absolutePath);
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
      return new Response(`console.error("Runtime file not found: ${absolutePath}")`, { status: 404 });
    };

    if (runtimePath === 'core.js') {
      return await serveTsFile(path.join(frameworkSrc, 'runtime/core.ts'));
    }
    if (runtimePath === 'primitives/list.js') {
      return await serveTsFile(path.join(frameworkSrc, 'runtime/primitives/list.ts'));
    }
    if (runtimePath === 'primitives/show.js') {
      return await serveTsFile(path.join(frameworkSrc, 'runtime/primitives/show.ts'));
    }
    if (runtimePath === 'dom.js') {
      // Single DOM runtime: bundler/runtime/dom.ts (also re-exported as runtime/dom.ts)
      return await serveTsFile(path.join(frameworkSrc, 'bundler/runtime/dom.ts'));
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
        compiled = await this.compiler!.compile(foundPath, content);
        this.compiledComponents.set(foundPath, compiled);
        this.cache.set(foundPath, hash, compiled, []);
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
        compiled = await this.compiler!.compile(filePath, content);
        this.compiledComponents.set(filePath, compiled);
        this.cache.set(filePath, hash, compiled, []);
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
      const compiled = await this.compiler!.compile(srcPath, content);
      return new Response(compiled, {
        headers: { 'Content-Type': 'application/javascript' },
      });
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
