# ⚡ Pulse

**A Bun-native web framework** with fine-grained signal reactivity and islands architecture.

[![Version](https://img.shields.io/badge/version-0.16.0-blue.svg)](https://github.com/iam-mrkeyboard/pulse-js)
[![CI](https://github.com/iam-mrkeyboard/pulse-js/actions/workflows/ci.yml/badge.svg)](https://github.com/iam-mrkeyboard/pulse-js/actions/workflows/ci.yml)
[![Bun](https://img.shields.io/badge/Bun-Native-black.svg)](https://bun.sh)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

## Status

Pulse is **pre-1.0**. Public APIs may change between minor versions. See [CHANGELOG.md](CHANGELOG.md) and [ROADMAP.md](ROADMAP.md).

**Runtime size (local measurement, 2026-09-24):** client runtime modules (`core` + `dom` + `hydration` + `error-boundary` + `List`/`Show` + SSR markers) build to about **14 KB** minified / **~5.5 KB** gzip (`bun build --minify` + `gzip -9`). Source under `pulse-framework/src/runtime` is ~36–41 KB before minify. Older README claims of “0–1.2KB” / “0.8KB” were **not verified** and have been removed; re-measure after further tree-shaking.

---

## ✨ Key Features

- 🏝️ **Islands Architecture** — Ship static HTML by default; hydrate interactive islands.
- 🎯 **Fine-Grained Reactivity** — Signal-based updates without a Virtual DOM.
- ⚡ **Bun-Native** — Dev server, bundler, and tests on Bun.
- 🎨 **Scoped Styling** — Component-level CSS scoping built in.
- 💧 **Adopt-and-bind hydration** — Reuse SSR DOM with `data-p-*` markers (v0.16).
- 🔒 **Hardened bindings** — Expression eval via `safeEvalExpr`; error UI uses `textContent` (not `innerHTML`).

---

## 🏝️ Architecture: Why Pulse?

Most frameworks ship a large JavaScript bundle even for mostly static pages. Pulse uses **Islands Architecture**:

1. **HTML First** — Pages render as static HTML on the server.
2. **Selective Hydration** — Only interactive islands hydrate on the client.
3. **Minimal client JS** — No islands means little or no framework JS for that page.

---

## 🚀 Quick Start

```bash
# Create a new project
bun create pulse my-app

cd my-app
bun run dev
```

### Simple Component Example

```html
<script>
  const [count, setCount] = createSignal(0);
  const doubled = createMemo(() => count() * 2);
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

## 🏗️ Project Structure

```text
├── extension/          # VS Code Extension for Pulse (v1.5.0 — separate cadence)
├── pulse-framework/    # Core framework & compiler (v0.16.0)
├── pulse-app/          # Docs / example application (v0.16.0)
└── bench/              # Local HeadlessChrome microbenchmarks
```

---

## 📚 Docs & community

- [CHANGELOG.md](CHANGELOG.md) — release history
- [ROADMAP.md](ROADMAP.md) — Now / Next / Later
- [CONTRIBUTING.md](CONTRIBUTING.md) — setup, tests, Conventional Commits, PRs
- [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- [SECURITY.md](SECURITY.md) — private vulnerability reporting

## 🤝 Contributing

Contributions are welcome! Please read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a PR.

## 📄 License

`package.json` declares **MIT**, but **no `LICENSE` file is present in the repository yet**. The maintainer should add an MIT license text file (or correct the license field) before publishing packages.
