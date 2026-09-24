// ============================================================================
// FILE: src/bundler/compiler/component-compiler.ts - CLEANED VERSION
// Svelte-style component compiler with template optimization - INTEGRATED
// ============================================================================

import type {
  ComponentNode,
  TemplateNode,
  TransformResult,
  CompilationContext,
} from '../types';
import { CodeGenerator } from './code-generator';
import { TemplateOptimizer } from './template-optimizer';
import { CSSScoper } from './css-scoper';
import { HTMLParser } from './html-parser';
import { ReactivityTransformer } from './reactivity-transformer';
import { ComponentCompiler as SharedSfcCompiler } from '../../compiler';
import { ScriptParser } from '../../server/script-parser';
import { TemplateTransformer } from '../../server/compiler/template-transformer';
import type { PulseConfig } from '../types';

export class ComponentCompiler {
  private codeGenerator: CodeGenerator;
  private templateOptimizer: TemplateOptimizer;
  private cssScoper: CSSScoper;
  private htmlParser: HTMLParser;
  private reactivityTransformer: ReactivityTransformer;

  constructor(private ctx: CompilationContext) {
    this.codeGenerator = new CodeGenerator();
    this.codeGenerator.setContext(ctx);
    this.templateOptimizer = new TemplateOptimizer();
    this.cssScoper = new CSSScoper();
    this.htmlParser = new HTMLParser();
    this.reactivityTransformer = new ReactivityTransformer();
  }

  async compile(node: ComponentNode): Promise<TransformResult> {
    // Check cache first
    const cached = this.ctx.cache.components.get(node.path);
    if (cached && cached.hash === node.hash) {
      this.ctx.cache.hits++;
      return {
        code: cached.compiled,
        dependencies: Array.from(node.dependencies),
        sideEffects: !node.isStatic,
      };
    }

    this.ctx.cache.misses++;

    // Read source file
    const content = await Bun.file(node.path).text();

    // If fully static, just return SSR HTML
    if (node.isStatic && node.primitives.size === 0) {
      return this.compileStatic(node, content);
    }

    // Compile interactive component
    return this.compileInteractive(node, content);
  }

  private async compileStatic(
    node: ComponentNode,
    content: string,
  ): Promise<TransformResult> {
    // Extract template
    const templateStart = content.search(/^\s*<[a-zA-Z>/]/m);
    const template =
      templateStart !== -1 ? content.substring(templateStart).trim() : '';

    // Process CSS if exists
    let processedCSS = '';
    if (node.styles) {
      processedCSS = this.cssScoper.scope(node.styles, node.hash, template);
    }

    // For static components, we just need SSR function
    const code = `
${processedCSS ? `const CSS = \`${processedCSS}\`;` : ''}

export function ${node.name}_ssr(props = {}) {
  return \`${this.escapeTemplate(template)}\`;
}
`;

    return {
      code,
      dependencies: [],
      sideEffects: false,
    };
  }

  private async compileInteractive(
    node: ComponentNode,
    content: string,
  ): Promise<TransformResult> {
    // Prefer the single shared SFC compiler (server path: template clone + effects + delegation)
    try {
      const shared = new SharedSfcCompiler(
        this.ctx.config as unknown as PulseConfig,
        new ScriptParser(),
        new TemplateTransformer(),
      );
      const code = await shared.compile(node.path, content);
      return {
        code,
        dependencies: Array.from(node.dependencies || []),
        sideEffects: true,
      };
    } catch (err) {
      console.warn('[Pulse] Shared SFC compiler failed, falling back to bundler path:', err);
    }

    // Separate logic and template
    const templateStart = content.search(/^\s*<[a-zA-Z>/]/m);
    const logic =
      templateStart !== -1 ? content.substring(0, templateStart).trim() : '';
    const template =
      templateStart !== -1 ? content.substring(templateStart).trim() : '';

    // Parse template to AST using proper HTML parser
    const templateAST = this.parseTemplate(template);
    node.template = templateAST;

    // Optimize template using TemplateOptimizer
    const optimized = this.templateOptimizer.optimize(template);

    // Process CSS
    let processedCSS = '';
    if (node.styles) {
      processedCSS = this.cssScoper.scope(node.styles, node.hash, template);
    }

    // Transform logic to use signals with proper AST transformation
    const transformedLogic = this.transformLogic(logic, node);

    // Generate code using CodeGenerator
    const code = this.codeGenerator.generate(
      node,
      optimized,
      transformedLogic,
      processedCSS,
    );

    // Cache result
    this.ctx.cache.components.set(node.path, {
      hash: node.hash,
      compiled: code,
      timestamp: Date.now(),
    });

    return {
      code,
      dependencies: Array.from(node.dependencies),
      sideEffects: true,
    };
  }

  private parseTemplate(template: string): TemplateNode {
    const parsed = this.htmlParser.parse(template);
    return this.convertToTemplateNode(parsed);
  }

  private convertToTemplateNode(parsed: any): TemplateNode {
    if (parsed.type === 'text') {
      return {
        type: 'text',
        textContent: parsed.content,
        isStatic: true,
      };
    }

    if (parsed.type === 'expression') {
      return {
        type: 'expression',
        expression: {
          raw: parsed.content,
          compiled: parsed.content,
          dependencies: this.extractDeps(parsed.content),
          isReactive: true,
          type: 'simple',
        },
        isStatic: false,
      };
    }

    if (parsed.type === 'element') {
      const attributes = new Map();
      if (parsed.attributes) {
        for (const [key, value] of parsed.attributes.entries()) {
          const isExpr =
            typeof value === 'object' && value.type === 'expression';
          attributes.set(key, {
            name: key,
            value,
            isStatic: !isExpr,
            isEvent: key.startsWith('on'),
          });
        }
      }

      const children =
        parsed.children?.map((c: any) => this.convertToTemplateNode(c)) || [];
      const isStatic =
        children.every((c: TemplateNode) => c.isStatic) &&
        Array.from(attributes.values()).every((attr: any) => attr.isStatic);

      return {
        type: 'element',
        tag: parsed.tag,
        attributes,
        children,
        isStatic,
      };
    }

    return {
      type: 'fragment',
      children:
        parsed.children?.map((c: any) => this.convertToTemplateNode(c)) || [],
      isStatic: true,
    };
  }

  private extractDeps(expr: string): Set<string> {
    const deps = new Set<string>();
    const stateRegex = /state\.(\w+)/g;

    let match;
    while ((match = stateRegex.exec(expr)) !== null) {
      if (match[1]) {
        deps.add(match[1]);
      }
    }

    return deps;
  }

  private transformLogic(logic: string, node: ComponentNode): string {
    const result = this.reactivityTransformer.transform(logic);

    // Generate signal declarations
    let declarations = '';
    for (const [key, init] of result.signals) {
      declarations += `const [get_${key}, set_${key}] = createSignal(${init});\n`;
    }

    // Generate computed declarations
    for (const [key, deps] of result.computed) {
      const depAccess = deps.map((d) => `get_${d}()`).join(', ');
      declarations += `const get_${key} = createMemo(() => {\n`;
      declarations += `  // Dependencies: ${deps.join(', ')}\n`;
      declarations += `  return /* computed logic */;\n`;
      declarations += `});\n`;
    }

    return declarations + '\n' + result.code;
  }

  private escapeTemplate(template: string): string {
    return template
      .replace(/\\/g, '\\\\')
      .replace(/`/g, '\\`')
      .replace(/\$/g, '\\$');
  }
}
