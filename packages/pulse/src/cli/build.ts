// ============================================================================
// FILE: src/cli/commands/build.ts - WITH LOGGER INTEGRATION
// ============================================================================

import pc from 'picocolors';
import type { PulseConfig } from '../bundler/types';
import { build as runBuild } from '../bundler/index';
import { Logger } from './logger';
import { Spinner } from './spinner';

export async function buildCommand(config: PulseConfig): Promise<void> {
  Logger.header('⚡ Pulse v0.16.0 Production Build');

  const spinner = new Spinner('Building...');
  spinner.start();

  const startTime = Date.now();

  try {
    const result = await runBuild(config);

    spinner.stop();

    if (!result.success) {
      Logger.error('Build failed with errors:');
      result.errors.forEach((err) => {
        console.error(pc.red(`  ${err.file}: ${err.message}`));
        if (err.stack && config.debug) {
          console.error(pc.gray(`  ${err.stack}`));
        }
      });
      process.exit(1);
    }

    if (result.warnings.length > 0) {
      Logger.warn(`Build completed with ${result.warnings.length} warnings:`);
      result.warnings.forEach((warn) => {
        console.warn(pc.yellow(`  ${warn.file}: ${warn.message}`));
        if (warn.suggestion) {
          console.warn(pc.gray(`    💡 ${warn.suggestion}`));
        }
      });
    }

    const duration = Date.now() - startTime;
    Logger.success(`Build completed in ${Logger.formatDuration(duration)}`);

    // Show build stats
    if (result.manifest.stats) {
      console.log('');
      Logger.table({
        'Total Size': Logger.formatBytes(result.manifest.stats.totalSize),
        JavaScript: Logger.formatBytes(result.manifest.stats.jsSize),
        HTML: Logger.formatBytes(result.manifest.stats.htmlSize),
        CSS: Logger.formatBytes(result.manifest.stats.cssSize),
        Pages:
          result.manifest.stats.staticPages +
          result.manifest.stats.interactivePages,
        Islands: result.manifest.stats.islands,
      });
    }
  } catch (error: any) {
    spinner.fail('Build crashed');
    Logger.error(error.message);
    if (config.debug && error.stack) {
      console.error(pc.gray(error.stack));
    }
    process.exit(1);
  }
}
