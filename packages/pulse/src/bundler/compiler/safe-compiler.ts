import { UnifiedParser } from './unified-parser';
import { ComponentValidator } from './validator';
import type { ComponentAST } from '../types/ast';
import { Result, Ok, Err, CompilationError, EmptyComponentError, InvalidStructureError, ParseError, ForbiddenPatternError, ValidationWarning } from './errors';

type CompiledCode = { code: string; map: any; warnings: ValidationWarning[] };

export class CompilationContext {
  public warnings: ValidationWarning[] = [];

  constructor(public filePath: string) { }

  addWarning(message: string, location?: { line: number; column: number }) {
    this.warnings.push({
      code: 'WARNING',
      message,
      location
    });
  }
}

export class SafeCompiler {
  private readonly strictMode = true;
  private parser: UnifiedParser;
  private validator: ComponentValidator;

  constructor(private legacyCompiler?: any) {
    this.parser = new UnifiedParser();
    this.validator = new ComponentValidator();
  }

  async compile(source: string, filePath: string): Promise<Result<CompiledCode, CompilationError>> {
    const context = new CompilationContext(filePath);

    try {
      // 1. Basic Validation (String level)
      this.validate(source, context);

      // 2. Parse with Unified Parser
      const ast = this.parseWithRecovery(source, context);

      // 3. AST Validation
      const validationResult = this.validator.validate(ast);
      if (validationResult.isErr()) {
        // Propagate validation error
        // Note: Validator returns Err(CompilationError)
        return new Err(this.enrichError(validationResult.error, context, source));
      }

      // 4. Transform (Delegate to legacy or new)
      // Note: Legacy compiler currently recompiles from source. 
      // In later phases we will pass AST.
      const transformed = await this.transformSafe(ast, source, filePath, context);

      // 5. Emit
      return new Ok(this.emit(transformed, context));

    } catch (error: any) {
      return new Err(this.enrichError(error, context, source));
    }
  }

  private validate(source: string, ctx: CompilationContext): void {
    if (!source || !source.trim()) {
      throw new EmptyComponentError(ctx.filePath);
    }
  }

  private parseWithRecovery(source: string, ctx: CompilationContext): ComponentAST {
    try {
      return this.parser.parse(source, ctx.filePath);
    } catch (parseError: any) {
      throw new ParseError({
        original: parseError,
        source: { file: ctx.filePath }, // TODO: Pass source context
      });
    }
  }

  private async transformSafe(ast: ComponentAST, source: string, filePath: string, ctx: CompilationContext): Promise<string> {
    // Phase 1 Integration: Verify AST exists but still use Legacy Compiler for output
    // This runs the existing build but with the safety net of the new Parser + Validator checking it first.

    if (this.legacyCompiler) {
      return this.legacyCompiler.compile(filePath, source);
    }

    return "// SafeCompiler: No backend configured yet";
  }

  private emit(code: string, ctx: CompilationContext): CompiledCode {
    return {
      code,
      map: null,
      warnings: ctx.warnings
    };
  }

  private enrichError(error: any, ctx: CompilationContext, source: string): CompilationError {
    if (error instanceof CompilationError) return error;

    return new CompilationError({
      message: error.message || 'Unknown compilation error',
      code: 'UNKNOWN_ERROR',
      file: ctx.filePath,
      originalError: error,
      source,
      location: error.loc
    });
  }
}
