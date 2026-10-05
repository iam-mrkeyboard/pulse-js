// ============================================================================
// FILE: src/server/utils/html-wrapper.ts
// Extracted from dev-server.ts - HTML wrapping and error utilities
// ============================================================================

import { ErrorOverlay } from './error-overlay';

/**
 * Generates a 404 response with error overlay
 */
export function serve404(pathname: string): Response {
  const html = ErrorOverlay.generateHTML({
    type: 'network',
    message: 'Page Not Found',
    file: pathname,
    suggestion: 'Check if the file exists in your pages directory',
  });
  return new Response(html, {
    status: 404,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

/**
 * Generates contextual suggestions for common errors
 */
export function generateSuggestion(error: Error): string {
  const message = error.message.toLowerCase();
  if (message.includes('undefined') || message.includes('null')) {
    return 'Check if all variables are properly defined before use';
  }
  if (message.includes('syntax')) {
    return 'Check for missing brackets, parentheses, or semicolons';
  }
  if (message.includes('import')) {
    return 'Verify that the imported file path is correct';
  }
  if (message.includes('state')) {
    return 'Make sure state variables are declared before use';
  }

  return 'Check the error message above for more details';
}
