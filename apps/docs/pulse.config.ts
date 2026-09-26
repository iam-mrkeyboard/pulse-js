// Pulse config for the docs site (apps/docs).
import type { PulseConfig } from 'pulse';
import { createDefaultConfig } from 'pulse';

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
