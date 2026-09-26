# ⚡ Pulse

**A Bun-native web framework** with fine-grained signal reactivity and islands architecture.

[![Version](https://img.shields.io/badge/version-0.16.0-blue.svg)](https://github.com/iam-mrkeyboard/pulse-js)
[![CI](https://github.com/iam-mrkeyboard/pulse-js/actions/workflows/ci.yml/badge.svg)](https://github.com/iam-mrkeyboard/pulse-js/actions/workflows/ci.yml)
[![Bun](https://img.shields.io/badge/Bun-Native-black.svg)](https://bun.sh)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

## Status

Pulse is **pre-1.0**. Public APIs may change between minor versions. See [CHANGELOG.md](CHANGELOG.md) and [ROADMAP.md](ROADMAP.md).

**Runtime size (local measurement, 2026-09-26):** all client runtime modules (`core` + `dom` + `hydration` + SSR markers + `List`/`Show`) bundled into one file with `bun build --minify --target browser` (every export kept) are **18.0 KB** minified / **7.0 KB** gzip (`gzip -9`). A page only loads what it imports, and pages with no reactive code load **no JS at all**. Source lives in `packages/pulse/src/runtime`.

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

There is no `create-pulse` scaffolder yet. Work from this repository (Bun workspaces):

```bash
git clone https://github.com/iam-mrkeyboard/pulse-js.git
cd pulse-js
bun install            # installs every workspace
bun run build:pulse    # builds packages/pulse (CLI + library + runtime)
bun run dev            # docs site (apps/docs) on http://localhost:3000
```

Start your own app from [`examples/counter`](examples/counter): copy the folder, keep
`"pulse": "workspace:*"` inside this repo (or depend on a built `pulse` package), then
`bun run dev` / `bun run build`.

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

## 🏗️ Repository layout

A Bun-workspaces monorepo, organized like `sveltejs/svelte` (one framework package with
subpath exports) with the tooling split out the way `solidjs/solid` and `vuejs/core` do:

```text
├── packages/
│   ├── pulse/               # the framework: runtime, compiler, dev server, build, CLI  → npm "pulse"
│   └── vscode-extension/    # VS Code extension (own bun.lock + vsce, own version, not a root workspace)
├── apps/
│   └── docs/                # documentation / showcase site, built with Pulse
├── examples/
│   └── counter/             # minimal app: static page (0 JS) + hydrated counter
├── benchmarks/
│   ├── js-framework-benchmark/  # Pulse keyed implementation for krausest/js-framework-benchmark
│   └── micro/               # headless-Chrome microbenchmarks (signals, List, hydrate vs remount)
├── .github/                 # CI (see .github/ci-workflow.yml), issue & PR templates
├── package.json             # workspaces + root scripts (build, test, typecheck, dev, bench)
├── tsconfig.base.json       # shared compiler options
└── bunfig.toml              # `bun test` at the root runs the framework suite
```

| Import | What it is |
|--------|------------|
| `pulse` | build API (`build`, `PulseBundler`, `createDefaultConfig`), compiler, runtime re-exports, dev server |
| `pulse/runtime` | signals: `createSignal`, `createEffect`, `createMemo`, `batch`, … |
| `pulse/runtime/dom`, `pulse/runtime/list`, `pulse/runtime/show`, `pulse/runtime/hydration` | DOM helpers, `List`, `Show`, hydration |
| `pulse/compiler` | `.pulse` single-file-component compiler (`ComponentCompiler`, `TemplateTransformer`) |
| `pulse/cli` | the `pulse` CLI (`pulse dev`, `pulse build`, `pulse preview`, `pulse analyze`) |

Root scripts: `bun run build` (framework → docs → examples), `bun test`, `bun run typecheck`,
`bun run dev`, `bun run bench`.

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

[MIT](LICENSE)
