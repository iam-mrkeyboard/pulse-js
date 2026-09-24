// Enhanced error handling for all components
export class ErrorBoundary {
  private static instance: ErrorBoundary;

  static getInstance() {
    if (!this.instance) this.instance = new ErrorBoundary();
    return this.instance;
  }

  wrap<T extends Function>(component: T, name: string): T {
    return ((...args: any[]) => {
      try {
        const result = component(...args);
        return result;
      } catch (error) {
        console.error(`[Pulse] ${name} Error:`, error);

        // Use global window check for browser environment
        if (typeof window !== 'undefined') {
          return this.createErrorUI(error as Error, name);
        }

        // SSR Fallback
        return `<!-- ${name} Error: ${(error as Error).message} -->`;
      }
    }) as unknown as T;
  }

  createErrorUI(error: Error, componentName: string): HTMLElement {
    const container = document.createElement('div');
    container.className = 'pulse-error-boundary';
    container.style.cssText = `
      border: 2px solid #ef4444;
      border-radius: 8px;
      padding: 20px;
      margin: 10px 0;
      background: #fef2f2;
      font-family: monospace;
    `;

    container.innerHTML = `
      <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
        <span style="font-size: 24px;">⚠️</span>
        <strong style="color: #dc2626; font-size: 18px;">${componentName} Error</strong>
      </div>
      <pre style="background: #fee; padding: 10px; border-radius: 4px; overflow-x: auto; margin: 10px 0;">${error.message}</pre>
      <details>
        <summary style="cursor: pointer; color: #6b7280;">Stack Trace</summary>
        <pre style="font-size: 11px; color: #4b5563; margin-top: 10px;">${error.stack}</pre>
      </details>
      <button 
        onclick="location.reload()" 
        style="background: #ef4444; color: white; border: none; padding: 8px 16px; border-radius: 4px; cursor: pointer; margin-top: 10px;"
      >
        Reload Page
      </button>
    `;

    return container;
  }
}

// Export singleton
export const errorBoundary = ErrorBoundary.getInstance();
