/**
 * Emit browser ESM runtime files to dist/runtime.
 * The package `./runtime` export used to point at a missing/empty file.
 */
import path from 'node:path';

const root = path.resolve(import.meta.dir, '..');

const entries: Array<[string, string]> = [
  ['src/runtime/core.ts', 'dist/runtime'],
  ['src/runtime/dom.ts', 'dist/runtime'],
  ['src/runtime/hydration.ts', 'dist/runtime'],
  ['src/runtime/ssr-markers.ts', 'dist/runtime'],
  ['src/runtime/error-boundary.ts', 'dist/runtime'],
  ['src/runtime/primitives/list.ts', 'dist/runtime/primitives'],
  ['src/runtime/primitives/show.ts', 'dist/runtime/primitives'],
];

let failed = false;
for (const [input, outdir] of entries) {
  const result = await Bun.build({
    entrypoints: [path.join(root, input)],
    outdir: path.join(root, outdir),
    target: 'browser',
    format: 'esm',
    minify: true,
    naming: '[name].js',
  });
  if (!result.success) {
    failed = true;
    console.error(result.logs);
  } else {
    const outs = result.outputs.map((o) => path.relative(root, o.path)).join(', ');
    console.log(`runtime: ${outs}`);
  }
}

if (failed) process.exit(1);
