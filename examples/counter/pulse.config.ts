import { createDefaultConfig } from 'pulse';

export default createDefaultConfig({
  root: process.cwd(),
  srcDir: './src',
  outDir: './dist',
  publicDir: './public',
  pages: { dir: './src/pages' },
  build: {
    minify: true,
    sourcemap: false,
    target: 'es2022',
    splitting: true,
    treeshake: true,
    islands: true,
    ssr: true,
  },
  devServer: { port: 3001, hmr: true, open: false },
});
