// ============================================================================
// FILE: src/dev/auto-fixer.ts
// Automated Code Fixer for Pulse
// ============================================================================

import type { CompilationError } from '../bundler/compiler/errors-v2';

export interface FixSuggestion {
  description: string;
  apply: () => string; // Returns new source code
}

export class AutoFixer {

  public getFixes(error: CompilationError, source: string): FixSuggestion[] {
    const fixes: FixSuggestion[] = [];

    if (error.code === 'UNDEFINED_REFERENCE' && error.suggestion) {
      // Example: "Define x in the <script> block..."
      const match = error.message.match(/Undefined variables referenced.*: (\w+)/);
      if (match) {
        const varName = match[1];
        fixes.push({
          description: `Initialize '${varName}' as a signal`,
          apply: () => {
            // Heuristic: Insert at top of script
            // This is a naive string insertion. 
            // Phase 4 will use AST modification.
            return source.replace(
              /<script>/,
              `<script>\n  const [${varName}, set${this.capitalize(varName)}] = createSignal(0);`
            );
          }
        });
      }
    }

    // Add more patterns here...

    return fixes;
  }

  private capitalize(s: string) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
}
