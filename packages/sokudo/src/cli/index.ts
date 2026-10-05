#!/usr/bin/env bun
//cli/index
import { parseArgs } from 'util';
import path from 'node:path';
import type { SokudoConfig } from '../bundler/types';
import { createDefaultConfig } from '../bundler/types';
import pc from 'picocolors';
import { VERSION } from '../version';

const SOKUDO_VERSION = VERSION;

async function main() {
  const { values, positionals } = parseArgs({
    args: Bun.argv.slice(2),
    options: {
      config: { type: 'string', short: 'c' },
      port: { type: 'string', short: 'p' },
      debug: { type: 'boolean', short: 'd' },
      minify: { type: 'boolean', short: 'm' },
      'no-minify': { type: 'boolean' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
    allowPositionals: true,
  });

  const command = positionals[0] || 'help';

  if (values.version) {
    console.log(`Sokudo v${SOKUDO_VERSION}`);
    return;
  }

  if (values.help || command === 'help') {
    printHelp();
    return;
  }

  // Load config with proper defaults
  const config = await loadConfig(values.config);

  // Apply CLI overrides safely
  if (values.port) {
    config.devServer.port = parseInt(values.port);
  }

  if (values.debug !== undefined) {
    config.debug = values.debug;
  }

  if (values['no-minify']) {
    config.build.minify = false;
  } else if (values.minify !== undefined) {
    config.build.minify = values.minify;
  }

  // Execute command
  switch (command) {
    case 'dev':
      const { devCommand } = await import('./dev');
      await devCommand(config);
      break;

    case 'build':
      const { buildCommand } = await import('./build');
      await buildCommand(config);
      break;

    case 'preview':
      const { previewCommand } = await import('./preview');
      await previewCommand(config);
      break;

    case 'analyze':
      const { analyzeCommand } = await import('./analyze');
      await analyzeCommand(config);
      break;

    case 'clean':
      await cleanCommand(config);
      break;

    default:
      console.error(pc.red(`Unknown command: ${command}`));
      console.log('Run "sokudo help" for usage information');
      process.exit(1);
  }
}

async function loadConfig(configPath?: string): Promise<SokudoConfig> {
  const defaultPath = path.resolve(process.cwd(), 'sokudo.config.ts');
  const finalPath = configPath
    ? path.resolve(process.cwd(), configPath)
    : defaultPath;

  try {
    const module = await import(finalPath);
    const userConfig = module.default;

    // Merge with defaults
    return createDefaultConfig(userConfig);
  } catch (error: any) {
    if (
      error.code === 'MODULE_NOT_FOUND' ||
      error.message?.includes('Cannot find module')
    ) {
      console.log(pc.yellow('⚠️  No sokudo.config.ts found, using defaults'));
      return createDefaultConfig();
    }
    throw error;
  }
}

async function cleanCommand(config: SokudoConfig) {
  console.log(pc.cyan('Cleaning build artifacts...'));
  await Bun.$`rm -rf ${config.outDir}`;
  await Bun.$`rm -rf ${path.join(config.root, '.sokudo')}`;
  await Bun.$`rm -rf ${path.join(config.root, '.pulse')}`;
  console.log(pc.green('✓ Clean complete'));
}

function printHelp() {
  console.log(`
${pc.bold(pc.magenta(`⚡ Sokudo v${SOKUDO_VERSION}`))} - The Fastest Web Framework

${pc.bold('USAGE:')}
  sokudo <command> [options]

${pc.bold('COMMANDS:')}
  ${pc.cyan('dev')}              Start development server with HMR
  ${pc.cyan('build')}            Build for production
  ${pc.cyan('preview')}          Preview production build
  ${pc.cyan('analyze')}          Analyze bundle size
  ${pc.cyan('clean')}            Clean build directory
  ${pc.cyan('help')}             Show help message

${pc.bold('OPTIONS:')}
  ${pc.cyan('-c, --config')}     Path to config file (default: sokudo.config.ts)
  ${pc.cyan('-p, --port')}       Development server port (default: 3000)
  ${pc.cyan('-d, --debug')}      Enable debug mode
  ${pc.cyan('-m, --minify')}     Enable minification (default: true)
  ${pc.cyan('-h, --help')}       Show help
  ${pc.cyan('-v, --version')}    Show version

${pc.bold('EXAMPLES:')}
  sokudo dev                    ${pc.gray('# Start dev server')}
  sokudo build                  ${pc.gray('# Build for production')}
  sokudo build --no-minify      ${pc.gray('# Build without minification')}
  sokudo preview -p 8080        ${pc.gray('# Preview on port 8080')}
  sokudo analyze                ${pc.gray('# Analyze bundle size')}

${pc.bold('DOCUMENTATION:')}
  ${pc.blue('https://github.com/iam-mrkeyboard/pulse-js#readme')}
`);
}

main().catch((error) => {
  console.error(pc.red('Fatal error:'), error.message);
  if (error.stack) {
    console.error(pc.gray(error.stack));
  }
  process.exit(1);
});
