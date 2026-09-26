// ============================================================================
// FILE: src/bundler/bundler/entry-generator.ts
// Generates HTML entry points for pages
// ============================================================================

import type { ComponentNode, IslandManifest } from './types';

export class EntryGenerator {
  generate(
    page: ComponentNode,
    islands: IslandManifest[],
    runtimePath: string,
    isStatic: boolean,
  ): string {
    if (isStatic) {
      return this.generateStaticPage(page);
    }

    return this.generateInteractivePage(page, islands, runtimePath);
  }

  private generateStaticPage(page: ComponentNode): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${page.name}</title>
  ${page.styles ? `<style>${page.styles}</style>` : ''}
</head>
<body>
  <!-- Static SSR content -->
  ${page.template?.staticHTML || ''}
</body>
</html>`;
  }

  private generateInteractivePage(
    page: ComponentNode,
    islands: IslandManifest[],
    runtimePath: string,
  ): string {
    const preloads = this.generatePreloads(islands, runtimePath);
    const islandScripts = this.generateIslandScripts(islands);

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${page.name}</title>
  ${preloads}
  ${page.styles ? `<style>${page.styles}</style>` : ''}
</head>
<body>
  <!-- SSR content with islands -->
  ${page.template?.staticHTML || ''}
  
  ${islandScripts}
</body>
</html>`;
  }

  private generatePreloads(
    islands: IslandManifest[],
    runtimePath: string,
  ): string {
    const preloads = [
      `<link rel="modulepreload" href="${runtimePath}">`,
      ...islands
        .filter((i) => i.isPreloaded)
        .map((i) => `<link rel="modulepreload" href="${i.path}">`),
    ];

    return preloads.join('\n  ');
  }

  private generateIslandScripts(islands: IslandManifest[]): string {
    return islands
      .map(
        (island) => `
  <div id="${island.id}" data-island="${island.id}"></div>
  <script type="module">
    import { hydrate } from '/runtime/core.js';
    import ${island.id} from '${island.path}';
    hydrate('#${island.id}', ${island.id});
  </script>
`,
      )
      .join('');
  }
}
