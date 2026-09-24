// ============================================================================
// FILE: src/dev/error-overlay-v2.ts
// Visual Error System for displaying compilation errors in the browser
// ============================================================================

import type { CompilationError } from '../bundler/compiler/errors-v2';

export class VisualErrorSystem {
  private overlay: HTMLElement | null = null;
  private styleId = 'pulse-error-overlay-styles';

  constructor() {
    this.injectStyles();
  }

  public showError(error: CompilationError) {
    this.clear(); // Clear previous
    this.overlay = this.createOverlay(error);
    document.body.appendChild(this.overlay);
  }

  public clear() {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
  }

  private createOverlay(error: CompilationError): HTMLElement {
    const container = document.createElement('div');
    container.className = 'pulse-error-overlay';

    const content = document.createElement('div');
    content.className = 'pulse-error-content';

    // Title
    const title = document.createElement('h1');
    title.textContent = error.title || 'Compilation Error';
    content.appendChild(title);

    // Message
    const message = document.createElement('pre');
    message.className = 'pulse-error-message';
    message.textContent = error.message;
    content.appendChild(message);

    // File
    if (error.file) {
      const fileInfo = document.createElement('div');
      fileInfo.className = 'pulse-error-file';
      const loc = error.location ? `:${error.location.line}:${error.location.column}` : '';
      fileInfo.textContent = `In ${error.file}${loc}`;
      content.appendChild(fileInfo);
    }

    // Code Frame
    if (error.codeFrame) {
      const frame = document.createElement('pre');
      frame.className = 'pulse-error-code-frame';
      frame.textContent = error.codeFrame;
      content.appendChild(frame);
    } else if (error.source && error.location) {
      // Generate code frame roughly if not provided
      const frame = document.createElement('pre');
      frame.className = 'pulse-error-code-frame';
      frame.textContent = this.generateSimpleFrame(error.source, error.location);
      content.appendChild(frame);
    }

    // Suggestion
    if (error.suggestion) {
      const tip = document.createElement('div');
      tip.className = 'pulse-error-tip';
      tip.textContent = `💡 Hint: ${error.suggestion}`;
      content.appendChild(tip);
    }

    // Close Button (for dismissing, though usually HMR fixes it)
    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'Dismiss';
    closeBtn.className = 'pulse-error-dismiss';
    closeBtn.onclick = () => this.clear();
    content.appendChild(closeBtn);

    container.appendChild(content);
    return container;
  }

  private generateSimpleFrame(source: string, loc: { line: number, column: number }): string {
    const lines = source.split('\n');
    const start = Math.max(0, loc.line - 2);
    const end = Math.min(lines.length, loc.line + 1);

    let frame = '';
    for (let i = start; i < end; i++) {
      const isErrorLine = i === loc.line - 1;
      const prefix = isErrorLine ? '> ' : '  ';
      const lineNum = (i + 1).toString().padEnd(4);
      frame += `${prefix}${lineNum} | ${lines[i]}\n`;
      if (isErrorLine) {
        frame += `       | ${' '.repeat(loc.column)}^`;
      }
    }
    return frame;
  }

  private injectStyles() {
    if (document.getElementById(this.styleId)) return;

    const style = document.createElement('style');
    style.id = this.styleId;
    style.textContent = `
      .pulse-error-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.85);
        color: #fff;
        z-index: 99999;
        display: flex;
        justify-content: center;
        align-items: center;
        font-family: monospace;
      }
      .pulse-error-content {
        background: #1e1e1e;
        border: 1px solid #f44336;
        border-radius: 8px;
        padding: 24px;
        max-width: 900px;
        width: 90%;
        max-height: 90vh;
        overflow: auto;
        box-shadow: 0 4px 20px rgba(0,0,0,0.5);
      }
      .pulse-error-content h1 {
        margin: 0 0 16px 0;
        color: #f44336;
        font-size: 20px;
      }
      .pulse-error-message {
        background: #2d2d2d;
        padding: 12px;
        border-radius: 4px;
        white-space: pre-wrap;
        color: #ffcdd2;
        margin-bottom: 16px;
      }
      .pulse-error-file {
        color: #90a4ae;
        margin-bottom: 12px;
        font-size: 14px;
      }
      .pulse-error-code-frame {
        background: #111;
        padding: 16px;
        border-radius: 4px;
        overflow-x: auto;
        color: #e0e0e0;
        border-left: 3px solid #f44336;
      }
      .pulse-error-tip {
        margin-top: 16px;
        color: #81c784;
        font-size: 14px;
        font-weight: bold;
      }
      .pulse-error-dismiss {
        margin-top: 20px;
        padding: 8px 16px;
        background: #444;
        border: none;
        color: #fff;
        border-radius: 4px;
        cursor: pointer;
      }
      .pulse-error-dismiss:hover {
        background: #666;
      }
    `;
    document.head.appendChild(style);
  }
}
