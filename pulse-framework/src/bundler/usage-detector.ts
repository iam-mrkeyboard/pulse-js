// ============================================================================
// FILE: src/bundler/analyzer/usage-detector.ts
// AST-based Minifier and CSS Scoper (Regex-free)
// ============================================================================

import { minify as terserMinify, type MinifyOptions } from 'terser';
import { CSSParser, type CSSNode } from './compiler/css-parser';
import { HTMLParser, type ParsedNode } from './compiler/html-parser';

export class Minifier {
  private cssParser = new CSSParser();
  private htmlParser = new HTMLParser();

  async minify(code: string, isModule = true): Promise<string> {
    const options: MinifyOptions = {
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
    };

    try {
      const result = await terserMinify(code, options);
      return result.code || code;
    } catch (error) {
      console.warn('Minification failed, returning original code:', error);
      return code;
    }
  }

  async minifyCSS(css: string): Promise<string> {
    try {
      const { nodes } = this.cssParser.parse(css);
      return this.serializeCSS(nodes);
    } catch (e) {
      return css.trim().replace(/\s+/g, ' '); // Fallback only if AST fails? Or just return original?
    }
  }

  async minifyHTML(html: string): Promise<string> {
    try {
      const root = this.htmlParser.parse(html);
      return this.serializeHTML(root).trim();
    } catch (e) {
      return html.trim();
    }
  }

  private serializeCSS(nodes: CSSNode[]): string {
    return nodes.map(node => {
      if (node.type === 'at-rule') {
        const children = node.children.length > 0 ? `{${this.serializeCSS(node.children as CSSNode[])}}` : ';';
        return `${node.name}${node.params ? ' ' + node.params : ''}${children}`;
      } else {
        const selectors = node.selectors.map((s: string) => s.trim()).join(',');
        const decls = node.declarations.split(';').map((d: string) => d.trim()).filter((d: string) => d).join(';');
        return `${selectors}{${decls}}`;
      }
    }).join('');
  }

  private serializeHTML(node: ParsedNode): string {
    if (node.type === 'text') {
      return (node.content || '').replace(/\s+/g, ' ');
    }
    if (node.type === 'comment') {
      return ''; // Remove comments
    }
    if (node.type === 'expression') {
      return `{${node.content}}`;
    }
    if (node.type === 'element') {
      if (node.tag === 'root') {
        return (node.children || []).map((c: ParsedNode) => this.serializeHTML(c)).join('');
      }

      let attrs = '';
      if (node.attributes) {
        for (const [key, val] of node.attributes) {
          if (typeof val === 'string') {
            attrs += ` ${key}="${val}"`;
          } else {
            // expression attribute
            attrs += ` ${key}={${val.code}}`;
          }
        }
      }

      const children = (node.children || []).map((c: ParsedNode) => this.serializeHTML(c)).join('');

      const voidElements = new Set(['img', 'br', 'hr', 'input', 'meta', 'link']);
      if (voidElements.has(node.tag?.toLowerCase() || '')) {
        return `<${node.tag}${attrs}/>`;
      }

      return `<${node.tag}${attrs}>${children}</${node.tag}>`;
    }
    return '';
  }
}

export class CSSScoper {
  private parser: CSSParser;
  private htmlParser: HTMLParser;

  constructor() {
    this.parser = new CSSParser();
    this.htmlParser = new HTMLParser();
  }

  scope(css: string, componentHash: string, template: string): string {
    const { nodes } = this.parser.parse(css);
    // Use true AST based class extraction
    const usedClasses = this.extractClassNames(template);
    const processedNodes = this.processNodes(nodes, componentHash, usedClasses);
    return this.serializeNodes(processedNodes);
  }

  private processNodes(
    nodes: CSSNode[],
    hash: string,
    usedClasses: Set<string>
  ): CSSNode[] {
    const result: CSSNode[] = [];

    for (const node of nodes) {
      if (node.type === 'at-rule') {
        if (node.name === '@keyframes') {
          result.push(node);
        } else if (node.children.length > 0) {
          const children = this.processNodes(node.children as CSSNode[], hash, usedClasses);
          if (children.length > 0) {
            result.push({ ...node, children });
          }
        } else {
          result.push(node);
        }
      } else if (node.type === 'rule') {
        const scopedSelectors = node.selectors.map((sel: string) => this.scopeSelector(sel, hash)).filter((s: string | null) => s) as string[];
        if (scopedSelectors.length > 0) {
          // Tree shaked check
          // Simple AST check: if selector has class, must be in usedClasses
          const classes = this.getClassesFromSelector(node.selectors.join(','));
          if (classes.length === 0 || classes.some(c => usedClasses.has(c))) {
            result.push({ ...node, selectors: scopedSelectors });
          }
        }
      }
    }
    return result;
  }

  private scopeSelector(selector: string, hash: string): string {
    if (selector.startsWith(':global')) {
      return selector.replace(/:global\(([^)]+)\)/g, '$1').replace(/:global/g, '');
    }
    if (selector === 'html' || selector === 'body' || selector.startsWith(':root')) {
      return selector;
    }
    if (selector.includes(hash)) return selector;
    return `.${hash} ${selector}`;
  }

  private getClassesFromSelector(selector: string): string[] {
    // Basic parser for selector to extract class names
    // Technically regex here is strictly for SELECTOR syntax, not source code parsing.
    // But we can do simple char scan
    const classes: string[] = [];
    let i = 0;
    while (i < selector.length) {
      if (selector[i] === '.') {
        i++;
        let cls = '';
        while (i < selector.length && /[a-zA-Z0-9_-]/.test(selector[i])) {
          cls += selector[i];
          i++;
        }
        if (cls) classes.push(cls);
      } else {
        i++;
      }
    }
    return classes;
  }

  private serializeNodes(nodes: CSSNode[]): string {
    return nodes.map(node => {
      if (node.type === 'at-rule') {
        const children = node.children.length > 0 ? ` { ${this.serializeNodes(node.children as CSSNode[])} }` : ';';
        return `${node.name}${node.params ? ' ' + node.params : ''}${children}`;
      } else {
        return `${node.selectors.join(', ')} { ${node.declarations} }`;
      }
    }).join('\n');
  }

  extractClassNames(html: string): Set<string> {
    const classes = new Set<string>();
    const root = this.htmlParser.parse(html);

    const visit = (node: ParsedNode) => {
      if (node.attributes) {
        const cls = node.attributes.get('class') || node.attributes.get('className');
        if (typeof cls === 'string' && cls) {
          cls.split(/\s+/).forEach(c => {
            if (c) classes.add(c);
          });
        }
      }
      if (node.children) {
        node.children.forEach(visit);
      }
    };

    visit(root);
    return classes;
  }
}
