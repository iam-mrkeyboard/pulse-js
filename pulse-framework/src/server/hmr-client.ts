// ============================================================================
// FILE: src/server/runtime/hmr-client.ts
// Extracted from dev-server.ts - HMR client code generation
// ============================================================================

import type { PulseConfig } from '../../bundler/types';

/**
 * Generates the HMR client JavaScript that runs in the browser
 */
export function generateHMRClientScript(): string {
  return [
    '// Pulse HMR Client v0.11.0',
    '(function() {',
    '  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";',
    '  const ws = new WebSocket(protocol + "//" + window.location.host + "/__pulse_hmr");',
    '  let overlay = null;',
    '  const hotModules = new Map();',
    '',
    '  ws.onopen = () => {',
    '    console.log("%c⚡ Pulse HMR Connected", "color: #6b46c1; font-weight: bold;");',
    '  };',
    '',
    '  ws.onmessage = async (event) => {',
    '    try {',
    '      const data = JSON.parse(event.data);',
    '      switch (data.type) {',
    '        case "connected":',
    '          console.log("%c✓ Connected to dev server", "color: #10b981;");',
    '          break;',
    '        case "full-reload":',
    '          console.log("%c🔄 Reloading page...", "color: #3b82f6;");',
    '          removeOverlay();',
    '          window.location.reload();',
    '          break;',
    '        case "css-update":',
    '          console.log("%c🎨 CSS updated: " + data.path, "color: #8b5cf6;");',
    '          updateCSS(data.path);',
    '          break;',
    '        case "hot-update":',
    '          console.log("%c🔥 Hot updating components...", "color: #f59e0b;");',
    '          await hotUpdateComponents(data.modules);',
    '          break;',
    '        case "js-update":',
    '          console.log("%c⚡ JS updated: " + data.path, "color: #f59e0b;");',
    '          window.location.reload();',
    '          break;',
    '        case "error":',
    '          console.error("%c❌ Build error", "color: #ef4444;", data.error);',
    '          showOverlay(data.error);',
    '          break;',
    '        case "clear-error":',
    '          removeOverlay();',
    '          break;',
    '      }',
    '    } catch (err) {',
    '      console.error("HMR message error:", err);',
    '    }',
    '  };',
    '',
    '  ws.onerror = () => {',
    '    console.warn("%c⚠️  HMR connection error", "color: #f59e0b;");',
    '  };',
    '',
    '  ws.onclose = () => {',
    '    console.log("%c🔌 HMR disconnected", "color: #6b7280;");',
    '    setTimeout(() => {',
    '      console.log("%c🔄 Attempting to reconnect...", "color: #3b82f6;");',
    '      window.location.reload();',
    '    }, 1000);',
    '  };',
    '',
    '  async function hotUpdateComponents(modules) {',
    '    if (!modules || !Array.isArray(modules)) return;',
    '    for (const module of modules) {',
    '      try {',
    '        const updated = await import("/__modules/" + module.file + "?t=" + Date.now());',
    '        const elements = document.querySelectorAll("[data-component=\\"" + module.id + "\\"]");',
    '        elements.forEach(el => {',
    '          const props = el.__pulseProps || {};',
    '          const newElement = updated.default(props);',
    '          if (newElement instanceof HTMLElement) {',
    '            el.replaceWith(newElement);',
    '            newElement.__pulseProps = props;',
    '            newElement.setAttribute("data-component", module.id);',
    '          }',
    '        });',
    '        console.log("%c✓ Hot updated: " + module.file, "color: #10b981;");',
    '      } catch (err) {',
    '        console.error("%c✗ Hot update failed: " + module.file, "color: #ef4444;", err);',
    '        window.location.reload();',
    '      }',
    '    }',
    '  }',
    '',
    '  function updateCSS(path) {',
    '    const links = document.querySelectorAll("link[rel=\\"stylesheet\\"]");',
    '    links.forEach(link => {',
    '      if (link.href.includes(path)) {',
    '        const newLink = link.cloneNode();',
    '        newLink.href = link.href.split("?")[0] + "?t=" + Date.now();',
    '        newLink.onload = () => link.remove();',
    '        link.parentNode.insertBefore(newLink, link.nextSibling);',
    '      }',
    '    });',
    '  }',
    '',
    '  function showOverlay(err) {',
    '    removeOverlay();',
    '    const errorData = err || { message: "Unknown error", file: "" };',
    '    overlay = document.createElement("div");',
    '    overlay.id = "__pulse_error_overlay";',
    '    overlay.style.cssText = "position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.9);z-index:999999;overflow:auto;font-family:monospace;color:white;padding:40px;box-sizing:border-box;";',
    '    const content = document.createElement("div");',
    '    content.style.cssText = "max-width:900px;margin:0 auto;";',
    '    const header = document.createElement("div");',
    '    header.style.cssText = "background:linear-gradient(135deg,#ef4444,#dc2626);padding:20px;border-radius:8px;margin-bottom:20px;";',
    '    const __h1 = document.createElement("h1"); __h1.style.cssText = "margin:0 0 10px 0;font-size:24px;"; __h1.textContent = "⚠️ Build Error";',
  '    const __p = document.createElement("p"); __p.style.cssText = "margin:0;font-size:14px;opacity:0.9;"; __p.textContent = errorData.file || "Unknown file";',
  '    header.replaceChildren(__h1, __p);',
    '    const messageBox = document.createElement("div");',
    '    messageBox.style.cssText = "background:#1a1a1a;padding:20px;border-radius:8px;white-space:pre-wrap;font-size:14px;line-height:1.6;";',
    '    messageBox.textContent = errorData.message;',
    '    content.appendChild(header);',
    '    content.appendChild(messageBox);',
    '    if (errorData.stack) {',
    '      const stackBox = document.createElement("div");',
    '      stackBox.style.cssText = "background:#1a1a1a;padding:20px;border-radius:8px;margin-top:20px;font-size:12px;opacity:0.7;white-space:pre-wrap;";',
    '      stackBox.textContent = errorData.stack;',
    '      content.appendChild(stackBox);',
    '    }',
    '    overlay.appendChild(content);',
    '    document.body.appendChild(overlay);',
    '  }',
    '',
    '  function removeOverlay() {',
    '    if (overlay && overlay.parentNode) {',
    '      overlay.parentNode.removeChild(overlay);',
    '      overlay = null;',
    '    }',
    '  }',
    '',
    '  window.addEventListener("load", removeOverlay);',
    '',
    '  // Global Runtime Error Handling',
    '  window.addEventListener("error", (event) => {',
    '    const error = {',
    '      type: "runtime",',
    '      message: event.message,',
    '      file: event.filename,',
    '      line: event.lineno,',
    '      column: event.colno,',
    '      stack: event.error ? event.error.stack : null',
    '    };',
    '    showOverlay(error);',
    '  });',
    '',
    '  window.addEventListener("unhandledrejection", (event) => {',
    '    const error = {',
    '      type: "runtime",',
    '      message: "Unhandled Promise Rejection: " + (event.reason ? (event.reason.message || event.reason) : "Unknown"),',
    '      stack: event.reason ? event.reason.stack : null',
    '    };',
    '    showOverlay(error);',
    '  });',
    '',
    '  // Global helper for runtime to report errors',
    '  window.__pulse_report_error = showOverlay;',
    '})();',
  ].join('\n');
}

/**
 * Creates a Response object for the HMR client script
 */
export function serveHMRClient(): Response {
  try {
    const script = generateHMRClientScript();
    return new Response(script, {
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error: any) {
    console.error('Error generating HMR client:', error);
    return new Response(
      'console.error("Failed to load HMR client:", ' +
      JSON.stringify(error.message) +
      ');',
      {
        headers: { 'Content-Type': 'application/javascript; charset=utf-8' },
      },
    );
  }
}

/**
 * Returns the script tag to include HMR client in pages
 */
export function getHMRScript(config: PulseConfig): string {
  if (!config.devServer?.hmr) {
    return '';
  }
  return `<script type="module" src="/__pulse_client.js"></script>`;
}
