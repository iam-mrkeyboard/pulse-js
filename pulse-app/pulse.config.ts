// ============================================================================
// FILE: ~/Desktop/my-pulse-app/pulse.config.ts
// ============================================================================

import type { PulseConfig } from 'pulse-framework';
import { createDefaultConfig } from 'pulse-framework';

const config: PulseConfig = createDefaultConfig({
  root: process.cwd(),
  srcDir: './src',
  outDir: './dist',
  publicDir: './public',

  pages: {
    dir: './src/pages',
  },

  build: {
    minify: true,
    sourcemap: true,
    target: 'es2022',
    splitting: true,
    treeshake: true,
    islands: true,
    ssr: true,
  },

  devServer: {
    port: 3000,
    hmr: true,
    open: false,
  },

  debug: true, // Enable for testing
});

export default config;
