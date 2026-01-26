// ============================================================================
// FILE: src/bundler/bundler/minifier.ts
// Code minification wrapper
// ============================================================================

import { minify as terserMinify } from 'terser';

export class Minifier {
  async minify(code: string, isModule = true): Promise<string> {
    const result = await terserMinify(code, {
      module: isModule,
      compress: {
        passes: 3,
        pure_getters: true,
        unsafe: true,
        unsafe_math: true,
        unsafe_methods: true,
        drop_console: false,
        drop_debugger: true,
      },
      mangle: {
        toplevel: true,
        properties: false,
      },
      format: {
        comments: false,
        ecma: 2020,
      },
    });

    return result.code || code;
  }

  async minifyCSS(css: string): Promise<string> {
    // Simple CSS minification
    return css
      .replace(/\/\*[\s\S]*?\*\//g, '') // Remove comments
      .replace(/\s+/g, ' ') // Collapse whitespace
      .replace(/\s*([{}:;,])\s*/g, '$1') // Remove space around punctuation
      .trim();
  }

  async minifyHTML(html: string): Promise<string> {
    // Simple HTML minification
    return html
      .replace(/<!--[\s\S]*?-->/g, '') // Remove comments
      .replace(/\s+/g, ' ') // Collapse whitespace
      .replace(/>\s+</g, '><') // Remove space between tags
      .trim();
  }
}
