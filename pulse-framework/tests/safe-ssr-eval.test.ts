import { describe, test, expect } from 'bun:test';
import { evalSSR, interpolateSSR, safeEvalSSR } from '../src/server/template-transformer';
import { safeEval } from '../src/runtime/safe-eval';

describe('safe SSR eval (no Function constructor)', () => {
  test('member access and ternary', () => {
    expect(evalSSR('item.label', { id: 1, label: 'hi' }, 'item', {})).toBe('hi');
    expect(evalSSR('item.done ? "yes" : "no"', { done: true }, 'item', {})).toBe('yes');
  });

  test('interpolate template', () => {
    expect(interpolateSSR('Hello {item.name}', { name: 'Pulse' }, 'item')).toBe('Hello Pulse');
  });

  test('blocks dangerous expressions', () => {
    expect(safeEval('Function("return 1")()', {})).toBe('');
    expect(safeEvalSSR('eval("1")', {})).toBe('');
    expect(safeEval('process.env.x', { process: { env: { x: 1 } } })).toBe('');
  });

  test('template-transformer has no new Function(', async () => {
    const tf = await Bun.file(new URL('../src/server/template-transformer.ts', import.meta.url)).text();
    expect(/new\s+Function\s*\(/.test(tf)).toBe(false);
  });
});
