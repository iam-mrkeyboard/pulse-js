# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Historical entries for **v0.6.0–v0.15.0** are reconstructed from the project's own blog posts
(`pulse-app/src/pages/blog/`). Those versions were never tagged on GitHub.

## [Unreleased]

### Added

- `createSelector` and `createRoot` on the core runtime (Solid-style selected-row updates; List disposes row effects on remove).
- Longest-increasing-subsequence reorder in the keyed `List` middle range (after prefix/suffix skip).
- Production browser runtime files under `dist/runtime/` and `pulse/runtime` package exports.
- `dist/index.d.ts` emitted from `tsconfig.dts.json` so package `types`/`exports` resolve after build.
- Dev-only `console.warn` when `List` sees duplicate keys (Map reconcile keeps last; no production cost).
- List remounts a row when the key is unchanged but the item object identity changes (immutable plain-object updates).

### Fixed

- Row swap no longer `insertBefore`s the whole middle of the list.
- Empty list clear uses a bulk `replaceChildren` path.
- List item `class` / attribute bindings stay on the item instead of being hoisted.
- Compiled SFCs import `pulse/runtime` instead of `/runtime/*.js`.
- `RuntimeBuilder` emits a non-empty production runtime (path + TS transpile).
- Script transform skips locally shadowed state names (`const data` inside `buildData`).
- `pulse-app` depends on `file:../pulse-framework` (Bun `link:` failed against package name `pulse`).
- Dev server imports and serves real `hydrate` (`/runtime/hydration.js` + allowlist).
- Nested template-literal class attributes (`class={\`btn btn-${x}\`}`) emit valid JS; docs minify with terser.
- Template-transformer no longer uses `new Function` (shared `safeEval`); `tsc --noEmit` clean after import-path fixes.
- Hygiene: untracked extension `out/`, framework `dist/`, logs, duplicate wasm; `.gitignore` updated.

### Performance notes

- Measured and **rejected**: clear via `textContent=''` (slower than `replaceChildren`); merging label+select into one effect (select ~3× worse).
- Same-run jsfb CPU (Chrome 151, count 10): Pulse/vanilla geom mean **~1.16** (afternoon Chrome 153 was ~1.17).


---

## [0.16.0] - 2026-09-24

### Added

- Adopt-and-bind hydration: client adopts SSR DOM via `data-p-h` / `data-p-key` / `data-p-list` / `data-p-show` markers instead of remounting with `replaceWith` (PR #3).
- `hydrate(Component, target)` preserves matching SSR roots; List/Show host mode keeps hosts in place and adopts keyed children.
- `renderToString` marks hydratable roots for tests / light SSR.
- Hydration mismatch fallback with `onMismatch` and a dev `console.warn` when the SSR root is missing.
- Shared SFC compiler at `src/compiler` (server `ComponentCompiler`; bundler interactive path delegates) (PR #1 / #2).
- Keyed `<List>` reconcile with common prefix/suffix + Map reuse; explicit `key` wiring through transformer and mount (PR #1 / #2).
- Headless Chromium microbenchmark harness under `bench/` with recorded local results (PR #1 / #2 / #3).
- Project hygiene: `CHANGELOG.md`, `ROADMAP.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md`, GitHub issue/PR templates, and CI workflow.
- Blog post for v0.16.0 on the docs site.

### Changed

- Restructured framework layout kept as source of truth: flattened `server/`, richer `runtime/` (batch / onCleanup / memo), bundler additions (`unified-parser`, `validator`, `safe-compiler`, …), `dev/` tools, `llm/` introspector (PR #2).
- State façade exposes getters **and** setters so `state.count++` / assignment work; text bindings wrap with `String(...)` and run inside effects (PR #1 / #2).
- FLIP list animations are **opt-in** via `flip: true` (PR #2).
- pulse-framework and pulse-app versions aligned at **0.16.0**. VS Code extension remains on **1.5.0** (no code changes in this release).
- README size claims updated to measured minified+gzip figures (see README); prior “0–1.2KB” / “0.8KB” claims removed.

### Fixed

- Bare leading script-less SFCs peeled correctly in `unified-parser` `splitSections` (PR #1 / #2).
- Safer expression evaluation via `safeEvalExpr` (replaces raw per-evaluation `new Function` call sites) (PR #1 / #2).
- Error-boundary and HMR error UI use `textContent` / DOM APIs instead of HTML injection (PR #1 / #2).
- `errors-v2` → `errors` import fix in `dev/auto-fixer.ts`, `dev/error-overlay-v2.ts`, and `test_dev_tools.ts` (PR #2).
- Delegated events and effect-wrapped text bindings for reactive updates (PR #1 / #2).

### Security

- Error UI no longer injects HTML via `innerHTML` for boundary / overlay messages (PR #1 / #2).
- Expression eval hardened behind `safeEvalExpr` with a stricter scope (PR #1 / #2).

### Removed

- Superseded bundler copies deleted after restructure: `src/bundler/runtime/dom.ts`, `src/bundler/runtime/primitives/list.ts` (PR #2).

### Local measurements (not public benchmark claims)

From `bench/RESULTS.md` on HeadlessChrome via Puppeteer:

| Case | Median |
|------|--------|
| hydrate_1k keyed rows (SSR already in DOM) | ~0.2 ms |
| remount_1k keyed rows | ~1.0 ms |
| List append_1k (prefix/suffix+Map) | ~2.6–2.7 ms |
| List append_1k (always-insertBefore) | ~5.4–5.9 ms |

---

## [0.15.0] - 2026-02-06

Reconstructed from blog post *Pulse v0.15.0 Released* (“The Performance Update”).

### Added

- Functional, tree-shakable core runtime (blog: ~4kB gzip vs ~20kB in v0.14).
- Reactivity V2 with automatic dependency tracking and a microtask-based smart scheduler.
- Template cloning DOM engine (`<template>` + path walking with pre-computed integer paths).
- LLM Component Introspector generating deterministic semantic models.
- Redesigned error overlay (glassmorphism UI, suggestions, cleaner stack traces).

### Changed

- Core runtime rewritten from class-based to functional style.

---

## [0.14.0] - 2026-02-05

Reconstructed from blog post *Pulse v0.14: The "Vibe Coding" Update*.

### Added

- Unified runtime under a single `src/runtime` core (“single source of truth”).
- Microtask scheduler batching signal updates into one DOM flush.
- `template()` and `walk()` DOM helpers for cached templates and path-based traversal.
- `<List>` virtualization via `virtual` prop.
- FLIP reorder animations for lists.

### Changed

- Runtime logic consolidated; duplicate files removed across bundler/server.

---

## [0.13.0] - 2026-01-25

Reconstructed from blog post *Pulse v0.13.0 Released* (“The Performance Update”).

### Added

- “Path Walker” / “Treasure Map” strategy to locate dynamic nodes without `querySelector`.
- Template hoisting: static trees cloned from `<template>` elements.
- Keyed reconciliation for `<List>` (move existing nodes on reorder).

### Fixed

- Event binding mismatch between server-generated handlers and client delegation.
- `<Show>` / `<List>` signal dependency tracking in more contexts.

---

## [0.12.0] - 2026-01-25

Reconstructed from blog post *Pulse v0.12.0 Released*.

### Changed

- Unified reactivity runtime as a singleton (fixes split-core / multiple instances).
- Hydration rewritten with scoped traversal for nested List/Show.
- Dev server no-cache headers so components do not go stale.

### Fixed

- Nested List/Show inheriting the wrong hydration scope (broken event handlers).
- Template compilation so signals in `when` / `each` are tracked correctly.

---

## [0.11.0] - 2025-01-24

Reconstructed from blog post *Pulse v0.11.0: Signal Hydration & Two-Way Binding*.

### Fixed

- Signal hydration for List/Show (SSR content no longer flashes away; getters invoked).
- Two-way form binding: property assignment (`el.value`), setter extraction from `createSignal`, input events no longer blocked by `preventDefault`, expression attributes serialized correctly.
- Template transformer wraps primitive attributes (`each="{items}"`, `when="{isVisible}"`).
- SSR evaluation of direct state variable names.

### Changed

- Embraces the `createSignal` destructuring pattern for templates.

---

## [0.10.0] - 2025-01-24

Reconstructed from blog post *Pulse v0.10.0: The Eval Exorcism*.

### Security

- Removed `eval()` from the runtime bindings path.

### Changed

- Bindings moved to safer, scoped evaluation (`new Function` / `safeEvaluate`) with compilation cache.
- Aggressive minification (~40% smaller per blog), tree shaking, better chunk splitting.

---

## [0.9.0] - 2025-01-24

Reconstructed from blog post *Pulse v0.9 Released*.

### Changed

- Extracted ~150 lines of per-component injected helpers into a shared `/runtime/dom.js` library.
- Cleaner generated code and TypeScript-maintained DOM logic.

---

## [0.8.0] - 2025-01-24

Reconstructed from blog post *Pulse v0.8 Released* (“The Strict Update”).

### Added

- Bespoke `ScriptParser` (character-by-character token scanning; no regex extraction).
- Strict mode: component logic must live in explicit `<script>` tags.
- `TemplateTransformer` hydration markers (`data-pulse-component`) for nested imports.
- Standardized “Pulse Purple” visual language for default components.

### Changed

- Compilation pipeline moved from regex-based extraction to standards-compliant parsing.

---

## [0.7.0] - 2025-01-20

Reconstructed from blog post *Pulse v0.7 Update*.

### Added

- Islands architecture with partial hydration (static HTML by default; interactive islands opt-in).
- Core control-flow primitives: `<List>` and `<Show>`.
- Automatic scoped CSS for `<style>` blocks.

---

## [0.6.0] - 2025-01-15

Reconstructed from blog post *Pulse v0.6 Initial*.

### Added

- First public preview of Pulse.
- Bun-native toolchain (bundler, dev server, tests).
- Signal-based fine-grained reactivity (`createSignal`).
- `.pulse` single-file components (HTML + logic + scoped CSS).

---

## Notes on tags

Only **v0.16.0** is expected to receive a Git tag when this release is cut.
Older versions (**v0.6.0–v0.15.0**) were never tagged on this repository; compare links for them are omitted.

[Unreleased]: https://github.com/iam-mrkeyboard/pulse-js/compare/v0.16.0...HEAD
[0.16.0]: https://github.com/iam-mrkeyboard/pulse-js/releases/tag/v0.16.0
