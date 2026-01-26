# ⚡ Pulse Framework VS Code Extension

**Professional tooling for the Pulse Framework.** 
Powered by a custom **Language Server (LSP)**, this extension provides rich language support including semantic validation, intelligent completions, and real-time diagnostics for `.pulse` files.

![Pulse Framework](images/icon.png)

## ✨ Features

### 🧠 Intelligent Autocomplete
*   **HTML & Components**: Context-aware suggestions for HTML tags, custom components, and attributes.
*   **JavaScript Integration**: Auto-complete declared variables (`let`, `const`, `function`) and global objects (`console`, `window`) inside `<script>` and `{expressions}`.
*   **Event Handlers**: Smart templates for `onClick`, `onInput` and other events.

### 🛡️ Semantic Validation
Unlike basic regex-based plugins, Pulse uses a dedicated **Language Server** to understand your code structure:
*   **Scope Analysis**: Detects usage of undefined variables.
*   **State Safety**: Warns when reactive state is used incorrectly.
*   **Tag Integrity**: Validates structure, unclosed tags, and mismatched elements.
*   **Non-Blocking**: All analysis happens in a background process, ensuring a smooth typing experience.

### 🎨 Modern Syntax Highlighting
*   Full syntax support for Pulse's unique blend of HTML, CSS, and JS.
*   Distinguishes between Reactive State (`state.count`) and local variables.
*   Embedded CSS highlighting in `<style>` blocks.

## 🚀 Usage

### Real-time Diagnostics
Errors and warnings appear Instantly as you type:
```pulse
<div>
  <span>Values: {missingVar}</span>
  <!-- ❌ Error: Undefined variable 'missingVar' -->
</div>
```

### Smart Completions
Type `<` to see available tags, or `{` to see available state variables.
```pulse
<script>
  let user = 'John';
  console.log(user); 
  // ^ 'user' and 'console' are suggested here
</script>
```

## ⚙️ Configuration

Customize the extension behavior in your VS Code settings (`settings.json`):

```json
{
  "pulse.diagnostics.enabled": true,
  "pulse.trace.server": "off"
}
```

## 🔧 Commands

*   `Pulse: Create Component` - Scaffolds a new reusable component.
*   `Pulse: Create Page` - Scaffolds a new page with layout imports.

## 📦 Installation

**From VS Code Marketplace:**
1.  Open VS Code.
2.  Go to Extensions (`Ctrl+Shift+X`).
3.  Search for "Pulse Framework".
4.  Click Install.

**From Source:**
```bash
git clone https://github.com/pulse-framework/vscode-extension
cd pulse-vscode-extension
npm install
npm run package
```

## 📄 License

MIT © Pulse Framework Team

