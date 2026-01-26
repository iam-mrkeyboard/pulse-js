// ============================================================================
// FILE: src/bundler/compiler/component-resolver.ts - NEW FILE
// Resolves component imports and generates component usage code
// ============================================================================

import path from 'path';
import type { ComponentNode, ImportDeclaration } from '../types';

export class ComponentResolver {
  private componentCache = new Map<string, ComponentNode>();

  resolveComponentImport(
    fromPath: string,
    importDecl: ImportDeclaration,
    graph: Map<string, ComponentNode>,
  ): ComponentNode | null {
    if (!importDecl.isComponent) {
      return null;
    }

    const resolvedPath = this.resolveImportPath(fromPath, importDecl.source);
    return graph.get(resolvedPath) || null;
  }

  private resolveImportPath(fromPath: string, importPath: string): string {
    if (importPath.startsWith('.')) {
      return path.resolve(path.dirname(fromPath), importPath);
    }
    return importPath;
  }

  generateComponentUsage(
    component: ComponentNode,
    attributes: Map<string, any>,
    children?: string,
  ): string {
    const componentName = this.getComponentFunctionName(component);
    const propsObj = this.generatePropsObject(component, attributes);

    if (children) {
      return `${componentName}({ ...${propsObj}, children: ${children} })`;
    }

    return `${componentName}(${propsObj})`;
  }

  private getComponentFunctionName(component: ComponentNode): string {
    // Convert component name to valid function name
    return component.name.replace(/[^a-zA-Z0-9_$]/g, '_');
  }

  private generatePropsObject(
    component: ComponentNode,
    attributes: Map<string, any>,
  ): string {
    const props: string[] = [];

    for (const [key, value] of attributes.entries()) {
      if (typeof value === 'string') {
        props.push(`${key}: "${value}"`);
      } else if (typeof value === 'object' && value.type === 'expression') {
        props.push(`${key}: ${value.code}`);
      } else {
        props.push(`${key}: ${JSON.stringify(value)}`);
      }
    }

    return props.length > 0 ? `{ ${props.join(', ')} }` : '{}';
  }

  validateProps(
    component: ComponentNode,
    providedProps: Map<string, any>,
  ): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check required props
    for (const [propName, propDef] of component.props.entries()) {
      if (propDef.required && !providedProps.has(propName)) {
        errors.push(
          `Missing required prop: ${propName} (type: ${propDef.type})`,
        );
      }
    }

    // Check prop types
    for (const [propName, propValue] of providedProps.entries()) {
      const propDef = component.props.get(propName);

      if (!propDef) {
        errors.push(
          `Unknown prop: ${propName} (component ${component.name} doesn't accept this prop)`,
        );
        continue;
      }

      // Type checking for static values
      if (typeof propValue === 'string') {
        if (propDef.type === 'number' && isNaN(Number(propValue))) {
          errors.push(
            `Invalid type for prop ${propName}: expected ${propDef.type}, got string`,
          );
        }
      }
    }

    // Check for typos in prop names
    if (errors.some((e) => e.includes('Unknown prop'))) {
      const validPropNames = Array.from(component.props.keys());
      for (const [propName] of providedProps.entries()) {
        if (!component.props.has(propName)) {
          const similar = this.findSimilarPropName(propName, validPropNames);
          if (similar) {
            errors.push(`Did you mean "${similar}" instead of "${propName}"?`);
          }
        }
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  private findSimilarPropName(
    name: string,
    validNames: string[],
  ): string | null {
    // Simple Levenshtein distance for typo detection
    let bestMatch: string | null = null;
    let minDistance = Infinity;

    for (const validName of validNames) {
      const distance = this.levenshteinDistance(
        name.toLowerCase(),
        validName.toLowerCase(),
      );
      if (distance < minDistance && distance <= 2) {
        minDistance = distance;
        bestMatch = validName;
      }
    }

    return bestMatch;
  }

  private levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
      matrix[0]![j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i]![j] = matrix[i - 1]![j - 1]!;
        } else {
          matrix[i]![j] = Math.min(
            matrix[i - 1]![j - 1]! + 1,
            matrix[i]![j - 1]! + 1,
            matrix[i - 1]![j]! + 1,
          );
        }
      }
    }

    return matrix[b.length]![a.length]!;
  }
}
