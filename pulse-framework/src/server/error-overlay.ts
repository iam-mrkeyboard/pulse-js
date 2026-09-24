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
  <title>Pulse Error</title>
  <style>
    :root {
      --bg: #0f0f13;
      --surface: #18181b;
      --surface-highlight: #27272a;
      --border: #3f3f46;
      --text: #e4e4e7;
      --text-dim: #a1a1aa;
      --accent: #8b5cf6;
      --accent-dim: rgba(139, 92, 246, 0.1);
      --error: #f43f5e;
      --error-dim: rgba(244, 63, 94, 0.1);
      --font-mono: 'SF Mono', Monaco, 'Cascadia Code', Consolas, monospace;
      --font-sans: -apple-system, BlinkMacSystemFont, 'Inter', 'Segoe UI', Roboto, sans-serif;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: var(--font-sans);
      background: var(--bg);
      color: var(--text);
      line-height: 1.5;
      height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background-image: 
        radial-gradient(circle at 15% 50%, rgba(139, 92, 246, 0.08), transparent 25%), 
        radial-gradient(circle at 85% 30%, rgba(244, 63, 94, 0.08), transparent 25%);
    }

    .glass-panel {
      background: rgba(24, 24, 27, 0.7);
      backdrop-filter: blur(20px);
      -webkit-backdrop-filter: blur(20px);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 16px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      width: 90%;
      max-width: 900px;
      max-height: 90vh;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      position: relative;
    }

    /* Scrollbar */
    ::-webkit-scrollbar { width: 8px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
    ::-webkit-scrollbar-thumb:hover { background: var(--text-dim); }

    .header {
      padding: 24px 32px;
      border-bottom: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      background: rgba(24, 24, 27, 0.95);
      position: sticky;
      top: 0;
      z-index: 10;
    }

    .error-title-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }

    .badge {
      display: inline-flex;
      align-items: center;
      padding: 4px 12px;
      border-radius: 99px;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      width: fit-content;
    }

    .badge-error {
      background: var(--error-dim);
      color: var(--error);
      border: 1px solid rgba(244, 63, 94, 0.2);
    }

    .badge-pulse {
      background: var(--accent-dim);
      color: var(--accent);
      border: 1px solid rgba(139, 92, 246, 0.2);
    }

    h1 {
      font-size: 24px;
      font-weight: 700;
      color: var(--text);
      letter-spacing: -0.025em;
    }

    .location {
      font-family: var(--font-mono);
      font-size: 13px;
      color: var(--text-dim);
      margin-top: 4px;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .location-icon { opacity: 0.6; }

    .content {
      padding: 32px;
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    .suggestion {
      background: linear-gradient(to right, rgba(59, 130, 246, 0.1), rgba(37, 99, 235, 0.05));
      border: 1px solid rgba(59, 130, 246, 0.2);
      padding: 16px 20px;
      border-radius: 8px;
      display: flex;
      gap: 12px;
      align-items: flex-start;
    }

    .suggestion-icon { font-size: 18px; margin-top: 1px; }
    
    .suggestion-content {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .suggestion-label {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      color: #60a5fa;
      letter-spacing: 0.05em;
    }

    .suggestion-text {
      font-size: 14px;
      color: #e0f2fe;
    }

    .section-title {
      font-size: 12px;
      font-weight: 600;
      text-transform: uppercase;
      color: var(--text-dim);
      letter-spacing: 0.05em;
      margin-bottom: 12px;
    }

    .code-block {
      background: #09090b;
      border: 1px solid var(--border);
      border-radius: 8px;
      overflow: hidden;
      font-family: var(--font-mono);
      font-size: 13px;
    }

    .code-line {
      display: flex;
      padding: 2px 0;
    }

    .code-line.error {
      background: rgba(244, 63, 94, 0.15);
    }

    .line-num {
      width: 48px;
      text-align: right;
      padding-right: 16px;
      color: #52525b;
      user-select: none;
      border-right: 1px solid var(--border);
    }

    .code-line.error .line-num {
      color: var(--error);
      border-right-color: rgba(244, 63, 94, 0.3);
    }

    .line-content {
      padding-left: 16px;
      color: var(--text);
      white-space: pre;
    }
    
    .stack-trace {
      background: #09090b;
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px;
      font-family: var(--font-mono);
      font-size: 12px;
      color: var(--text-dim);
      white-space: pre-wrap;
      overflow-x: auto;
      max-height: 200px;
      overflow-y: auto;
    }

    .footer {
      padding: 20px 32px;
      border-top: 1px solid var(--border);
      background: rgba(24, 24, 27, 0.5);
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 13px;
      color: var(--text-dim);
    }

    .reload-hint {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .key {
      background: var(--surface-highlight);
      border: 1px solid var(--border);
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 11px;
      font-family: var(--font-mono);
      color: var(--text);
    }
  </style>
</head>
<body>
  <div class="glass-panel">
    <div class="header">
      <div class="error-title-group">
        <span class="badge badge-error">${error.type || 'Runtime'} Error</span>
        <h1>${this.escapeHTML(error.message)}</h1>
        ${error.file ? `
          <div class="location">
            <span class="location-icon">📄</span>
            ${error.file}${error.line ? `:${error.line}` : ''}
          </div>
        ` : ''}
      </div>
    </div>

    <div class="content">
      ${error.suggestion ? `
        <div class="suggestion">
          <span class="suggestion-icon">💡</span>
          <div class="suggestion-content">
            <span class="suggestion-label">Suggested Fix</span>
            <span class="suggestion-text">${this.escapeHTML(error.suggestion)}</span>
          </div>
        </div>
      ` : ''}

      ${codePreview ? `
        <div>
          <div class="section-title">Source Context</div>
          <div class="code-block">
            ${codePreview}
          </div>
        </div>
      ` : ''}

      ${error.stack ? `
        <div>
          <div class="section-title">Stack Trace</div>
          <div class="stack-trace">${this.escapeHTML(error.stack)}</div>
        </div>
      ` : ''}
    </div>

    <div class="footer">
      <div class="badge badge-pulse">Pulse v0.15.0</div>
      <div class="reload-hint">
        Edit file to reload automatically
      </div>
    </div>
  </div>
  <script>
    // Auto-reload logic could go here
    const ws = new WebSocket('ws://' + window.location.host + '/__pulse_hmr');
    ws.onmessage = (msg) => {
        try {
            const data = JSON.parse(msg.data);
            if(data.type === 'full-reload') window.location.reload();
        } catch(e){}
    };
  </script>
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
      const lineClass = isError ? 'code-line error' : 'code-line';

      preview += `
        <div class="${lineClass}">
          <span class="line-num">${lineNum}</span>
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
