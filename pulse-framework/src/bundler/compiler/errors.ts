// ============================================================================
// FILE: src/bundler/compiler/errors.ts
// Unified Error System
// ============================================================================

// ----------------------------------------------------------------------------
// Part 1: Strict Result Pattern & Base CompilationError (from v2)
// ----------------------------------------------------------------------------

export type Result<T, E> = Ok<T> | Err<E>;

export class Ok<T> {
  constructor(public value: T) { }

  isOk(): this is Ok<T> { return true; }
  isErr(): this is Err<any> { return false; }
}

export class Err<E> {
  constructor(public error: E) { }

  isOk(): this is Ok<any> { return false; }
  isErr(): this is Err<E> { return true; }
}

export type CodeLine = {
  content: string;
  isError: boolean;
  lineNo: number;
  column?: number;
  hint?: string;
};

export type CodeFrame = {
  start: number;
  lines: CodeLine[];
};

export interface ValidationWarning {
  code: string;
  message: string;
  location?: { line: number; column: number };
}

export interface CompilationErrorOptions {
  message: string;
  code: string;
  file: string;
  title?: string;
  location?: { line: number; column: number };
  suggestion?: string;
  originalError?: Error;
  quickFixes?: QuickFix[];
  docsUrl?: string;
  source?: string; // For code frame generation
}

export type QuickFix = {
  label: string;
  apply: (source: string) => string;
};

export class CompilationError extends Error {
  public code: string;
  public file: string;
  public title: string;
  public location?: { line: number; column: number };
  public suggestion?: string;
  public originalError?: Error;
  public quickFixes?: QuickFix[];
  public docsUrl?: string;
  public codeFrame?: CodeFrame;
  public preview?: string; // HTML preview of error state if applicable

  constructor(options: CompilationErrorOptions) {
    super(options.message);
    this.name = 'CompilationError';
    this.code = options.code;
    this.file = options.file;
    this.title = options.title || 'Compilation Error';
    this.location = options.location;
    this.suggestion = options.suggestion;
    this.originalError = options.originalError;
    this.quickFixes = options.quickFixes;
    this.docsUrl = options.docsUrl || 'https://pulsejs.org/docs/errors';

    if (options.source && options.location) {
      this.codeFrame = this.generateCodeFrame(options.source, options.location);
    }
  }

  private generateCodeFrame(source: string, loc: { line: number; column: number }): CodeFrame {
    const lines = source.split('\n');
    const startLine = Math.max(0, loc.line - 3);
    const endLine = Math.min(lines.length - 1, loc.line + 2);

    const frameLines: CodeLine[] = [];
    for (let i = startLine; i <= endLine; i++) {
      frameLines.push({
        content: lines[i],
        lineNo: i + 1,
        isError: i + 1 === loc.line,
        column: i + 1 === loc.line ? loc.column : undefined,
        hint: i + 1 === loc.line ? 'Error occurred here' : undefined
      });
    }

    return {
      start: startLine + 1,
      lines: frameLines
    };
  }
}

export class EmptyComponentError extends CompilationError {
  constructor(file: string) {
    super({
      message: 'Component file is empty',
      code: 'EMPTY_FILE',
      title: 'Empty Component',
      file,
      suggestion: 'Add a template to your component. Example: <div>Hello</div>'
    });
  }
}

export class InvalidStructureError extends CompilationError {
  constructor(options: { file: string; suggestion: string; example: string }) {
    super({
      message: 'Invalid component structure',
      code: 'INVALID_STRUCTURE',
      title: 'Structural Error',
      file: options.file,
      suggestion: `${options.suggestion}\nExample:\n${options.example}`
    });
  }
}

export class ParseError extends CompilationError {
  constructor(options: { original: Error; source: any; suggestions?: string[] }) {
    // Determine location from original error if possible
    const loc = (options.original as any).loc || { line: 1, column: 0 };

    super({
      message: options.original.message,
      code: 'PARSE_ERROR',
      title: 'Parsing Failed',
      file: options.source.file || 'unknown', // Need to pass file path
      location: loc,
      originalError: options.original,
      suggestion: options.suggestions?.join('\n')
    });
  }
}

export class ForbiddenPatternError extends CompilationError {
  constructor(patterns: string[], file: string) {
    super({
      message: `Forbidden patterns found: ${patterns.join(', ')}`,
      code: 'FORBIDDEN_PATTERN',
      title: 'Forbidden Pattern',
      file,
      suggestion: 'Remove usage of forbidden patterns / regex based style hacks.'
    });
  }
}

// ----------------------------------------------------------------------------
// Part 2: Specific Component Errors (from legacy/v1)
// ----------------------------------------------------------------------------

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

export class ComponentError extends Error {
  public code: string;
  public file: string;
  public line?: number;
  public column?: number;
  public suggestion?: string;
  public originalError?: Error;

  constructor(options: {
    message: string;
    code: string;
    file: string;
    line?: number;
    column?: number;
    suggestion?: string;
    originalError?: Error;
  }) {
    super(options.message);
    this.name = 'ComponentError';
    this.code = options.code;
    this.file = options.file;
    this.line = options.line;
    this.column = options.column;
    this.suggestion = options.suggestion;
    this.originalError = options.originalError;
  }

  toDevError(): import('../../server/error-overlay').DevError {
    return {
      type: 'compile',
      file: this.file,
      message: this.message,
      suggestion: this.suggestion || 'Check the component structure',
      line: this.line,
      column: this.column,
    };
  }
}
