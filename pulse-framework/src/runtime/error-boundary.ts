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

    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:10px;';
    const icon = document.createElement('span');
    icon.style.fontSize = '24px';
    icon.textContent = '⚠️';
    const title = document.createElement('strong');
    title.style.cssText = 'color:#dc2626;font-size:18px;';
    title.textContent = `${componentName} Error`;
    header.append(icon, title);

    const msg = document.createElement('pre');
    msg.style.cssText = 'background:#fee;padding:10px;border-radius:4px;overflow-x:auto;margin:10px 0;';
    msg.textContent = error.message;

    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.style.cssText = 'cursor:pointer;color:#6b7280;';
    summary.textContent = 'Stack Trace';
    const stack = document.createElement('pre');
    stack.style.cssText = 'font-size:11px;color:#4b5563;margin-top:10px;';
    stack.textContent = error.stack || '';
    details.append(summary, stack);

    const btn = document.createElement('button');
    btn.textContent = 'Reload Page';
    btn.style.cssText = 'background:#ef4444;color:white;border:none;padding:8px 16px;border-radius:4px;cursor:pointer;margin-top:10px;';
    btn.addEventListener('click', () => location.reload());

    container.append(header, msg, details, btn);
    return container;
  }
}

// Export singleton
export const errorBoundary = ErrorBoundary.getInstance();
