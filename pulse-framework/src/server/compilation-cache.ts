// ============================================================================
// FILE: src/server/compilation-cache.ts - NEW FILE
// Smart compilation cache with invalidation
// ============================================================================

import { createHash } from 'crypto';

export interface CacheEntry {
  hash: string;
  compiled: string;
  timestamp: number;
  dependencies: string[];
  size: number;
}

export class CompilationCache {
  private cache = new Map<string, CacheEntry>();
  private hits = 0;
  private misses = 0;

  get(file: string, currentHash: string): string | null {
    const entry = this.cache.get(file);

    if (!entry) {
      this.misses++;
      return null;
    }

    if (entry.hash !== currentHash) {
      this.misses++;
      this.cache.delete(file);
      return null;
    }

    this.hits++;
    return entry.compiled;
  }

  set(
    file: string,
    hash: string,
    compiled: string,
    dependencies: string[],
  ): void {
    this.cache.set(file, {
      hash,
      compiled,
      timestamp: Date.now(),
      dependencies,
      size: Buffer.byteLength(compiled),
    });
  }

  invalidate(file: string): void {
    this.cache.delete(file);
  }

  invalidateAll(): void {
    this.cache.clear();
    this.hits = 0;
    this.misses = 0;
  }

  getStats(): {
    hits: number;
    misses: number;
    hitRate: number;
    size: number;
    entries: number;
  } {
    const totalSize = Array.from(this.cache.values()).reduce(
      (sum, entry) => sum + entry.size,
      0,
    );

    const total = this.hits + this.misses;
    const hitRate = total > 0 ? this.hits / total : 0;

    return {
      hits: this.hits,
      misses: this.misses,
      hitRate,
      size: totalSize,
      entries: this.cache.size,
    };
  }

  computeHash(content: string): string {
    return createHash('sha256').update(content).digest('hex').slice(0, 16);
  }
}
