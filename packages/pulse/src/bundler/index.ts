// ============================================================================
// FILE: src/bundler/index.ts - FULLY INTEGRATED
// Main bundler orchestrator - combines all phases
// ============================================================================

import path from 'node:path';
import { $, Glob } from 'bun';
// fs import removed
import { DependencyAnalyzer } from './dependency-analyzer';
import { ComponentCompiler as ServerComponentCompiler } from '../server/component-compiler';
import { ScriptParser } from '../server/script-parser';
import { TemplateTransformer } from '../server/template-transformer';
import { SSRRenderer } from '../server/ssr';
import { pulsePlugin } from '../server/pulse-plugin';
import { Compressor } from './compressor';
import type {
  PulseConfig,
  BuildResult,
  CompilationContext,
  PageManifest,
  IslandManifest,
} from './types';
import { VERSION } from '../version';

export class PulseBundler {
  private ctx: CompilationContext;
  private compressor: Compressor;

  constructor(config: PulseConfig) {
    this.ctx = {
      config,
      graph: {
        nodes: new Map(),
        edges: new Map(),
        entryPoints: new Set(),
        islands: new Set(),
        staticPages: new Set(),
      },
      output: {
        runtime: { core: '', primitives: new Map(), size: 0 },
        islands: new Map(),
        pages: new Map(),
        assets: new Map(),
        stats: {
          totalSize: 0,
          jsSize: 0,
          cssSize: 0,
          htmlSize: 0,
          staticPages: 0,
          interactivePages: 0,
          islands: 0,
          cacheableSize: 0,
        },
      },
      cache: {
        components: new Map(),
        templates: new Map(),
        styles: new Map(),
        hits: 0,
        misses: 0,
      },
    };

    this.compressor = new Compressor();
  }

  /** Output directory, resolved against the project root (not the process cwd). */
  private outDir(): string {
    return path.resolve(this.ctx.config.root, this.ctx.config.outDir);
  }

  async build(): Promise<BuildResult> {
    const startTime = Date.now();
    const errors: any[] = [];
    const warnings: any[] = [];

    try {
      console.log(`⚡ Pulse v${VERSION} Build Started\n`);

      // Phase 1: Analyze dependency graph
      console.log('📊 Phase 1: Analyzing dependencies...');
      const analyzer = new DependencyAnalyzer(this.ctx.config);

      const pagesDir = path.resolve(
        this.ctx.config.root,
        this.ctx.config.pages.dir,
      );
      const pageFiles = await this.findPulseFiles(pagesDir);

      for (const pageFile of pageFiles) {
        this.ctx.graph = await analyzer.analyze(pageFile);
      }

      analyzer.printGraph();

      // Phase 2: Classify pages (static pages ship no JS)
      const pages = pageFiles.map((file) => ({
        file,
        route: this.routeFor(pagesDir, file),
        node: this.ctx.graph.nodes.get(file)!,
        interactive: this.isInteractive(file),
      }));
      this.ctx.graph.staticPages.clear();
      for (const page of pages) {
        if (!page.interactive) this.ctx.graph.staticPages.add(page.file);
      }
      console.log(
        `\n✂️  Phase 2: ${pages.length} pages (${pages.filter((p) => p.interactive).length} interactive, ${pages.filter((p) => !p.interactive).length} static)`,
      );

      // Shared compiler for SSR and client bundles (same output as the dev server)
      const compiler = new ServerComponentCompiler(
        this.ctx.config,
        new ScriptParser(),
        new TemplateTransformer(),
      );

      // Phase 3: Client hydration bundles (one entry per interactive page, shared chunks)
      console.log('\n⚙️  Phase 3: Bundling client hydration code...');
      const clientEntries = await this.buildClientBundles(
        pages.filter((p) => p.interactive),
        compiler,
      );

      // Phase 4: Server-render every page
      console.log('\n🔧 Phase 4: Server-rendering pages...');
      const ssr = new SSRRenderer(this.ctx.config, compiler);

      // Phase 5: Generate pages
      console.log('\n📄 Phase 5: Generating pages...');

      for (const page of pages) {
        let body = '';
        try {
          body = await ssr.renderPageStrict(page.file);
        } catch (error: any) {
          const message = String(error?.message || error).split('\n')[0];
          warnings.push({
            file: path.relative(this.ctx.config.root, page.file),
            message: `SSR failed, page falls back to client render: ${message}`,
          });
          console.warn(`  ⚠ SSR failed for /${page.route} (client render fallback): ${message}`);
        }

        const pageManifest = await this.generatePage(
          page.node,
          page.route,
          body,
          clientEntries.get(page.file),
          !page.interactive,
        );
        this.ctx.output.pages.set(page.node.id, pageManifest);

        const type = page.interactive ? '🔵 Interactive' : '📄 Static';
        console.log(
          `  ✓ ${type} /${page.route}: ${this.formatBytes(pageManifest.size)}${body ? '' : ' (no SSR)'}`,
        );
      }

      // Phase 6: Calculate stats
      this.calculateStats();

      // Phase 7: Generate manifest file
      await this.writeManifest();

      // Print summary
      this.printSummary();

      const duration = Date.now() - startTime;

      return {
        success: true,
        manifest: this.ctx.output,
        errors,
        warnings,
        duration,
      };
    } catch (error: any) {
      errors.push({
        file: 'build',
        message: error.message,
        stack: error.stack,
      });

      return {
        success: false,
        manifest: this.ctx.output,
        errors,
        warnings,
        duration: Date.now() - startTime,
      };
    }
  }

  private async findPulseFiles(dir: string): Promise<string[]> {
    const files: string[] = [];
    const glob = new Glob('**/*.pulse');

    for await (const file of glob.scan(dir)) {
      files.push(path.join(dir, file));
    }

    return files;
  }

  /** URL route for a page file: pages/index.pulse -> '', pages/blog/v0.16.pulse -> 'blog/v0.16'. */
  private routeFor(pagesDir: string, file: string): string {
    const rel = path.relative(pagesDir, file).replace(/\\/g, '/').replace(/\.pulse$/, '');
    if (rel === 'index') return '';
    return rel.endsWith('/index') ? rel.slice(0, -'/index'.length) : rel;
  }

  /** A page needs client JS if it or any component it imports is interactive. */
  private isInteractive(file: string, seen = new Set<string>()): boolean {
    if (seen.has(file)) return false;
    seen.add(file);
    const node = this.ctx.graph.nodes.get(file);
    if (!node) return false;
    if (!node.isStatic) return true;
    for (const dep of node.dependencies) {
      if (this.isInteractive(dep, seen)) return true;
    }
    return false;
  }

  /**
   * Bundle one hydration entry per interactive page for the browser.
   * Each entry imports the compiled page and calls hydrate() on #app, which adopts
   * the server-rendered DOM. Shared runtime/components go into split chunks.
   */
  private async buildClientBundles(
    pages: Array<{ file: string; route: string; node: any }>,
    compiler: ServerComponentCompiler,
  ): Promise<Map<string, string>> {
    const entries = new Map<string, string>(); // page file -> /assets/... URL
    if (pages.length === 0) return entries;

    const entryDir = path.join(this.ctx.config.root, '.pulse/cache/entries');
    await $`mkdir -p ${entryDir}`;
    const entryNameToPage = new Map<string, string>();
    const entrypoints: string[] = [];

    for (const page of pages) {
      const name = 'page-' + (page.route || 'index').replace(/[^a-zA-Z0-9_-]/g, '_');
      const entryFile = path.join(entryDir, `${name}.js`);
      await Bun.write(
        entryFile,
        `import Page from ${JSON.stringify(page.file)};\n` +
          `import { hydrate } from 'pulse/runtime/hydration';\n` +
          `hydrate(Page, document.getElementById('app'));\n`,
      );
      entrypoints.push(entryFile);
      entryNameToPage.set(name, page.file);
    }

    const assetsDir = path.join(this.outDir(), 'assets');
    const result = await Bun.build({
      entrypoints,
      outdir: assetsDir,
      target: 'browser',
      format: 'esm',
      splitting: true,
      minify: !!this.ctx.config.build.minify,
      // build.sourcemap: external .map files next to each asset, linked with a
      // sourceMappingURL comment (DevTools loads them on demand; pages never do).
      sourcemap: this.ctx.config.build.sourcemap ? 'linked' : 'none',
      naming: { entry: '[name]-[hash].[ext]', chunk: 'chunk-[hash].[ext]' },
      plugins: [pulsePlugin(compiler)],
    });

    if (!result.success) {
      throw new Error(
        'Client bundle failed:\n' + result.logs.map((l) => String(l.message)).join('\n'),
      );
    }

    for (const output of result.outputs) {
      if (output.kind === 'sourcemap') continue; // written by Bun.build; not compressed or counted
      const code = await output.text();
      const size = Buffer.byteLength(code);
      this.ctx.output.runtime.size += output.kind === 'chunk' ? size : 0;
      await this.compressFile(output.path, code);

      if (output.kind !== 'entry-point') continue;
      const base = path.basename(output.path);
      const entryName = base.replace(/-[a-z0-9]+\.js$/, '');
      const pageFile = entryNameToPage.get(entryName);
      if (!pageFile) continue;
      const url = '/assets/' + base;
      entries.set(pageFile, url);

      const node = this.ctx.graph.nodes.get(pageFile)!;
      const manifest: IslandManifest = {
        id: node.id,
        path: url,
        code,
        dependencies: [],
        primitives: Array.from(node.primitives),
        size,
        isPreloaded: true,
      };
      this.ctx.output.islands.set(node.id, manifest);
      console.log(`  ✓ ${entryName}: ${this.formatBytes(size)}`);
    }

    return entries;
  }

  private async compressFile(filePath: string, content: string): Promise<void> {
    if (
      this.ctx.config.optimization.compress &&
      this.compressor.shouldCompress(Buffer.byteLength(content))
    ) {
      const compressed = this.compressor.compress(
        content,
        this.ctx.config.optimization.compress,
      );
      if (compressed.gzip) await Bun.write(filePath + '.gz', compressed.gzip);
      if (compressed.brotli) await Bun.write(filePath + '.br', compressed.brotli);
    }
  }

  private escapeHTML(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  private async generatePage(
    node: any,
    route: string,
    body: string,
    clientEntry: string | undefined,
    isStatic: boolean,
  ): Promise<PageManifest> {
    // Only the document shell is minified. The server-rendered body is written
    // verbatim: whitespace / comments are part of the DOM that hydration walks.
    const minify = !!this.ctx.config.build.minify;
    const nl = minify ? '' : '\n';
    const head = [
      '<meta charset="UTF-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
      `<title>${this.escapeHTML(node.name)}</title>`,
      clientEntry ? `<link rel="modulepreload" href="${clientEntry}">` : '',
    ]
      .filter(Boolean)
      .join(nl);
    const script = clientEntry
      ? `<script type="module" src="${clientEntry}"></script>`
      : '';
    const finalHTML =
      `<!DOCTYPE html>${nl}<html lang="en">${nl}<head>${nl}${head}${nl}</head>${nl}` +
      `<body>${nl}<div id="app">${body}</div>${nl}${script}${nl}</body>${nl}</html>${nl}`;

    const pagePath = path.join(
      this.outDir(),
      route === '' ? 'index.html' : path.join(route, 'index.html'),
    );

    await $`mkdir -p ${path.dirname(pagePath)}`;
    await Bun.write(pagePath, finalHTML);
    await this.compressFile(pagePath, finalHTML);

    return {
      path: '/' + route,
      html: finalHTML,
      islands: clientEntry ? [node.id] : [],
      isStatic,
      preloads: clientEntry ? [clientEntry] : [],
      css: [],
      size: Buffer.byteLength(finalHTML),
    };
  }

  private calculateStats(): void {
    const stats = this.ctx.output.stats;

    stats.staticPages = this.ctx.graph.staticPages.size;
    stats.interactivePages =
      this.ctx.graph.entryPoints.size - stats.staticPages;
    stats.islands = this.ctx.output.islands.size;

    stats.jsSize = this.ctx.output.runtime.size;
    for (const island of this.ctx.output.islands.values()) {
      stats.jsSize += island.size;
    }

    for (const page of this.ctx.output.pages.values()) {
      stats.htmlSize += page.size;
    }

    stats.totalSize = stats.jsSize + stats.cssSize + stats.htmlSize;
    stats.cacheableSize = this.ctx.output.runtime.size;
  }

  private async writeManifest(): Promise<void> {
    const manifest = {
      version: VERSION,
      buildTime: new Date().toISOString(),
      stats: this.ctx.output.stats,
      pages: Array.from(this.ctx.output.pages.values()).map((p) => ({
        path: p.path,
        isStatic: p.isStatic,
        size: p.size,
        islands: p.islands,
      })),
      islands: Array.from(this.ctx.output.islands.values()).map((i) => ({
        id: i.id,
        path: i.path,
        size: i.size,
        primitives: i.primitives,
      })),
      cache: {
        hits: this.ctx.cache.hits,
        misses: this.ctx.cache.misses,
        hitRate:
          this.ctx.cache.hits / (this.ctx.cache.hits + this.ctx.cache.misses),
      },
    };

    const manifestPath = path.join(this.outDir(), 'manifest.json');
    await Bun.write(manifestPath, JSON.stringify(manifest, null, 2));
  }
  private printSummary(): void {
    const stats = this.ctx.output.stats;
    console.log('\n' + '━'.repeat(60));
    console.log('📦 Build Summary');
    console.log('━'.repeat(60));
    console.log(`Total Size:        ${this.formatBytes(stats.totalSize)}`);
    console.log(`  JavaScript:      ${this.formatBytes(stats.jsSize)}`);
    console.log(`  HTML:            ${this.formatBytes(stats.htmlSize)}`);
    console.log(`  CSS:             ${this.formatBytes(stats.cssSize)}`);
    console.log('');
    console.log(`Pages:             ${this.ctx.output.pages.size}`);
    console.log(`  Static:          ${stats.staticPages} (0 KB JS)`);
    console.log(`  Interactive:     ${stats.interactivePages}`);
    console.log(`Islands:           ${stats.islands}`);
    console.log('');
    console.log(`Cacheable:         ${this.formatBytes(stats.cacheableSize)}`);
    console.log(
      `Cache Hit Rate:    ${((this.ctx.cache.hits / (this.ctx.cache.hits + this.ctx.cache.misses)) * 100).toFixed(1)}%`,
    );
    console.log('━'.repeat(60));
    console.log(`✨ Output: ${this.outDir()}`);
    console.log('━'.repeat(60) + '\n');
  }
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }
}
export async function build(config: PulseConfig): Promise<BuildResult> {
  const bundler = new PulseBundler(config);
  return bundler.build();
}
