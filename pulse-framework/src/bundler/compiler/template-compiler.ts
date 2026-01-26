// ============================================================================
// FILE: src/bundler/compiler/template-compiler.ts - NEW FILE
// Compiles templates with component support
// ============================================================================

import type { TemplateNode, ComponentNode, CompilationContext } from '../types';
import { ComponentResolver } from './component-resolver';
import { ComponentPropsError } from './errors';
import { SlotsCompiler } from './slots-compiler';

export class TemplateCompiler {
  private resolver: ComponentResolver;
  private slotsCompiler: SlotsCompiler;

  constructor(private ctx: CompilationContext) {
    this.resolver = new ComponentResolver();
    this.slotsCompiler = new SlotsCompiler();
  }

  compile(node: TemplateNode, parentComponent: ComponentNode): string {
    return this.compileNode(node, parentComponent);
  }

  private compileNode(
    node: TemplateNode,
    parentComponent: ComponentNode,
  ): string {
    switch (node.type) {
      case 'text':
        return this.compileText(node);
      case 'expression':
        return this.compileExpression(node);
      case 'element':
        return this.compileElement(node, parentComponent);
      case 'fragment':
        return this.compileFragment(node, parentComponent);
      default:
        return '';
    }
  }

  private compileText(node: TemplateNode): string {
    return `document.createTextNode(${JSON.stringify(node.textContent || '')})`;
  }

  private compileExpression(node: TemplateNode): string {
    if (!node.expression) return '';

    const code = node.expression.compiled || node.expression.raw;
    return `document.createTextNode(String(${code}))`;
  }

  private compileElement(
    node: TemplateNode,
    parentComponent: ComponentNode,
  ): string {
    if (!node.tag) return '';

    // Check if it's a known primitive
    if (node.tag === 'List') {
      parentComponent.primitives.add('List');
      return this.compileListPrimitive(node, node.attributes || new Map(), parentComponent);
    }
    if (node.tag === 'Show') {
      parentComponent.primitives.add('Show');
      return this.compileShowPrimitive(node, node.attributes || new Map(), parentComponent);
    }

    // Check if this is a custom component
    const componentNode = this.findComponentByTag(node.tag, parentComponent);

    if (componentNode) {
      return this.compileCustomComponent(node, componentNode, parentComponent);
    }

    // Regular HTML element
    return this.compileHTMLElement(node, parentComponent);
  }

  private compileCustomComponent(
    node: TemplateNode,
    component: ComponentNode,
    parentComponent: ComponentNode,
  ): string {
    const attributes = node.attributes || new Map();

    // Compile children as slot content
    let childrenContent = null;
    if (node.children && node.children.length > 0) {
      const compiledChildren = node.children
        .map((c) => this.compileNode(c, parentComponent))
        .join(',\n    ');
      childrenContent = `[${compiledChildren}]`;
    }

    // Validate props with better error handling
    const validation = this.resolver.validateProps(component, attributes);
    if (!validation.valid) {
      // Generate detailed error
      throw new ComponentPropsError(
        component.name,
        validation.errors,
        parentComponent.path,
        node,
      );
    }

    // Generate props object with slots
    const propsObj = this.generatePropsWithSlots(
      component,
      attributes,
      childrenContent,
    );

    const componentName = this.getComponentFunctionName(component);
    return `${componentName}(${propsObj})`;
  }

  private generatePropsWithSlots(
    component: ComponentNode,
    attributes: Map<string, any>,
    children: string | null,
  ): string {
    const props: string[] = [];

    // Add regular props
    for (const [key, value] of attributes.entries()) {
      if (typeof value === 'string') {
        props.push(`${key}: "${this.escapeString(value)}"`);
      } else if (typeof value === 'object' && value.type === 'expression') {
        props.push(`${key}: ${value.code}`);
      } else {
        props.push(`${key}: ${JSON.stringify(value)}`);
      }
    }

    // Add slots if children exist
    if (children) {
      const slotsCode = this.slotsCompiler.wrapChildrenInSlot(children);
      props.push(slotsCode);
    }

    return props.length > 0 ? `{ ${props.join(', ')} }` : '{}';
  }

  private escapeString(str: string): string {
    return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  }

  private getComponentFunctionName(component: ComponentNode): string {
    return component.name.replace(/[^a-zA-Z0-9_$]/g, '_');
  }

  private compileHTMLElement(
    node: TemplateNode,
    parentComponent: ComponentNode,
  ): string {
    const tag = node.tag!;
    const el = `el_${this.generateId()}`;

    let code = `(() => {\n`;
    code += `  const ${el} = document.createElement('${tag}');\n`;

    // Set attributes
    if (node.attributes) {
      for (const [key, attr] of node.attributes.entries()) {
        if (attr.isEvent) {
          const eventName = key.slice(2).toLowerCase(); // onClick -> click
          const handler =
            typeof attr.value === 'object' && (attr.value as any).code
              ? (attr.value as any).code
              : attr.value;
          code += `  ${el}.addEventListener('${eventName}', ${handler});\n`;
        } else {
          const value =
            typeof attr.value === 'object' && (attr.value as any).code
              ? (attr.value as any).code
              : JSON.stringify(attr.value);
          code += `  ${el}.setAttribute('${key}', ${value});\n`;
        }
      }
    }

    // Append children
    if (node.children && node.children.length > 0) {
      for (const child of node.children) {
        const childCode = this.compileNode(child, parentComponent);
        code += `  ${el}.appendChild(${childCode});\n`;
      }
    }

    code += `  return ${el};\n`;
    code += `})()`;

    return code;
  }

  private compileFragment(
    node: TemplateNode,
    parentComponent: ComponentNode,
  ): string {
    if (!node.children || node.children.length === 0) {
      return 'document.createDocumentFragment()';
    }

    const fragment = `fragment_${this.generateId()}`;
    let code = `(() => {\n`;
    code += `  const ${fragment} = document.createDocumentFragment();\n`;

    for (const child of node.children) {
      const childCode = this.compileNode(child, parentComponent);
      code += `  ${fragment}.appendChild(${childCode});\n`;
    }

    code += `  return ${fragment};\n`;
    code += `})()`;

    return code;
  }

  private compileListPrimitive(
    node: TemplateNode,
    attributes: Map<string, any>,
    parentComponent: ComponentNode,
  ): string {
    const each = attributes.get('each')?.value;
    const as = attributes.get('as')?.value || 'item';
    
    // Generate props
    const props = [];
    if (each) {
      const code = typeof each === 'object' && each.code ? each.code : JSON.stringify(each);
      props.push(`each: ${code}`);
    }

    // Compile children function
    if (node.children && node.children.length > 0) {
      const childrenCode = this.compileChildrenAsFunction(node.children, parentComponent, [as, 'index']);
      props.push(`children: ${childrenCode}`);
    }

    return `List({ ${props.join(', ')} })`;
  }

  private compileShowPrimitive(
    node: TemplateNode,
    attributes: Map<string, any>,
    parentComponent: ComponentNode,
  ): string {
    const when = attributes.get('when')?.value;
    const fallback = attributes.get('fallback')?.value;
    
    const props = [];
    if (when) {
      const code = typeof when === 'object' && when.code ? when.code : JSON.stringify(when);
       props[0] = `when: () => ${code}`;
    }

    if (fallback) {
       const code = typeof fallback === 'object' && fallback.code ? fallback.code : JSON.stringify(fallback);
       props.push(`fallback: () => ${code}`);
    }

    if (node.children && node.children.length > 0) {
      const childrenCode = this.compileChildrenAsFunction(node.children, parentComponent, []);
      props.push(`children: ${childrenCode}`);
    }

    return `Show({ ${props.join(', ')} })`;
  }

  private compileChildrenAsFunction(
    children: TemplateNode[],
    parentComponent: ComponentNode,
    args: string[]
  ): string {
    // If multiple children, wrap in fragment
    const isFragment = children.length > 1;
    
    // We need to compile children. 
    // IMPORTANT: If we use `compileNode` it generates IIFE `(() => { ... })()`.
    // We want the body of that IIFE inside our arrow function.
    // Or we can just call the compiled code.
    // `compileNode` returns string of code that EVALUATES to a Node.
    
    if (isFragment) {
       // Create a fragment that appends all children
       const childCodes = children.map(c => this.compileNode(c, parentComponent));
       return `(${args.join(', ')}) => {
         const frag = document.createDocumentFragment();
         [${childCodes.join(', ')}].forEach(n => frag.appendChild(n));
         return frag;
       }`;
    } else {
       // Single child
       const childCode = this.compileNode(children[0], parentComponent);
       return `(${args.join(', ')}) => ${childCode}`;
    }
  }

  private findComponentByTag(
    tag: string,
    parentComponent: ComponentNode,
  ): ComponentNode | null {
    // Check if tag matches any imported component
    for (const importDecl of parentComponent.imports) {
      if (!importDecl.isComponent) continue;

      for (const spec of importDecl.specifiers) {
        if (spec.local === tag) {
          const component = this.resolver.resolveComponentImport(
            parentComponent.path,
            importDecl,
            this.ctx.graph.nodes,
          );
          if (component) return component;
        }
      }
    }

    return null;
  }

  private generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }
}
