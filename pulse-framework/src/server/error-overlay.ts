// ============================================================================
// FILE: src/server/error-overlay.ts - NEW FILE
// Beautiful error overlay for development
// ============================================================================

export interface DevError {
  type: 'parse' | 'compile' | 'runtime' | 'network';
  file?: string;
  line?: number;
  column?: number;
  message: string;
  stack?: string;
  code?: string;
  suggestion?: string;
}

export class ErrorOverlay {
  static generateHTML(error: DevError): string {
    const codePreview = error.code
      ? this.generateCodePreview(error.code, error.line || 0)
      : '';

    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Error - Pulse Dev Server</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, monospace;
      background: #1a1a1a;
      color: #e0e0e0;
      line-height: 1.6;
    }
    .error-container {
      max-width: 1200px;
      margin: 0 auto;
      padding: 40px 20px;
    }
    .error-header {
      background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);
      padding: 30px;
      border-radius: 12px;
      margin-bottom: 30px;
      box-shadow: 0 10px 40px rgba(239, 68, 68, 0.3);
    }
    .error-type {
      font-size: 14px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 1px;
      opacity: 0.9;
      margin-bottom: 10px;
    }
    .error-message {
      font-size: 24px;
      font-weight: 600;
      margin-bottom: 15px;
      line-height: 1.4;
    }
    .error-location {
      font-size: 14px;
      opacity: 0.8;
      display: flex;
      align-items: center;
      gap: 10px;
    }
    .file-icon {
      display: inline-block;
      width: 16px;
      height: 16px;
      background: rgba(255, 255, 255, 0.2);
      border-radius: 3px;
    }
    .code-preview {
      background: #0d1117;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 30px;
      border: 1px solid #30363d;
      overflow-x: auto;
    }
    .code-title {
      font-size: 12px;
      color: #8b949e;
      margin-bottom: 15px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .code-lines {
      font-size: 14px;
      line-height: 1.8;
    }
    .code-line {
      display: flex;
      gap: 20px;
    }
    .line-number {
      color: #6e7681;
      user-select: none;
      text-align: right;
      min-width: 40px;
      flex-shrink: 0;
    }
    .line-content {
      flex: 1;
      white-space: pre;
    }
    .error-line {
      background: rgba(239, 68, 68, 0.1);
      border-left: 3px solid #ef4444;
      margin-left: -10px;
      padding-left: 7px;
    }
    .error-line .line-number {
      color: #ef4444;
      font-weight: 600;
    }
    .stack-trace {
      background: #0d1117;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 30px;
      border: 1px solid #30363d;
    }
    .stack-title {
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 15px;
      color: #8b949e;
    }
    .stack-content {
      font-size: 13px;
      color: #c9d1d9;
      white-space: pre-wrap;
      line-height: 1.8;
    }
    .suggestion-box {
      background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%);
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 30px;
    }
    .suggestion-title {
      font-size: 14px;
      font-weight: 600;
      margin-bottom: 10px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .suggestion-icon {
      font-size: 20px;
    }
    .suggestion-text {
      font-size: 14px;
      line-height: 1.6;
      opacity: 0.95;
    }
    .footer {
      text-align: center;
      color: #6e7681;
      font-size: 13px;
      padding: 20px;
      border-top: 1px solid #30363d;
    }
    .pulse-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: #6b46c1;
      padding: 4px 12px;
      border-radius: 20px;
      font-size: 12px;
      font-weight: 600;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    .pulse-icon {
      width: 6px;
      height: 6px;
      background: #fff;
      border-radius: 50%;
      animation: pulse 2s ease-in-out infinite;
    }
  </style>
</head>
<body>
  <div class="error-container">
    <div class="error-header">
      <div class="error-type">${error.type} Error</div>
      <div class="error-message">${this.escapeHTML(error.message)}</div>
      ${error.file
        ? `
        <div class="error-location">
          <span class="file-icon"></span>
          <span>${error.file}${error.line ? `:${error.line}${error.column ? `:${error.column}` : ''}` : ''}</span>
        </div>
      `
        : ''
      }
    </div>

    ${codePreview
        ? `
      <div class="code-preview">
        <div class="code-title">
          <span>📄</span>
          <span>${error.file || 'Source'}</span>
        </div>
        <div class="code-lines">${codePreview}</div>
      </div>
    `
        : ''
      }

    ${error.suggestion
        ? `
      <div class="suggestion-box">
        <div class="suggestion-title">
          <span class="suggestion-icon">💡</span>
          <span>Suggestion</span>
        </div>
        <div class="suggestion-text">${this.escapeHTML(error.suggestion)}</div>
      </div>
    `
        : ''
      }

    ${error.stack
        ? `
      <div class="stack-trace">
        <div class="stack-title">Stack Trace</div>
        <div class="stack-content">${this.escapeHTML(error.stack)}</div>
      </div>
    `
        : ''
      }

    <div class="footer">
      <div class="pulse-badge">
        <span class="pulse-icon"></span>
        <span>Pulse v0.12.0 Dev Server</span>
      </div>
      <p style="margin-top: 10px;">Fix the error above and the page will automatically reload</p>
    </div>
  </div>
</body>
</html>
    `;
  }

  private static generateCodePreview(code: string, errorLine: number): string {
    const lines = code.split('\n');
    const start = Math.max(0, errorLine - 3);
    const end = Math.min(lines.length, errorLine + 3);

    let preview = '';
    for (let i = start; i < end; i++) {
      const lineNum = i + 1;
      const isError = lineNum === errorLine;
      const lineClass = isError ? 'code-line error-line' : 'code-line';

      preview += `
        <div class="${lineClass}">
          <span class="line-number">${lineNum}</span>
          <span class="line-content">${this.escapeHTML(lines[i] || '')}</span>
        </div>
      `;
    }

    return preview;
  }

  private static escapeHTML(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
