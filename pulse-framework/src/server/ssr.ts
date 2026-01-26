// ============================================================================
// FILE: src/server/ssr.ts - FIXED
// ============================================================================

export class SSRRenderer {
  render(component: Function, props: Record<string, any> = {}): string {
    try {
      // Check if component has SSR function
      if (
        '_ssr' in component &&
        typeof (component as any)._ssr === 'function'
      ) {
        return (component as any)._ssr(props);
      }

      // Try calling component directly
      const result = component(props);

      if (typeof result === 'string') {
        return result;
      }

      return String(result || '');
    } catch (error: any) {
      console.error('SSR Error:', error);
      return `<!-- SSR Error: ${error.message} -->`;
    }
  }

  renderToStream(
    component: Function,
    props: Record<string, any> = {},
  ): ReadableStream {
    const html = this.render(component, props);

    return new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(html));
        controller.close();
      },
    });
  }

  // Helper to wrap HTML with proper document structure
  wrapHTML(content: string, title = 'Pulse App'): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body>
  ${content}
</body>
</html>`;
  }
}
