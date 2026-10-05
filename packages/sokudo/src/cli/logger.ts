// ============================================================================
// FILE: src/cli/utils/logger.ts
// Colored console logging with formatting
// ============================================================================

import pc from 'picocolors';

export class Logger {
  static info(message: string) {
    console.log(pc.blue('ℹ'), message);
  }

  static success(message: string) {
    console.log(pc.green('✔'), message);
  }

  static warn(message: string) {
    console.log(pc.yellow('⚠'), message);
  }

  static error(message: string) {
    console.log(pc.red('✖'), message);
  }

  static debug(message: string) {
    console.log(pc.gray('🐛'), message);
  }

  static step(step: number, message: string) {
    console.log(pc.cyan(`[${step}]`), message);
  }

  static header(title: string) {
    const line = '━'.repeat(60);
    console.log('\n' + pc.bold(pc.magenta(line)));
    console.log(pc.bold(pc.magenta(title)));
    console.log(pc.bold(pc.magenta(line)) + '\n');
  }

  static table(data: Record<string, any>) {
    const maxKeyLength = Math.max(...Object.keys(data).map((k) => k.length));

    for (const [key, value] of Object.entries(data)) {
      const paddedKey = key.padEnd(maxKeyLength);
      console.log(`  ${pc.gray(paddedKey)}  ${pc.white(value)}`);
    }
  }

  static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }

  static formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  }

  static progressBar(current: number, total: number, width = 30): string {
    const percentage = current / total;
    const filled = Math.round(width * percentage);
    const empty = width - filled;

    const bar = pc.green('█'.repeat(filled)) + pc.gray('░'.repeat(empty));
    const percent = pc.bold(`${Math.round(percentage * 100)}%`);

    return `${bar} ${percent}`;
  }
}
