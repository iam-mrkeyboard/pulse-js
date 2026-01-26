import { PulseParser, ParsedNode } from './parser';
import { Hover, MarkupKind } from 'vscode-languageserver/node';
import * as path from 'path';
import * as fs from 'fs';
import { URI } from 'vscode-uri';

export class PulseHoverProvider {
  private parser: PulseParser;

  constructor() {
    this.parser = new PulseParser();
  }

  public getHover(text: string, offset: number, documentUri: string): Hover | null {
    const tree = this.parser.getTree(text);
    if (!tree) return null;

    const node = this.parser.findNodeAtOffset(tree, offset);
    if (!node) return null;

    if (node.type === 'element') {
      if (offset <= node.range.start + (node.tag?.length || 0) + 1) {
        // Component Hover
        if (node.tag && /^[A-Z]/.test(node.tag)) {
          const componentPath = this.resolveComponentPath(text, node.tag, documentUri);
          if (componentPath) {
            return {
              contents: {
                kind: MarkupKind.Markdown,
                value: `**Component: ${node.tag}**\n\nDefined in: \`${componentPath}\``
              }
            };
          }
          // Fallback if not found (maybe global or not imported)
          return this.getTagHover(node.tag);
        }
        return this.getTagHover(node.tag || '');
      }

      // Hovering Attribute
      if (node.attributes) {
        for (const [name, attr] of node.attributes) {
          if (offset >= attr.nameRange.start && offset <= attr.nameRange.end) {
            return this.getAttributeHover(name, node.tag || '');
          }
        }
      }
    }

    if (node.type === 'expression') {
      // Check for state usage
      const content = text.slice(node.range.start, node.range.end);
      const match = /\bstate\.(\w+)\b/.exec(content);
      if (match) {
        return {
          contents: {
            kind: MarkupKind.Markdown,
            value: `**Pulse State**\n\n\`${match[1]}\`: Reactive variable.`
          }
        };
      }
    }

    return null;
  }

  private resolveComponentPath(text: string, tagName: string, currentUri: string): string | null {
    const imports = this.parser.extractImports(text);
    for (const imp of imports) {
      if (path.basename(imp.source, '.pulse') === tagName) {
        const resolved = this.resolvePath(currentUri, imp.source);
        if (resolved) {
          // Return relative path for display or absolute?
          // Let's return workspace relative or just filename for now.
          return imp.source;
        }
      }
    }
    return null;
  }

  private resolvePath(currentUri: string, importPath: string): string | null {
    const currentPath = URI.parse(currentUri).fsPath;
    const dir = path.dirname(currentPath);
    const targetPath = path.resolve(dir, importPath);

    if (fs.existsSync(targetPath)) return targetPath;
    if (fs.existsSync(targetPath + '.pulse')) return targetPath + '.pulse';
    return null;
  }

  private getTagHover(tagName: string): Hover | null {
    const descriptions: Record<string, string> = {
      'div': 'Generic container element.',
      'span': 'Inline container element.',
      'button': 'Clickable button element.',
      'input': 'Input control.',
      'Show': '**Pulse Primitive**: Conditionally renders content based on `when` prop.',
      'List': '**Pulse Primitive**: Renders a list of items from `each` prop.',
      'slot': '**Pulse Primitive**: Placeholder for content injection.'
    };

    if (descriptions[tagName]) {
      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: `**${tagName}**\n\n${descriptions[tagName]}`
        }
      };
    }
    return null;
  }

  private getAttributeHover(attrName: string, tagName: string): Hover | null {
    const common: Record<string, string> = {
      'class': 'CSS class name(s).',
      'id': 'Unique identifier.',
      'style': 'Inline CSS styles.',
      'onClick': 'Event handler for click events.',
      'when': 'Condition for `<Show>` component.',
      'each': 'Array to iterate over for `<List>` component.'
    };

    if (common[attrName]) {
      return {
        contents: {
          kind: MarkupKind.Markdown,
          value: `**${attrName}**\n\n${common[attrName]}`
        }
      };
    }
    return null;
  }
}
