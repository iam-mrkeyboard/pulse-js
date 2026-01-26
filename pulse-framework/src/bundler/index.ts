// ============================================================================
// FILE: src/bundler/index.ts - FULLY INTEGRATED
// Main bundler orchestrator - combines all phases
// ============================================================================

import path from 'node:path';
import { $, Glob } from 'bun';
// fs import removed
import { DependencyAnalyzer } from './analyzer/dependency-analyzer';
import { ComponentCompiler } from './compiler/component-compiler';
import { RuntimeBuilder } from './runtime/runtime-builder';
import { CodeSplitter } from './bundler/code-splitter';
import { Compressor } from './bundler/compressor';
import { EntryGenerator } from './bundler/entry-generator';
import { Minifier } from './bundler/minifier';
import type {
  PulseConfig,
  BuildResult,
  CompilationContext,
  PageManifest,
  IslandManifest,
} from './types';

export class PulseBundler {
  private ctx: CompilationContext;
  private codeSplitter: CodeSplitter;
  private compressor: Compressor;
  private entryGenerator: EntryGenerator;
  private minifier: Minifier;

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

    this.codeSplitter = new CodeSplitter();
    this.compressor = new Compressor();
    this.entryGenerator = new EntryGenerator();
    this.minifier = new Minifier();
  }

  async build(): Promise<BuildResult> {
    const startTime = Date.now();
    const errors: any[] = [];
    const warnings: any[] = [];

    try {
      console.log('⚡ Pulse v5.0 Build Started\n');

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

      // Phase 2: Code splitting
      console.log('\n✂️  Phase 2: Code splitting...');
      const bundles = this.codeSplitter.split(this.ctx.graph);
      console.log(`  ✓ Created ${bundles.size} bundles`);

      // Phase 3: Build runtime
      console.log('\n⚙️  Phase 3: Building runtime...');
      const runtimeBuilder = new RuntimeBuilder(this.ctx);
      const runtimes = await runtimeBuilder.buildRuntime(this.ctx.graph);

      // Save runtime files
      const runtimeDir = path.join(this.ctx.config.outDir, 'runtime');
      await $`mkdir -p ${runtimeDir}`;

      for (const [name, code] of runtimes) {
        // Minify runtime if enabled
        const finalCode = this.ctx.config.build.minify
          ? await this.minifier.minify(code)
          : code;

        const filePath = path.join(runtimeDir, `${name}.js`);
        await $`mkdir -p ${path.dirname(filePath)}`;
        await Bun.write(filePath, finalCode);

        // Compress if enabled
        if (
          this.ctx.config.optimization.compress &&
          this.compressor.shouldCompress(Buffer.byteLength(finalCode))
        ) {
          const compressed = this.compressor.compress(
            finalCode,
            this.ctx.config.optimization.compress,
          );

          if (compressed.gzip) {
            await Bun.write(filePath + '.gz', compressed.gzip);
          }
          if (compressed.brotli) {
            await Bun.write(filePath + '.br', compressed.brotli);
          }
        }

        if (name === 'core') {
          this.ctx.output.runtime.core = finalCode;
        } else {
          this.ctx.output.runtime.primitives.set(name, finalCode);
        }

        this.ctx.output.runtime.size += Buffer.byteLength(finalCode);
      }

      const sizes = await runtimeBuilder.estimateSizes();
      console.log(`  ✓ Core runtime: ${this.formatBytes(sizes.core)}`);
      console.log(`  ✓ List primitive: ${this.formatBytes(sizes.list)}`);
      console.log(`  ✓ Show primitive: ${this.formatBytes(sizes.show)}`);
      console.log(`  ✓ Portal primitive: ${this.formatBytes(sizes.portal)}`);
      console.log(`  ✓ Total runtime: ${this.formatBytes(sizes.total)}`);

      // Phase 4: Compile components
      console.log('\n🔧 Phase 4: Compiling components...');
      const compiler = new ComponentCompiler(this.ctx);

      // Compile islands
      const islands = analyzer.getIslands();
      for (const island of islands) {
        const result = await compiler.compile(island);

        // Minify island code
        const finalCode = this.ctx.config.build.minify
          ? await this.minifier.minify(result.code)
          : result.code;

        const manifest: IslandManifest = {
          id: island.id,
          path: `/islands/${island.id}.js`,
          code: finalCode,
          dependencies: result.dependencies,
          primitives: Array.from(island.primitives),
          size: Buffer.byteLength(finalCode),
          isPreloaded: false,
        };

        this.ctx.output.islands.set(island.id, manifest);

        // Write island file
        const islandPath = path.join(
          this.ctx.config.outDir,
          'islands',
          `${island.id}.js`,
        );
        await $`mkdir -p ${path.dirname(islandPath)}`;
        await Bun.write(islandPath, finalCode);

        // Compress island
        if (
          this.ctx.config.optimization.compress &&
          this.compressor.shouldCompress(manifest.size)
        ) {
          const compressed = this.compressor.compress(
            finalCode,
            this.ctx.config.optimization.compress,
          );

          if (compressed.gzip) {
            await Bun.write(islandPath + '.gz', compressed.gzip);
          }
          if (compressed.brotli) {
            await Bun.write(islandPath + '.br', compressed.brotli);
          }
        }

        console.log(`  ✓ ${island.name}: ${this.formatBytes(manifest.size)}`);
      }

      // Phase 5: Generate pages
      console.log('\n📄 Phase 5: Generating pages...');

      for (const entryPath of this.ctx.graph.entryPoints) {
        const node = this.ctx.graph.nodes.get(entryPath)!;
        const isStatic = this.ctx.graph.staticPages.has(entryPath);

        const pageManifest = await this.generatePage(node, isStatic);
        this.ctx.output.pages.set(node.id, pageManifest);

        const type = isStatic ? '📄 Static' : '🔵 Interactive';
        console.log(
          `  ✓ ${type} ${node.name}: ${this.formatBytes(pageManifest.size)}`,
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

  private async generatePage(
    node: any,
    isStatic: boolean,
  ): Promise<PageManifest> {
    // Collect islands for this page
    const pageIslands: IslandManifest[] = [];
    const deps = Array.from(node.dependencies) as string[];

    for (const dep of deps) {
      const depNode = this.ctx.graph.nodes.get(dep);
      if (depNode && this.ctx.graph.islands.has(dep)) {
        const islandManifest = this.ctx.output.islands.get(depNode.id);
        if (islandManifest) {
          pageIslands.push(islandManifest);
        }
      }
    }

    // Generate HTML using EntryGenerator
    const html = this.entryGenerator.generate(
      node,
      pageIslands,
      '/runtime/core.js',
      isStatic,
    );

    // Minify HTML if enabled
    const finalHTML = this.ctx.config.build.minify
      ? await this.minifier.minifyHTML(html)
      : html;

    // Write HTML file
    const pagePath = path.join(
      this.ctx.config.outDir,
      node.name === 'index' ? 'index.html' : `${node.name}/index.html`,
    );

    await $`mkdir -p ${path.dirname(pagePath)}`;
    await Bun.write(pagePath, finalHTML);

    // Compress HTML
    if (
      this.ctx.config.optimization.compress &&
      this.compressor.shouldCompress(Buffer.byteLength(finalHTML))
    ) {
      const compressed = this.compressor.compress(
        finalHTML,
        this.ctx.config.optimization.compress,
      );

      if (compressed.gzip) {
        await Bun.write(pagePath + '.gz', compressed.gzip);
      }
      if (compressed.brotli) {
        await Bun.write(pagePath + '.br', compressed.brotli);
      }
    }

    return {
      path: `/${node.name === 'index' ? '' : node.name}`,
      html: finalHTML,
      islands: pageIslands.map((i) => i.id),
      isStatic,
      preloads: isStatic
        ? []
        : ['/runtime/core.js', ...pageIslands.map((i) => i.path)],
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
      version: '5.0.0',
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

    const manifestPath = path.join(this.ctx.config.outDir, 'manifest.json');
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
    console.log(`✨ Output: ${this.ctx.config.outDir}`);
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
