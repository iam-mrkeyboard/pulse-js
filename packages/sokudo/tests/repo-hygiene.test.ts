/** Regressions: editor tooling offers only primitives that exist; docs link to the real repo. */
import { test, expect } from 'bun:test';
import fs from 'node:fs';
import path from 'node:path';

const repo = path.resolve(import.meta.dir, '../../..');
const read = (rel: string) => fs.readFileSync(path.join(repo, rel), 'utf8');
const MISSING = ['Portal', 'Suspense', 'ErrorBoundary'];

test('VS Code extension completes / documents only implemented primitives', () => {
  const completion = read('packages/vscode-extension/server/src/completion.ts');
  const tags = completion.match(/const pulseTags = \[([^\]]*)\]/)![1];
  expect(tags.replace(/\s/g, '')).toBe("'Show','List'");
  const hover = read('packages/vscode-extension/server/src/hover.ts');
  const grammar = read('packages/vscode-extension/syntaxes/pulse.tmLanguage.json');
  for (const name of MISSING) {
    expect(completion).not.toContain(`'${name}'`);
    expect(hover).not.toContain(`${name}:`);
    expect(grammar).not.toContain(`|${name}|`);
  }
  // Both sources still parse.
  const t = new Bun.Transpiler({ loader: 'ts' });
  expect(() => t.transformSync(completion)).not.toThrow();
  expect(() => t.transformSync(hover)).not.toThrow();
  // The primitives it offers are the ones the runtime exports.
  expect(fs.existsSync(path.join(repo, 'packages/sokudo/src/runtime/primitives/show.ts'))).toBe(true);
  expect(fs.existsSync(path.join(repo, 'packages/sokudo/src/runtime/primitives/list.ts'))).toBe(true);
});

test('docs footer GitHub link points to the project repo', () => {
  const footer = read('apps/docs/src/components/Footer.pulse');
  expect(footer).toContain('href="https://github.com/iam-mrkeyboard/pulse-js"');
  expect(footer).not.toContain('pulse-framework/pulse');
});

test('docs do not document the nonexistent Portal primitive', () => {
  expect(read('apps/docs/src/pages/docs/primitives.pulse')).not.toContain('Portal');
});
