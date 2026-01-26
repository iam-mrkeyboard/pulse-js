// ============================================================================
// FILE: src/cli/commands/analyze.ts - FULLY FIXED
// ============================================================================

import path from 'node:path';
// fs import removed
import pc from 'picocolors';
import type { PulseConfig } from '../../bundler/types';

interface ManifestData {
  buildTime: string;
  version: string;
  stats: {
    totalSize: number;
    jsSize: number;
    htmlSize: number;
    cssSize: number;
    staticPages: number;
    interactivePages: number;
    islands: number;
    cacheableSize: number;
  };
  pages: Array<{ path: string; size: number }>;
  islands?: Array<{ id: string; size: number }>;
  cache: {
    hitRate: number;
  };
}

export async function analyzeCommand(config: PulseConfig): Promise<void> {
  console.log(pc.bold(pc.magenta('\n📊 Bundle Analysis\n')));

  const manifestPath = path.join(config.outDir, 'manifest.json');

  try {
    const manifestFile = await Bun.file(manifestPath).text();
    const manifest: ManifestData = JSON.parse(manifestFile);

    const formatBytes = (bytes: number): string => {
      if (bytes === 0) return '0 B';
      const k = 1024;
      const sizes = ['B', 'KB', 'MB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
    };

    console.log(
      pc.gray('  Build Time:   ') +
        pc.white(new Date(manifest.buildTime).toLocaleString()),
    );
    console.log(pc.gray('  Version:      ') + pc.white(manifest.version));
    console.log(
      pc.gray('  Total Size:   ') +
        pc.cyan(formatBytes(manifest.stats.totalSize)),
    );
    console.log(
      pc.gray('  JavaScript:   ') + pc.cyan(formatBytes(manifest.stats.jsSize)),
    );
    console.log(
      pc.gray('  HTML:         ') +
        pc.cyan(formatBytes(manifest.stats.htmlSize)),
    );
    console.log(
      pc.gray('  CSS:          ') +
        pc.cyan(formatBytes(manifest.stats.cssSize)),
    );
    console.log('');
    console.log(
      pc.gray('  Pages:        ') + pc.white(manifest.pages.length.toString()),
    );
    console.log(
      pc.gray('    Static:     ') +
        pc.green(manifest.stats.staticPages.toString()),
    );
    console.log(
      pc.gray('    Interactive:') +
        pc.blue(manifest.stats.interactivePages.toString()),
    );
    console.log('');
    console.log(
      pc.gray('  Islands:      ') + pc.white(manifest.stats.islands.toString()),
    );
    console.log(
      pc.gray('  Cacheable:    ') +
        pc.cyan(formatBytes(manifest.stats.cacheableSize)),
    );
    console.log(
      pc.gray('  Cache Rate:   ') +
        pc.green(`${(manifest.cache.hitRate * 100).toFixed(1)}%`),
    );
    console.log('');
  } catch (error: any) {
    console.error(pc.red('❌ No build found. Run "pulse build" first.'));
    process.exit(1);
  }
}
