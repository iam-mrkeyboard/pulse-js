// ============================================================================
// FILE: src/bundler/compiler/code-generator.ts
// Generates final optimized code
// ============================================================================

import type { ComponentNode } from '../types';
import { TemplateCompiler } from './template-compiler';

export class CodeGenerator {
  private templateCompiler?: TemplateCompiler;
  setContext(ctx: any) {
    this.templateCompiler = new TemplateCompiler(ctx);
  }
  generate(
    node: ComponentNode,
    optimizedTemplate: any,
    transformedLogic: string,
    processedCSS?: string,
  ): string {
    const imports = this.generateImports(node);
    const propsDeclaration = this.generatePropsDeclaration(node);
    const templateCode = this.generateTemplateCode(node, optimizedTemplate);
    const exports = this.generateExports(node);

    return `${imports}

// Component: ${node.name}
// Hash: ${node.hash}

${propsDeclaration}

${transformedLogic}

${processedCSS ? `const CSS = \`${processedCSS}\`;` : ''}

${templateCode}

${exports}
`;
  }

  private generateImports(node: ComponentNode): string {
    const imports: string[] = [];

    // Import signals if needed
    if (node.reactivity.signals.size > 0) {
      imports.push(`import { createSignal } from '/runtime/core.js';`);
    }

    // Import effects if needed
    if (node.reactivity.effects.size > 0) {
      imports.push(`import { createEffect } from '/runtime/core.js';`);
    }

    // Import computed if needed
    if (node.reactivity.computed.size > 0) {
      imports.push(`import { createMemo } from '/runtime/core.js';`);
    }

    // Import primitives
    for (const primitive of node.primitives) {
      imports.push(
        `import { ${primitive} } from '/runtime/primitives/${primitive.toLowerCase()}.js';`,
      );
    }

    // Import other components
    for (const importDecl of node.imports) {
      if (importDecl.isComponent) {
        const specifiers = importDecl.specifiers
          .map((s) =>
            s.imported === 'default'
              ? s.local
              : `{ ${s.imported} as ${s.local} }`,
          )
          .join(', ');
        imports.push(`import ${specifiers} from '${importDecl.source}';`);
      }
    }

    // Import error boundary
    imports.push(`import { errorBoundary } from '/runtime/error-boundary.js';`);

    return imports.join('\n');
  }

  private generatePropsDeclaration(node: ComponentNode): string {
    if (node.props.size === 0) {
      return '';
    }

    const propDefaults: string[] = [];
    for (const [name, prop] of node.props.entries()) {
      if (prop.defaultValue !== undefined) {
        propDefaults.push(`${name}: ${prop.defaultValue}`);
      }
    }

    if (propDefaults.length === 0) {
      return '';
    }

    return `const defaultProps = { ${propDefaults.join(', ')} };`;
  }

  private generateTemplateCode(node: ComponentNode, optimized: any): string {
    if (optimized.static && optimized.dynamic.length === 0) {
      return `
function render(props = {}) {
  const TEMPLATE = document.createElement('template');
  TEMPLATE.innerHTML = \`${optimized.static}\`;
  return TEMPLATE.content.cloneNode(true).firstElementChild;
}
`;
    }

    // For components with dynamic content or child components
    if (this.templateCompiler && node.template) {
      const compiledTemplate = this.templateCompiler.compile(
        node.template,
        node,
      );
      return `
function render(props = {}) {
  ${node.props.size > 0 ? 'props = { ...defaultProps, ...props };' : ''}
  return ${compiledTemplate};
}
`;
    }

    return `
function render(props = {}) {
  ${node.props.size > 0 ? 'props = { ...defaultProps, ...props };' : ''}
  const root = document.createElement('div');
  root.innerHTML = \`${optimized.static}\`;
  return root.firstElementChild;
}
`;
  }

  private generateExports(node: ComponentNode): string {
    return `
export default function ${node.name}(props = {}) {
  const wrapped = errorBoundary.wrap(function(props) {
    return render(props);
  }, '${node.name}');
  return wrapped(props);
}

// SSR export
export function ${node.name}_ssr(props = {}) {
  try {
    ${node.props.size > 0 ? 'props = { ...defaultProps, ...props };' : ''}
    return \`${node.template?.staticHTML || ''}\`;
  } catch (e) {
    return \`<!-- \${node.name} SSR Error: \${e.message} -->\`;
  }
}
`;
  }
}
