#!/usr/bin/env bun
/**
 * Minimal scaffolder for Sokudo apps.
 * Usage: bun create sokudo my-app
 *    or: bunx create-sokudo my-app
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const name = process.argv[2];
if (!name || name.startsWith('-')) {
  console.error('Usage: bun create sokudo <name>');
  process.exit(1);
}
if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
  console.error('App name must be letters, numbers, _ or -');
  process.exit(1);
}

const dest = path.resolve(process.cwd(), name);
if (fs.existsSync(dest)) {
  console.error(`Refusing to overwrite existing directory: ${dest}`);
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const template = path.join(root, 'templates', 'basic');

function copyDir(src, out) {
  fs.mkdirSync(out, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(out, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

copyDir(template, dest);
// Fill package.json name
const pkgPath = path.join(dest, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.name = name;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

console.log(`\n  Created ${name}/\n`);
console.log('  Next:\n');
console.log(`    cd ${name}`);
console.log('    bun install');
console.log('    bun run dev\n');
