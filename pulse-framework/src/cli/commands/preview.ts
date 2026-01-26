// ============================================================================
// FILE: src/cli/commands/preview.ts
// Preview production build locally
// ============================================================================

import path from 'path';
import pc from 'picocolors';
import type { PulseConfig } from '../../bundler/types';

export async function previewCommand(config: PulseConfig): Promise<void> {
  console.log(pc.bold(pc.magenta('\n📦 Pulse Production Preview\n')));

  const outDir = path.resolve(config.outDir);
  const port = config.devServer.port || 3000;

  // Check if build exists
  try {
    const manifestPath = path.join(outDir, 'manifest.json');
    const manifestFile = Bun.file(manifestPath);

    if (!(await manifestFile.exists())) {
      console.error(pc.red('❌ No build found. Run "pulse build" first.'));
      process.exit(1);
    }
  } catch (error) {
    console.error(pc.red('❌ Error reading build directory'));
    process.exit(1);
  }

  // Start preview server
  const server = Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);
      let filePath = url.pathname;

      // Default to index.html for root
      if (filePath === '/') {
        filePath = '/index.html';
      }

      // Try to serve file from build directory
      try {
        const fullPath = path.join(outDir, filePath);
        const file = Bun.file(fullPath);

        if (await file.exists()) {
          // Check for pre-compressed versions
          if (req.headers.get('accept-encoding')?.includes('br')) {
            const brFile = Bun.file(fullPath + '.br');
            if (await brFile.exists()) {
              return new Response(brFile, {
                headers: {
                  'Content-Encoding': 'br',
                  'Content-Type': getContentType(filePath),
                },
              });
            }
          }

          if (req.headers.get('accept-encoding')?.includes('gzip')) {
            const gzFile = Bun.file(fullPath + '.gz');
            if (await gzFile.exists()) {
              return new Response(gzFile, {
                headers: {
                  'Content-Encoding': 'gzip',
                  'Content-Type': getContentType(filePath),
                },
              });
            }
          }

          return new Response(file, {
            headers: {
              'Content-Type': getContentType(filePath),
              'Cache-Control': 'public, max-age=31536000, immutable',
            },
          });
        }

        // Try HTML fallback for SPA routes
        if (!filePath.includes('.')) {
          const indexFile = Bun.file(path.join(outDir, filePath, 'index.html'));
          if (await indexFile.exists()) {
            return new Response(indexFile, {
              headers: { 'Content-Type': 'text/html' },
            });
          }
        }

        // 404
        return new Response('404 Not Found', { status: 404 });
      } catch (error: any) {
        console.error(pc.red('Error serving file:'), error.message);
        return new Response('Internal Server Error', { status: 500 });
      }
    },
  });

  console.log(pc.gray('  Local:    ') + pc.cyan(`http://localhost:${port}`));
  console.log(pc.gray('  Network:  ') + pc.cyan(`http://0.0.0.0:${port}`));
  console.log(pc.gray('  Serving:  ') + pc.white(outDir));
  console.log('\n' + pc.gray('Press Ctrl+C to stop\n'));
}

function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const types: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject',
  };

  return types[ext] || 'application/octet-stream';
}
