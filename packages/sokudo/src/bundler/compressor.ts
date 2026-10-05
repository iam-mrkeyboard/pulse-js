// ============================================================================
// FILE: src/bundler/bundler/compressor.ts - FIXED
// Gzip and Brotli compression
// ============================================================================

import { gzipSync, brotliCompressSync, constants } from 'zlib';

export class Compressor {
  compress(
    content: string | Buffer,
    type: 'gzip' | 'brotli' | 'both' = 'both',
  ): {
    gzip?: Buffer;
    brotli?: Buffer;
  } {
    const buffer = typeof content === 'string' ? Buffer.from(content) : content;
    const result: { gzip?: Buffer; brotli?: Buffer } = {};

    if (type === 'gzip' || type === 'both') {
      result.gzip = gzipSync(buffer, { level: 9 });
    }

    if (type === 'brotli' || type === 'both') {
      result.brotli = brotliCompressSync(buffer, {
        params: {
          [constants.BROTLI_PARAM_QUALITY]: 11,
        },
      });
    }

    return result;
  }

  getCompressionRatio(original: number, compressed: number): number {
    return ((original - compressed) / original) * 100;
  }

  shouldCompress(size: number): boolean {
    // Only compress files larger than 1KB
    return size > 1024;
  }
}
