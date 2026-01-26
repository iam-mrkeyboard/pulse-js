// ============================================================================
// FILE: src/bundler/compiler/errors.ts - NEW FILE
// Better error classes with helpful messages
// ============================================================================

export class ComponentPropsError extends Error {
  constructor(
    public componentName: string,
    public validationErrors: string[],
    public parentFile: string,
    public node?: any,
  ) {
    super(`Props validation failed for component <${componentName}>`);
    this.name = 'ComponentPropsError';
  }

  toDevError(): import('../../server/error-overlay').DevError {
    const suggestions = this.generateSuggestions();

    return {
      type: 'compile',
      file: this.parentFile,
      message: this.getMessage(),
      suggestion: suggestions,
      line: this.node?.line,
      column: this.node?.column,
    };
  }

  private getMessage(): string {
    return `Component <${this.componentName}> has the following prop errors:\n${this.validationErrors.map((e) => `  • ${e}`).join('\n')}`;
  }

  private generateSuggestions(): string {
    const suggestions: string[] = [];

    for (const error of this.validationErrors) {
      if (error.includes('Missing required prop')) {
        const propName = error.split(':')[1]?.trim();
        suggestions.push(
          `Add the ${propName} prop: <${this.componentName} ${propName}={value} />`,
        );
      } else if (error.includes('Unknown prop')) {
        suggestions.push(
          `Check the component's prop definitions in its source file`,
        );
      } else if (error.includes('Invalid type')) {
        suggestions.push(`Ensure the prop value matches the expected type`);
      }
    }

    return suggestions.length > 0
      ? suggestions.join('\n')
      : 'Check the component definition for valid props';
  }
}

export class ComponentImportError extends Error {
  constructor(
    public componentName: string,
    public importPath: string,
    public parentFile: string,
  ) {
    super(`Failed to import component: ${componentName} from ${importPath}`);
    this.name = 'ComponentImportError';
  }

  toDevError(): import('../../server/error-overlay').DevError {
    return {
      type: 'compile',
      file: this.parentFile,
      message: `Cannot find component: ${this.componentName}`,
      suggestion: `Check if the file exists at: ${this.importPath}\nMake sure the path is correct and the file has a .pulse extension`,
    };
  }
}

export class SlotError extends Error {
  constructor(
    public slotName: string,
    public componentName: string,
  ) {
    super(`Unknown slot: ${slotName} in component ${componentName}`);
    this.name = 'SlotError';
  }
}
