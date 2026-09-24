// ============================================================================
// FILE: src/server/compiler/mount-script-generator.ts
// Extracted from dev-server.ts - Generates hydration scripts
// ============================================================================

export function getMountScript(imports: Array<{ name: string; path: string }>, hasListPrimitive: boolean, hasShowPrimitive: boolean): string {
  return `
      // Hydrate
      // root is defined in the wrapping function scope by PageCompiler
      
      // Hydrate global content
      // Hydrate global content
      // hydrateDOM(root, scope); // Legacy: Compiler generates explicit effects now
      
      const config = { 
        components: components,
        templates: templates,
        List: ${hasListPrimitive ? 'List' : 'undefined'}, 
        Show: ${hasShowPrimitive ? 'Show' : 'undefined'} 
      };
      
      // Mount Primitives (Lists, Components)
      mountPrimitives_dom(root, scope, config);
      
      function hydrate(root) {
      }
    `;
}
