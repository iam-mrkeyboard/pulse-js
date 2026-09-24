// ============================================================================
// FILE: src/bundler/compiler/unified-parser.ts
// Single, robust parser for all Pulse syntax
// ============================================================================

import * as acorn from 'acorn';
// @ts-ignore
import { transform } from 'lightningcss';
import { HTMLParser } from './html-parser';
import {
  type ComponentAST,
  type ScriptAST,
  type TemplateAST,
  type StylesAST,
  type ScriptParseResult,
  type Import,
  type Export,
  type Signal,
  type FunctionDef,
  type ComponentMetadata,
  type ComponentUsage,
  type Binding
} from '../types/ast';
import { ParseError, ForbiddenPatternError } from './errors';

// ----------------------------------------------------------------------------
// SCANNER (State Machine)
// ----------------------------------------------------------------------------

class Scanner {
  private pos = 0;
  private source: string;

  constructor(source: string) {
    this.source = source;
  }

  isEOF(): boolean {
    return this.pos >= this.source.length;
  }

  peek(): string {
    return this.source[this.pos];
  }

  advance(n = 1): void {
    this.pos += n;
  }

  match(pattern: string): boolean {
    return this.source.startsWith(pattern, this.pos);
  }

  scanUntil(delimiter: string): string | null {
    const start = this.pos;
    let index = this.source.indexOf(delimiter, this.pos);

    if (index === -1) return null;

    this.pos = index + delimiter.length;
    return this.source.slice(start, index);
  }

  scanToEnd(): string {
    const content = this.source.slice(this.pos);
    this.pos = this.source.length;
    return content;
  }

  reset() {
    this.pos = 0;
  }
}

type Sections = {
  script: string;
  template: string;
  styles: string;
};

// ----------------------------------------------------------------------------
// UNIFIED PARSER
// ----------------------------------------------------------------------------

export class UnifiedParser {
  private htmlParser = new HTMLParser();

  parse(source: string, filePath: string): ComponentAST {
    // Step 1: Split sections
    const sections = this.splitSections(source);

    // Step 2: Parse each section
    const script = this.parseScript(sections.script, filePath);
    const template = this.parseTemplate(sections.template, filePath);
    const styles = this.parseStyles(sections.styles, filePath);

    // Metadata
    const metadata: ComponentMetadata = {
      name: this.extractName(filePath),
      location: { file: filePath, source }
    };

    return {
      script,
      template,
      styles,
      metadata
    };
  }

  private extractName(filePath: string): string {
    const parts = filePath.split('/');
    const filename = parts[parts.length - 1];
    return filename.replace('.pulse', '');
  }

  private splitSections(source: string): Sections {
    const sections: Sections = {
      script: '',
      template: '',
      styles: ''
    };

    // Extract Script
    const scriptOpen = source.indexOf('<script');
    if (scriptOpen !== -1) {
      const scriptClose = source.indexOf('</script>', scriptOpen);
      if (scriptClose !== -1) {
        const tagEnd = source.indexOf('>', scriptOpen);
        if (tagEnd !== -1 && tagEnd < scriptClose) {
          sections.script = source.slice(tagEnd + 1, scriptClose);
        }
      }
    }

    // Extract Style
    const styleOpen = source.indexOf('<style');
    if (styleOpen !== -1) {
      const styleClose = source.indexOf('</style>', styleOpen);
      if (styleClose !== -1) {
        const tagEnd = source.indexOf('>', styleOpen);
        if (tagEnd !== -1 && tagEnd < styleClose) {
          sections.styles = source.slice(tagEnd + 1, styleClose);
        }
      }
    }

    // Template is everything ELSE.
    sections.template = source
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
      .trim();

    // Bare leading script (Counter.pulse style): JS before first markup tag when no <script>
    if (!sections.script.trim()) {
      const m = sections.template.match(/<[A-Za-z\/!]/);
      if (m && m.index && m.index > 0) {
        const preamble = sections.template.slice(0, m.index).trim();
        if (/\b(const|let|var|function|import|export)\b/.test(preamble)) {
          sections.script = preamble;
          sections.template = sections.template.slice(m.index).trim();
        }
      }
    }

    return sections;
  }

  private parseScript(code: string, filePath: string): ScriptAST {
    if (!code || !code.trim()) return { type: 'empty' };

    try {
      const ast = acorn.parse(code, {
        ecmaVersion: 'latest',
        sourceType: 'module',
        locations: true,
        ranges: true
      });

      const imports: Import[] = [];
      const exports: Export[] = [];
      const signals: Signal[] = [];
      const declarations: string[] = [];
      const functions: FunctionDef[] = [];

      (ast as any).body.forEach((node: any) => {
        if (node.type === 'VariableDeclaration') {
          node.declarations.forEach((decl: any) => {
            const isSignal = decl.init && decl.init.type === 'CallExpression' && decl.init.callee.name === 'createSignal';

            if (decl.id.type === 'Identifier') {
              declarations.push(decl.id.name);
              if (isSignal) {
                signals.push({
                  name: decl.id.name,
                  initialValue: { type: 'other', raw: 'unknown' },
                  setter: 'unknown',
                  type: { kind: 'unknown' },
                  usages: []
                });
              }
            } else if (decl.id.type === 'ArrayPattern') {
              decl.id.elements.forEach((el: any) => {
                if (el && el.type === 'Identifier') declarations.push(el.name);
              });

              if (isSignal && decl.id.elements.length > 0) {
                const first = decl.id.elements[0];
                if (first && first.type === 'Identifier') {
                  signals.push({
                    name: first.name,
                    initialValue: { type: 'other', raw: 'unknown' },
                    setter: 'unknown',
                    type: { kind: 'unknown' },
                    usages: []
                  });
                }
              }
            } else if (decl.id.type === 'ObjectPattern') {
              decl.id.properties.forEach((prop: any) => {
                if (prop.value.type === 'Identifier') declarations.push(prop.value.name);
              });
            }
          });
        }

        if (node.type === 'FunctionDeclaration') {
          if (node.id) {
            declarations.push(node.id.name);
            functions.push({ name: node.id.name, params: node.params.map((p: any) => p.name), isAsync: node.async });
          }
        }

        if (node.type === 'ClassDeclaration') {
          if (node.id) declarations.push(node.id.name);
        }

        if (node.type === 'ImportDeclaration') {
          const specifiers = node.specifiers.map((s: any) => ({
            imported: s.imported?.name || 'default',
            local: s.local.name
          }));
          imports.push({ source: node.source.value, specifiers, isTypeOnly: false });
          specifiers.forEach((s: any) => declarations.push(s.local));
        }
      });

      return {
        type: 'valid',
        ast,
        code,
        imports,
        exports,
        signals,
        effects: [],
        computed: [],
        functions,
        declarations
      };
    } catch (error: any) {
      throw new ParseError({
        original: error,
        source: { file: filePath }
      });
    }
  }

  private parseTemplate(code: string, filePath: string): TemplateAST {
    if (!code || !code.trim()) return { type: 'empty' };

    try {
      const ast = this.htmlParser.parse(code);

      const components: ComponentUsage[] = [];
      const bindings: Binding[] = [];

      const visit = (node: any) => {
        if (node.type === 'element') {
          if (node.tag && /^[A-Z]/.test(node.tag)) {
            components.push({ name: node.tag, props: {}, children: [] });
          }
          if (node.children) node.children.forEach(visit);
        }
      };
      if (ast.children) ast.children.forEach(visit);

      return {
        type: 'valid',
        ast,
        code,
        components,
        bindings,
        events: [],
        slots: []
      };
    } catch (error: any) {
      throw new ParseError({
        original: error,
        source: { file: filePath }
      });
    }
  }

  private parseStyles(code: string, filePath: string): StylesAST {
    if (!code || !code.trim()) return { type: 'empty' };

    try {
      transform({
        filename: filePath,
        code: Buffer.from(code),
        minify: false,
        sourceMap: false
      });

      return {
        type: 'valid',
        code,
        scoped: false,
        classes: []
      };
    } catch (error: any) {
      throw new ParseError({
        original: error,
        source: { file: filePath }
      });
    }
  }
}
