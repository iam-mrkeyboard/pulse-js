// pulse.config.ts
import { createDefaultConfig } from './src/bundler/types';

export default createDefaultConfig({
  root: process.cwd(),
  srcDir: './src',
  outDir: './dist',
  publicDir: './src/public',

  pages: {
    dir: './src/pages',
    defaultLayout: './src/layouts/BaseLayout.pulse',
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

  optimization: {
    inlineStyles: true,
    criticalCSS: true,
    prefetch: true,
    compress: 'both',
  },

  devServer: {
    port: 3000,
    hmr: true,
    open: false,
  },

  debug: false,
});
