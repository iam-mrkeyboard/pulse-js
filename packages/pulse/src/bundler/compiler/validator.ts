// ============================================================================
// FILE: src/bundler/compiler/validator.ts
// AST-based validation for Pulse Components
// ============================================================================

import { ComponentAST, Binding } from '../types/ast';
import { CompilationError, Result, Ok, Err, ValidationWarning } from './errors';

export class ComponentValidator {

  validate(ast: ComponentAST): Result<true, CompilationError> {
    const file = ast.metadata.location.file;

    // 1. Structural Validation
    // e.g. Script presence, Template correctness
    if (ast.script.type === 'error') {
      return new Err(new CompilationError({
        message: ast.script.error.message,
        code: 'SCRIPT_JUNK',
        file,
        originalError: ast.script.error,
        location: (ast.script.error as any).loc,
      }));
    }

    if (ast.template.type === 'error') {
      return new Err(new CompilationError({
        message: ast.template.error.message,
        code: 'TEMPLATE_JUNK',
        file,
        originalError: ast.template.error
      }));
    }

    if (ast.styles.type === 'error') {
      return new Err(new CompilationError({
        message: ast.styles.error.message,
        code: 'STYLE_JUNK',
        file,
        originalError: ast.styles.error
      }));
    }

    // 2. Reference Validation
    // Check that used variables in template exist in script
    // This is simple for now, can be complex with scope

    if (ast.template.type === 'valid' && ast.script.type === 'valid') {
      const missingRefs = this.checkReferences(ast);
      if (missingRefs.length > 0) {
        return new Err(new CompilationError({
          message: `Undefined variables referenced in template: ${missingRefs.join(', ')}`,
          code: 'UNDEFINED_REFERENCE',
          file,
          suggestion: `Define ${missingRefs.join(', ')} in the <script> block or import them.`
        }));
      }
    }

    return new Ok(true);
  }

  private checkReferences(ast: ComponentAST): string[] {
    // In Phase 1, we do basic check of top-level identifiers in bindings
    // vs top-level declarations in script.
    // This is "Good enough" to catch typos.

    const defined = new Set<string>();

    if (ast.script.type === 'valid') {
      // Add imports
      ast.script.imports.forEach(i => {
        i.specifiers.forEach(s => defined.add(s.local));
      });
      // Add signals
      ast.script.signals.forEach(s => defined.add(s.name));
      // Add functions
      ast.script.functions.forEach(f => defined.add(f.name));
      // Add declarations
      ast.script.declarations.forEach(d => defined.add(d));

      // TODO: Add standard JS globals and Pulse intrinsics?
      ['console', 'window', 'document', 'Math', 'Date', 'Array', 'Object', 'Boolean', 'String', 'Number'].forEach(g => defined.add(g));
    }

    const missing: string[] = [];

    if (ast.template.type === 'valid') {
      ast.template.bindings.forEach(b => {
        const exprSrc = typeof b.expression === 'string' ? b.expression : b.expression.raw;
        const ids = this.extractIdentifiers(exprSrc);
        ids.forEach(id => {
          if (!defined.has(id)) {
            missing.push(id);
          }
        });
      });
    }

    return missing;
  }

  private extractIdentifiers(expression: string): string[] {
    // Very naive extraction, but better than nothing for now.
    // Matches words not starting with digit.
    // Ignores keywords roughly (can refine).
    const tokens = expression.match(/[a-zA-Z_$][a-zA-Z0-9_$]*/g) || [];
    const keywords = new Set(['true', 'false', 'null', 'undefined', 'typeof', 'instanceof', 'in', 'new', 'this']);
    return tokens.filter(t => !keywords.has(t));
  }
}
