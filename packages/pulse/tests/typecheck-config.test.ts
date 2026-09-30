/**
 * Regression: `bun run typecheck` must work on a fresh clone, before
 * build:pulse has produced packages/pulse/dist/*.d.ts. The app configs resolve
 * `pulse` to the package sources, never to dist.
 */
import { test, expect } from 'bun:test';
import path from 'node:path';

const repo = path.resolve(import.meta.dir, '../../..');
const tsc = path.join(repo, 'node_modules/typescript/bin/tsc');

test('tsconfig.apps.json (used by `bun run typecheck`) resolves pulse to sources, not dist', () => {
  const r = Bun.spawnSync(['bun', tsc, '-p', path.join(repo, 'tsconfig.apps.json'), '--listFilesOnly'], { cwd: repo });
  const files = r.stdout.toString().split('\n').map((f) => f.trim()).filter(Boolean).map((f) => path.resolve(repo, f));
  expect(r.exitCode).toBe(0);
  expect(files).toContain(path.join(repo, 'apps/docs/pulse.config.ts'));
  expect(files).toContain(path.join(repo, 'examples/counter/pulse.config.ts'));
  expect(files).toContain(path.join(repo, 'packages/pulse/src/index.ts'));
  expect(files.some((f) => f.includes(`${path.sep}packages${path.sep}pulse${path.sep}dist${path.sep}`))).toBe(false);
}, 30000);

for (const project of ['apps/docs', 'examples/counter']) {
  test(`${project}/tsconfig.json maps pulse to the package sources`, async () => {
    const cfg = await Bun.file(path.join(repo, project, 'tsconfig.json')).json();
    const target = cfg.compilerOptions.paths.pulse[0];
    expect(path.resolve(repo, project, target)).toBe(path.join(repo, 'packages/pulse/src/index.ts'));
  });
}
