# ⚡ Pulse

**The Fastest Web Framework** — 0-1.2KB runtime with fine-grained reactivity and islands architecture.

[![Version](https://img.shields.io/badge/version-0.13.0-blue.svg)](https://github.com/ibrahimkeyboad/pulse-js)
[![Bun](https://img.shields.io/badge/Bun-Native-black.svg)](https://bun.sh)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

Pulse is a modern web framework built from the ground up for speed. It combines the developer experience of signals-based reactivity with the performance of islands architecture and a runtime so small it's practically invisible.

---

## ✨ Key Features

- 📦 **Invisible Runtime**: Core runtime is just **0.8KB** gzipped.
- 🏝️ **Islands Architecture**: Ship zero JavaScript by default; hydrate only what's interactive.
- 🎯 **Fine-Grained Reactivity**: Signal-based state management for surgical DOM updates without a Virtual DOM.
- ⚡ **Bun-Native**: Built to leverage the full power of the Bun runtime for sub-100ms HMR and blazing fast SSR.
- 🎨 **Scoped Styling**: Built-in CSS scoping for component-level styles.
- 🔒 **Secure by Design**: AST-based compilation that avoids `eval()` and `new Function()`.

---

## 🏝️ Architecture: Why Pulse?

Most frameworks ship a massive JavaScript bundle to every user, even for static pages. Pulse uses **Islands Architecture**, meaning:
1. **HTML First**: Your pages are rendered as static HTML on the server.
2. **Selective Hydration**: Only components marked as interactive ("islands") are hydrated on the client.
3. **Zero Overhead**: If a page has no interactive components, it ships **zero** JavaScript to the user.

---

## 🚀 Quick Start

Get a new Pulse project up and running in seconds:

```bash
# Create a new project
bun create pulse my-app

# Navigate to the directory
cd my-app

# Start the development server
bun run dev
```

### Simple Component Example

```html
<script>
  const [count, setCount] = createSignal(0);
  const doubled = createMemo(() => count * 2);
</script>

<div class="counter">
  <h2>Count: {count}</h2>
  <p>Doubled: {doubled}</p>
  <button onClick={() => setCount(c => c + 1)}>
    Increment
  </button>
</div>

<style>
  .counter {
    padding: 2rem;
    text-align: center;
  }
</style>
```

---

## 📊 Comparison

| Feature | Pulse | React | Vue | Svelte |
| :--- | :---: | :---: | :---: | :---: |
| **Runtime Size** | **~0.8KB** | 42KB | 34KB | 2KB |
| **Reactivity** | **Signals** | VDOM | Proxy | Compiler |
| **Bun Native** | **✓ Yes** | ✗ | ✗ | ✗ |
| **Islands** | **✓ Built-in** | ✗ | ✗ | ✗ |

---

## 🏗️ Project Structure

```text
├── extension/          # VS Code Extension for Pulse
├── pulse-framework/    # Core framework & compiler
└── pulse-app/          # Example/Starter application
```

---

## 🗺️ Roadmap

- [x] Core Signal Reactivity
- [x] Islands Architecture Hydration
- [x] Scoped CSS Support
- [ ] Pulse DevTools Browser Extension
- [ ] Integrated Pulse Store for Global State
- [ ] Native Mobile Support via Pulse Bridge

## 🤝 Contributing

Contributions are welcome! Please check our [Contributing Guide](CONTRIBUTING.md) to get started.

## 📄 License

Pulse is [MIT Licensed](LICENSE).
