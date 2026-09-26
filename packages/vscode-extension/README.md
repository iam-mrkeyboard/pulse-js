# ⚡ Pulse Framework VS Code Extension

**Professional tooling for the Pulse Framework.**  
Powered by a custom **Language Server Protocol (LSP)** implementation, this extension provides rich language support including semantic validation, intelligent completions, real-time diagnostics, and automatic code formatting for `.pulse` files.

![Pulse Framework](images/icon.png)

---

## ✨ Features

### 🧠 Intelligent Autocomplete

- **HTML & Components**: Context-aware suggestions for HTML tags, custom components, and attributes
- **JavaScript Integration**: Auto-complete for declared variables (`let`, `const`, `function`) and global objects (`console`, `window`) inside `<script>` blocks and `{expressions}`
- **Event Handlers**: Smart templates for `onClick`, `onInput`, and other event handlers
- **Import Suggestions**: Intelligent path completions for component imports

### 🛡️ Semantic Validation

Unlike basic regex-based plugins, Pulse uses a dedicated **Language Server** powered by Tree-sitter to deeply understand your code:

- **Scope Analysis**: Detects usage of undefined variables in real-time
- **State Safety**: Warns when reactive state is used incorrectly
- **Tag Integrity**: Validates HTML structure, detects unclosed tags and mismatched elements
- **Type Awareness**: Understands the difference between reactive state and regular variables
- **Non-Blocking**: All analysis happens in a background process for smooth editing

### 📝 Automatic Code Formatting

- **Format on Save**: Automatically formats your code when you save (configurable)
- **Smart Indentation**: Proper nesting for HTML, JavaScript, and CSS blocks
- **Consistent Spacing**: Removes unnecessary blank lines while maintaining readability
- **Preserves Intent**: Respects your code structure while applying consistent style

### 🎨 Advanced Syntax Highlighting

- Full syntax support for Pulse's unique blend of HTML, CSS, and JavaScript
- Distinguishes between reactive state (`state.count`) and local variables
- Embedded CSS highlighting in `<style>` blocks with class name validation
- JSX-like expression highlighting inside `{curly braces}`

### 🔍 Go to Definition

- Jump to component definitions with `Ctrl+Click` or `F12`
- Navigate to imported modules and dependencies
- Quick peek at definitions with `Alt+F12`

### 💡 Hover Information

- Rich tooltips showing variable types, function signatures, and component props
- Documentation previews for built-in APIs
- Quick insights without leaving your current context

---

## 🚀 Getting Started

### Installation

**From VS Code Marketplace:**

1. Open VS Code
2. Go to Extensions (`Ctrl+Shift+X` / `Cmd+Shift+X`)
3. Search for "Pulse Framework"
4. Click **Install**

**From Source:**

```bash
git clone https://github.com/iam-mrkeyboard/pulse-js
cd pulse-js/packages/vscode-extension
bun install            # this folder has its own bun.lock (not a root workspace)
bun run compile
bunx @vscode/vsce package
code --install-extension pulse-framework-*.vsix
```

### First Steps

1. **Create a new Pulse file** with the `.pulse` extension
2. **Start typing** - autocomplete and diagnostics work immediately
3. **Save the file** (`Ctrl+S` / `Cmd+S`) - automatic formatting applies

---

## 💻 Usage Examples

### Real-time Diagnostics

Errors and warnings appear instantly as you type:

```pulse
<script>
  const count = 0;
</script>

<div>
  <span>Value: {counter}</span>
  <!-- ❌ Error: Undefined variable 'counter'. Did you mean 'count'? -->
</div>
```

### Smart Completions

Type `<` to see available tags, or `{` inside markup to access variables:

```pulse
<script>
  import Button from './components/Button.pulse';
  let userName = 'John';
  const greeting = () => `Hello, ${userName}!`;
</script>

<div>
  <h1>{gre|}</h1>  <!-- 'greeting' auto-suggested -->
  <Button />        <!-- Component completion -->
</div>
```

### Automatic Formatting

Before save:

```pulse
<div><span>Unformatted</span>
<p>Text</p></div>
```

After save (with format on save enabled):

```pulse
<div>
  <span>Unformatted</span>
  <p>Text</p>
</div>
```

---

## ⚙️ Configuration

### Recommended Settings

Add these to your VS Code `settings.json` for the best experience:

```json
{
  // Enable format on save for Pulse files
  "[pulse]": {
    "editor.formatOnSave": true,
    "editor.defaultFormatter": "pulse.pulse-language"
  },

  // Pulse-specific settings
  "pulse.diagnostics.enabled": true,
  "pulse.completion.enabled": true,
  "pulse.formatting.tabSize": 2,
  "pulse.formatting.removeExtraBlankLines": true,

  // Language server verbosity (for debugging)
  "pulse.trace.server": "off" // Options: "off", "messages", "verbose"
}
```

### Available Settings

| Setting                                  | Type    | Default | Description                       |
| ---------------------------------------- | ------- | ------- | --------------------------------- |
| `pulse.diagnostics.enabled`              | boolean | `true`  | Enable/disable error checking     |
| `pulse.completion.enabled`               | boolean | `true`  | Enable/disable autocomplete       |
| `pulse.formatting.tabSize`               | number  | `2`     | Number of spaces per indent level |
| `pulse.formatting.removeExtraBlankLines` | boolean | `true`  | Remove consecutive blank lines    |
| `pulse.trace.server`                     | string  | `"off"` | Log language server messages      |

---

## 🔧 Commands

Access these commands via the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):

| Command                          | Description                             |
| -------------------------------- | --------------------------------------- |
| `Pulse: Create Component`        | Scaffold a new reusable component       |
| `Pulse: Create Page`             | Scaffold a new page with layout imports |
| `Pulse: Restart Language Server` | Restart the LSP server if issues occur  |
| `Pulse: Format Document`         | Manually format the current file        |

---

## 🎯 Keyboard Shortcuts

| Shortcut      | Action               |
| ------------- | -------------------- |
| `Ctrl+Space`  | Trigger autocomplete |
| `Shift+Alt+F` | Format document      |
| `F12`         | Go to definition     |
| `Alt+F12`     | Peek definition      |
| `Shift+F12`   | Find all references  |

---

## 🐛 Troubleshooting

### Language Server Not Starting

1. Check the **Output** panel (View → Output → select "Pulse Language Server")
2. Look for initialization errors or Tree-sitter issues
3. Try restarting: `Ctrl+Shift+P` → "Pulse: Restart Language Server"

### Formatting Not Working

1. Ensure format on save is enabled: `"editor.formatOnSave": true`
2. Check that Pulse is the default formatter: `"[pulse]": { "editor.defaultFormatter": "pulse.pulse-language" }`
3. Manually format with `Shift+Alt+F` to test

### Autocomplete Not Appearing

1. Verify `pulse.completion.enabled` is `true` in settings
2. Check that you're inside a `.pulse` file
3. Try triggering manually with `Ctrl+Space`

### Performance Issues

- Disable verbose logging: `"pulse.trace.server": "off"`
- For large files, consider temporarily disabling real-time diagnostics

---

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](../../CONTRIBUTING.md) for details.

### Development Setup

```bash
git clone https://github.com/iam-mrkeyboard/pulse-js
cd pulse-js/packages/vscode-extension
bun install
bun run watch  # Compiles on file changes
```

Press `F5` in VS Code to launch the extension in debug mode.

---

## 📚 Resources

- 📖 [Pulse Documentation](https://pulse-framework.com/docs)
- 💬 [Discord Community](https://discord.gg/pulse)
- 🐛 [Issue Tracker](https://github.com/pulse-framework/vscode-extension/issues)
- 📝 [Changelog](CHANGELOG.md)

---

## 📄 License

MIT © Pulse Framework Team

---

## ⭐ Show Your Support

If this extension improves your workflow, please consider:

- ⭐ Starring the [GitHub repository](https://github.com/pulse-framework/vscode-extension)
- 📝 Writing a review on the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=pulse.pulse-language)
- 🐦 Sharing with the community

**Happy coding with Pulse!** ⚡
