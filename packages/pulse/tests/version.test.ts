import { test, expect } from 'bun:test';
import pkg from '../package.json';
import { VERSION } from '../src/version';
import { VERSION as exported } from '../src/index';

test('VERSION matches package.json (CLI, dev server, manifest and HMR client all use it)', () => {
  expect(VERSION).toBe(pkg.version);
  expect(exported).toBe(pkg.version);
});
