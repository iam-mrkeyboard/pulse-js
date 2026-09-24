import { describe, test, expect } from 'bun:test';
import { RuntimeBuilder } from '../src/runtime/runtime-builder';

describe('RuntimeBuilder', () => {
  test('emits a non-empty production core and list runtime', async () => {
    const builder = new RuntimeBuilder({
      config: { build: { minify: false } },
    } as any);
    const sizes = await builder.estimateSizes();
    expect(sizes.core).toBeGreaterThan(200);
    expect(sizes.list).toBeGreaterThan(200);
    expect(sizes.show).toBeGreaterThan(50);
  });
});
