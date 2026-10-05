// ============================================================================
// FILE: src/bundler/index.ts - FULLY INTEGRATED
// Main bundler orchestrator - combines all phases
// ============================================================================

import path from 'node:path';
import { $, Glob } from 'bun';
import fs from 'node:fs';
import { DependencyAnalyzer } from './dependency-analyzer';
import { ComponentCompiler as ServerComponentCompiler } from '../server/component-compiler';
import { ScriptParser } from '../server/script-parser';
import { TemplateTransformer } from '../server/template-transformer';
import { SSRRenderer, SOKUDO_BASE_CSS } from '../server/ssr';
import { sokudoPlugin } from '../server/sokudo-plugin';
import { Compressor } from './compressor';
import type {
  SokudoConfig,
  BuildResult,
  CompilationContext,
  PageManifest,
  IslandManifest,
} from './types';
import { VERSION } from '../version';

export class SokudoBundler {
  private ctx: CompilationContext;
  private compressor: Compressor;

  constructor(config: SokudoConfig) {
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
      console.log(`⚡ Sokudo v${VERSION} Build Started\n`);

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
      // Production pages run under a strict style-src CSP: component CSS goes to
      // linked .css files and the markup carries no inline style attributes.
      const compiler = new ServerComponentCompiler(
        this.ctx.config,
        new ScriptParser(),
        new TemplateTransformer({ extractStyles: true }),
      );

      // Phase 3: Client hydration bundles (one entry per interactive page, shared chunks)
      console.log('\n⚙️  Phase 3: Bundling client hydration code...');
      const clientEntries = await this.buildClientBundles(
        pages.filter((p) => p.interactive),
        compiler,
      );

      // Phase 4: Server-render every page
      console.log('\n🔧 Phase 4: Server-rendering pages...');
      const ssr = new SSRRenderer(this.ctx.config, compiler, { extractStyles: true });

      // Phase 5: Generate pages
      console.log('\n📄 Phase 5: Generating pages...');

      for (const page of pages) {
        let body = '';
        let cssFiles: string[] = [];
        let ssrRules: string[] = [];
        try {
          body = await ssr.renderPageStrict(page.file);
          // Deterministic CSS order (imports depth-first, then the page), limited
          // to the files the page's render actually compiled.
          const compiled = new Set(ssr.lastFiles);
          const order = this.dependencyFiles(page.file);
          cssFiles = [...order.filter((f) => compiled.has(f)), ...[...compiled].filter((f) => !order.includes(f)).sort()];
          ssrRules = ssr.lastStyleRules;
        } catch (error: any) {
          cssFiles = this.dependencyFiles(page.file);
          const message = String(error?.message || error).split('\n')[0];
          warnings.push({
            file: path.relative(this.ctx.config.root, page.file),
            message: `SSR failed, page falls back to client render: ${message}`,
          });
          console.warn(`  ⚠ SSR failed for /${page.route} (client render fallback): ${message}`);
        }

        const stylesheet = await this.writePageCss(page.route, compiler, cssFiles, ssrRules);
        const pageManifest = await this.generatePage(
          page.node,
          page.route,
          body,
          clientEntries.get(page.file),
          !page.interactive,
          stylesheet,
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

      // Remove outputs of earlier builds this build did not produce again
      // (old hashed assets, pages that no longer exist). Only files a Pulse
      // build wrote are ever deleted.
      await this.removeStaleOutputs();

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

    const entryDir = path.join(this.ctx.config.root, '.sokudo/cache/entries');
    await $`mkdir -p ${entryDir}`;
    const entryNameToPage = new Map<string, string>();
    const entrypoints: string[] = [];

    for (const page of pages) {
      const name = 'page-' + (page.route || 'index').replace(/[^a-zA-Z0-9_-]/g, '_');
      const entryFile = path.join(entryDir, `${name}.js`);
      await Bun.write(
        entryFile,
        `import Page from ${JSON.stringify(page.file)};\n` +
          `import { hydrate } from 'sokudo/runtime/hydration';\n` +
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
      plugins: [sokudoPlugin(compiler)],
    });

    if (!result.success) {
      throw new Error(
        'Client bundle failed:\n' + result.logs.map((l) => String(l.message)).join('\n'),
      );
    }

    for (const output of result.outputs) {
      this.track(output.path);
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

  /** Absolute paths of every file this build wrote into outDir. */
  private written = new Set<string>();

  private track(filePath: string) {
    this.written.add(path.resolve(filePath));
  }

  /** Files earlier builds wrote, recorded relative to outDir. */
  private static readonly OUTPUT_RECORD = '.sokudo-files.json';
  /** Hashed build assets (fallback when no record exists yet, e.g. dist from an older Pulse). */
  private static readonly HASHED_ASSET = /^(page-[\w-]+|chunk)-[a-z0-9]{8}\.(js|css)(\.map)?(\.gz|\.br)?$/;

  private async removeStaleOutputs(): Promise<void> {
    const out = this.outDir();
    const recordPath = path.join(out, SokudoBundler.OUTPUT_RECORD);
    let previous: string[] | null = null;
    try {
      const parsed = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
      if (Array.isArray(parsed?.files)) previous = parsed.files.filter((f: unknown) => typeof f === 'string');
    } catch {
      previous = null;
    }
    const candidates: string[] = [];
    if (previous) {
      for (const rel of previous) {
        const abs = path.resolve(out, rel);
        // Never leave outDir, whatever the record says.
        if (!abs.startsWith(out + path.sep)) continue;
        candidates.push(abs);
      }
    } else {
      const assets = path.join(out, 'assets');
      let names: string[] = [];
      try { names = fs.readdirSync(assets); } catch { names = []; }
      for (const name of names) {
        if (SokudoBundler.HASHED_ASSET.test(name)) candidates.push(path.join(assets, name));
      }
    }
    let removed = 0;
    for (const abs of candidates) {
      if (this.written.has(abs)) continue;
      try {
        fs.unlinkSync(abs);
        removed++;
      } catch {
        continue;
      }
      // Drop directories emptied by a removed page (never outDir itself).
      let dir = path.dirname(abs);
      while (dir.startsWith(out + path.sep)) {
        try { fs.rmdirSync(dir); } catch { break; }
        dir = path.dirname(dir);
      }
    }
    if (removed) console.log(`🧹 Removed ${removed} stale output file${removed === 1 ? '' : 's'}`);
    const files = [...this.written].map((f) => path.relative(out, f).split(path.sep).join('/')).sort();
    fs.writeFileSync(recordPath, JSON.stringify({ files }, null, 2) + '\n');
  }

  /** A page file and every file it imports, transitively (dependency graph), imports first. */
  private dependencyFiles(file: string, seen = new Set<string>()): string[] {
    if (seen.has(file)) return [];
    seen.add(file);
    const node = this.ctx.graph.nodes.get(file);
    // Post-order (imports first, then the file): a page's CSS comes after its
    // components' CSS and wins ties, as with bundlers that follow import order.
    const out: string[] = [];
    for (const dep of node?.dependencies || []) out.push(...this.dependencyFiles(dep, seen));
    out.push(path.resolve(file));
    return out;
  }

  /**
   * Write the page's stylesheet: Pulse's base rule, the scoped CSS and generated
   * style classes of every component file the page renders, and the classes for
   * inline styles the server render produced. Returns its URL.
   */
  private async writePageCss(
    route: string,
    compiler: ServerComponentCompiler,
    files: string[],
    ssrRules: string[],
  ): Promise<{ url: string; size: number }> {
    const parts: string[] = [SOKUDO_BASE_CSS];
    const seen = new Set<string>();
    for (const f of files) {
      if (seen.has(f)) continue;
      seen.add(f);
      const css = compiler.cssByFile.get(f);
      if (css) parts.push(css);
    }
    for (const rule of ssrRules) if (!parts.includes(rule)) parts.push(rule);
    let css = parts.join('\n') + '\n';
    if (this.ctx.config.build.minify) {
      try {
        const { transform } = await import('lightningcss');
        css = transform({ filename: 'page.css', code: Buffer.from(css), minify: true }).code.toString();
      } catch {
        // lightningcss unavailable: ship unminified
      }
    }
    const hash = new Bun.CryptoHasher('sha256').update(css).digest('hex').slice(0, 8);
    const name = 'page-' + (route || 'index').replace(/[^a-zA-Z0-9_-]/g, '_');
    const file = path.join(this.outDir(), 'assets', `${name}-${hash}.css`);
    await $`mkdir -p ${path.dirname(file)}`;
    await Bun.write(file, css);
    await this.compressFile(file, css);
    const size = Buffer.byteLength(css);
    this.ctx.output.stats.cssSize += size;
    return { url: `/assets/${path.basename(file)}`, size };
  }

  private async compressFile(filePath: string, content: string): Promise<void> {
    this.track(filePath);
    if (
      this.ctx.config.optimization.compress &&
      this.compressor.shouldCompress(Buffer.byteLength(content))
    ) {
      const compressed = this.compressor.compress(
        content,
        this.ctx.config.optimization.compress,
      );
      if (compressed.gzip) {
        await Bun.write(filePath + '.gz', compressed.gzip);
        this.track(filePath + '.gz');
      }
      if (compressed.brotli) {
        await Bun.write(filePath + '.br', compressed.brotli);
        this.track(filePath + '.br');
      }
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
    stylesheet?: { url: string; size: number },
  ): Promise<PageManifest> {
    // Only the document shell is minified. The server-rendered body is written
    // verbatim: whitespace / comments are part of the DOM that hydration walks.
    const minify = !!this.ctx.config.build.minify;
    const nl = minify ? '' : '\n';
    const head = [
      '<meta charset="UTF-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
      `<title>${this.escapeHTML(node.name)}</title>`,
      stylesheet ? `<link rel="stylesheet" href="${stylesheet.url}">` : '',
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
      css: stylesheet ? [stylesheet.url] : [],
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
    this.track(manifestPath);
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
export async function build(config: SokudoConfig): Promise<BuildResult> {
  const bundler = new SokudoBundler(config);
  return bundler.build();
}
