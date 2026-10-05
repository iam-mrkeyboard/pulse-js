/**
 * Regression: `bun run typecheck` must work on a fresh clone, before
 * build:sokudo has produced packages/sokudo/dist/*.d.ts. The app configs resolve
 * `sokudo` to the package sources, never to dist.
 */
import { test, expect } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

const repo = path.resolve(import.meta.dir, '../../..');
const tscBin = path.join(repo, 'node_modules/.bin/tsc');

test('tsconfig.apps.json (used by `bun run typecheck`) resolves sokudo to sources, not dist', () => {
  // Prefer the .bin shim (what `tsc -p …` uses in CI). Spawning the typescript
  // package entry via `bun <tsc.js>` can omit project root files from
  // --listFilesOnly on some runners.
  const cmd = fs.existsSync(tscBin)
    ? [tscBin, '-p', 'tsconfig.apps.json', '--listFilesOnly']
    : ['bun', path.join(repo, 'node_modules/typescript/bin/tsc'), '-p', 'tsconfig.apps.json', '--listFilesOnly'];
  const r = Bun.spawnSync(cmd, { cwd: repo, stdout: 'pipe', stderr: 'pipe' });
  const out = r.stdout.toString() + '\n' + r.stderr.toString();
  const files = out.split('\n').map((f) => f.trim()).filter(Boolean).map((f) => path.resolve(repo, f));
  expect(r.exitCode).toBe(0);
  const has = (suffix: string) => files.some((f) => f.replace(/\\/g, '/').endsWith(suffix));
  expect(has('apps/docs/sokudo.config.ts')).toBe(true);
  expect(has('examples/counter/sokudo.config.ts')).toBe(true);
  expect(has('packages/sokudo/src/index.ts')).toBe(true);
  expect(files.some((f) => /packages[\\/]sokudo[\\/]dist[\\/]/.test(f))).toBe(false);
}, 30000);

for (const project of ['apps/docs', 'examples/counter']) {
  test(`${project}/tsconfig.json maps sokudo to the package sources`, async () => {
    const cfg = await Bun.file(path.join(repo, project, 'tsconfig.json')).json();
    const target = cfg.compilerOptions.paths.sokudo[0];
    expect(path.resolve(repo, project, target)).toBe(path.join(repo, 'packages/sokudo/src/index.ts'));
  });
}
