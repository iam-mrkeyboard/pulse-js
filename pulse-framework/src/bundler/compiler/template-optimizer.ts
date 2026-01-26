// ============================================================================
// FILE: src/bundler/compiler/template-optimizer.ts
// Extracts and optimizes static HTML templates
// ============================================================================

export class TemplateOptimizer {
  optimize(html: string): { static: string; dynamic: any[] } {
    // Extract fully static sections
    const staticParts: string[] = [];
    const dynamicParts: any[] = [];

    // Split by expressions
    const parts = this.splitByExpressions(html);

    for (const part of parts) {
      if (part.type === 'static') {
        staticParts.push(part.content);
      } else {
        dynamicParts.push(part);
      }
    }

    return {
      static: this.consolidateStatic(staticParts),
      dynamic: dynamicParts,
    };
  }

  private splitByExpressions(
    html: string,
  ): Array<{ type: 'static' | 'dynamic'; content: string }> {
    const parts: Array<{ type: 'static' | 'dynamic'; content: string }> = [];
    let current = '';
    let inExpression = false;
    let braceCount = 0;

    for (let i = 0; i < html.length; i++) {
      const char = html[i];

      if (char === '{' && !inExpression) {
        if (current) {
          parts.push({ type: 'static', content: current });
          current = '';
        }
        inExpression = true;
        braceCount = 1;
        current = char;
      } else if (char === '{' && inExpression) {
        braceCount++;
        current += char;
      } else if (char === '}' && inExpression) {
        braceCount--;
        current += char;
        if (braceCount === 0) {
          parts.push({ type: 'dynamic', content: current });
          current = '';
          inExpression = false;
        }
      } else {
        current += char;
      }
    }

    if (current) {
      parts.push({
        type: inExpression ? 'dynamic' : 'static',
        content: current,
      });
    }

    return parts;
  }

  private consolidateStatic(parts: string[]): string {
    return parts.join('').trim();
  }

  canUseTemplateCloning(html: string): boolean {
    // Can use template cloning if static HTML is significant
    const staticLength = html.replace(/\{[^}]+\}/g, '').length;
    return staticLength > 50; // More than 50 chars of static HTML
  }
}
