# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Historical entries for **v0.6.0–v0.15.0** are reconstructed from the project's own blog posts
(`apps/docs/src/pages/blog/`, formerly `pulse-app/`). Those versions were never tagged on GitHub.

## [Unreleased]

### Security

- **No `eval` / `new Function` anywhere in the browser.** Pulse pages now run under a strict Content Security Policy (`script-src 'self'`, no `'unsafe-eval'`). The SFC compiler emits every runtime expression as a real closure: `<List each>` / `key`, List row text and attribute bindings, `<Show when>`, and `on*` / `bind:` handlers (top level and inside List rows, including nested Lists). The markup only references a closure (`each="<tag>:3"`, `data-on-click="<tag>:7"`). The runtime's string evaluator (`safeEvalExpr`, its expression cache and the scope/accessor tables built for it) is deleted. On v0.17.0, 8 of the 30 docs pages broke under that policy (27 CSP violations). Now all 30 pages and `examples/counter` hydrate and stay interactive with 0 violations. The production HTML has no inline scripts, so no nonce or hash is needed.
- **Strict style CSP for production pages.** Pages now pass `default-src 'self'` with no `'unsafe-inline'` for styles (v0.17.0: 74 violations across the docs). Component CSS is no longer inlined as `<style>`: each page links one hashed stylesheet (`assets/page-<route>-<hash>.css`) holding the scoped CSS of the components it renders (imports first, then the page), a base rule for Pulse's wrapper elements, and generated classes for inline styles. Static `style="…"` attributes compile to a class (`ps-<hash>`, declarations `!important` so they still win like an inline style), merged into the element's static or bound class. Style bindings write through CSSOM (`style.cssText`), which CSP allows; styles the server render produced become `pd-<hash>` classes that the binding drops after hydration. `pulse dev` and direct compiler use keep inline styles. Checked on all 30 docs pages and `examples/counter`: 0 violations, 0 `replaceWith`, interaction checks pass, rendering pixel-identical to inline styles.
- **`pulse dev` works under `script-src 'self'`.** The dev page no longer uses inline scripts: hydration is an external module (`/__pulse/hydrate.js?page=…`), the inline import map is gone (served modules import the runtime by `/runtime/*.js` URL), and the error page's reload script is external. All 30 docs pages hydrate in dev with 0 violations.

### Changed

- A template expression that is not valid JavaScript now **fails the build** with `Pulse Error: cannot compile template expression {…}`. It used to fail at runtime in the browser.
- `mountPrimitives(container, exprs, primitives, templates)`: the second argument is now the compiler-generated expression table (`{ t, x }`) instead of a scope object. Compiled output is updated. Hand-written markup must reference closures (`each="t:0"`) instead of carrying code. Named delegated handlers on hand-written roots (`data-on-click="increment"` + `__pulseHandlers`) still work.
- Compiled components no longer build the runtime `scope` object and its `__accessors` table, and no longer set `container.__pulseScope`. The expression table is set as `container.__px`.
- List rows and Show branches parse their template once per List/Show and clone it for each row. They used to run `innerHTML` for every row.
- Delegated events inside List rows: the row item comes from the nearest row root, for every event type. Per-row listeners are gone. Compiled components register the event types their markup uses beyond the default set (`delegate()`); `focus` / `blur` and other non-bubbling events are delegated in the capture phase (the default `focus` / `blur` listeners never fired).
- The component scope id (CSS scope class and expression tag) is a hash of the file's path relative to the project root plus its content, instead of a hash of the file name.
- Each build records the files it writes in `dist/.pulse-files.json` and deletes files of the previous build it did not write again.
- `bun run typecheck` checks both app configs in one program (`tsconfig.apps.json`), and the app tsconfigs map `pulse` to the package sources.

### Fixed

- Handlers inside a nested List's rows no longer also get bound by the outer row, which used to run them with the wrong item. Expressions in inner rows can read the outer row's item (`group.name` inside `<List each={group.tags} as="tag">`).
- `key="id"` (a plain identifier) now means `key={item.id}` as documented. Before, it became `key="{id}"` and failed.
- A text binding whose server-rendered value is `''` updates after hydration. An empty string renders no text node, so the binding used to have nothing (or the wrong node) to update.
- Events other than click/input/change inside a `<Show>` in a List row get the row item (`onKeydown={() => save(row)}` used to fail with `row` undefined), including rows added after hydration.
- Component props written as `{expr}` are real values instead of the literal string `"{expr}"`. They compile to getters, so a signal passed as a prop stays reactive (`<Badge label={msg() || "empty"} />`, `<Live count={n} />`), also inside List rows. Components without a script re-render when a prop changes, HTML-escape prop values, and accept `{props.x}`. String props decode character references.
- `<Show>` inside a component: text bindings inside the branch render and update (they used to point into the inert `<template>`), bindings inside a Show within a List row bind the live content, every node of the branch is kept (not only the first element), text-only branches hide, the server-rendered anchor is reused (no second `Show Anchor`), `fallback={expr}` is evaluated (and stays live) instead of showing its source, and Lists/Shows nested in a branch rendered after hydration mount.
- `bind:value` / `bind:checked` inside List rows and Show branches bind with the row.
- **Component CSS was dropped for every component with a `<script>`.** The compiler put its `<style>` next to, not inside, the element the component returns, so only script-less components were ever styled (in dev and production; the landing page rendered unstyled). Production now links it; dev puts it inside the root.
- Two components with the same file name in different folders no longer share a CSS scope (their styles leaked into each other).
- The build no longer leaves old hashed `page-*` / `chunk-*` files and deleted pages in `dist`. Files the build did not write are never touched.
- `bun run typecheck` works on a fresh clone (it needed `build:pulse` first for `packages/pulse/dist/*.d.ts`). Same time as before: 2.6 s for the app configs.
- The VS Code extension no longer offers completions or hover docs for `Portal`, `Suspense` and `ErrorBoundary`, which do not exist. The docs no longer document a `<Portal>` primitive. The docs footer links to https://github.com/iam-mrkeyboard/pulse-js.

### Removed

- `runtime/safe-eval.ts` and the `evalSSR` / `interpolateSSR` / `safeEvalSSR` exports of `server/template-transformer`. These were an unused string-expression interpreter (only their own test imported them).
- The unused `wrapHTML()` in `server/html-wrapper.ts`, which carried a `'unsafe-eval'` CSP meta tag (the dev server uses `SSRRenderer.wrapHTML`).

### Performance (same machine, v0.17.0 → this change)

- Compiled-SFC version of the js-framework-benchmark app (`benchmarks/js-framework-benchmark/src/App.pulse`, which exercises List/row bindings/row handlers), in-page median over 8 interleaved rounds: geomean **22.87 → 14.40 ms (−37%)**. select −78%, remove −36%, swap −35%, create 10k −34%, append 1k −29%, create 1k −28%, replace 1k −28%, update every 10th −21%, clear −11%.
- Runtime chunk in the docs build: 9,929 → 9,019 B (gzip 4,090 → 3,683 B, −10%). After the fixes above: 10,216 B (gzip 4,291 B). Per-page JS over the 30 docs pages: 261,710 → 246,683 B (gzip 107,206 → 101,042 B). HTML: 132,079 → 130,733 B. Static pages still ship 0 JS (17 of 30).
- js-framework-benchmark keyed Pulse entry (`src/main.js`, which uses the runtime API directly): its bundle is byte-identical before and after. Three runs of those same bytes (count 12, 01–09) gave a Pulse/vanilla geomean of 1.140, 1.145 and 1.163, so that spread is this machine's run-to-run noise.
- Fixes above, measured against the no-eval state: compiled-SFC geomean 17.36 → 15.11 ms and 17.07 → 15.81 ms (two interleaved runs in opposite orders, 8 rounds; row events are delegated instead of bound per row). A 12-round × 40-iteration run of swap / remove / select / clear shows no regression (−1% to −8%).
- Docs build, 30 pages: per-page JS 246,683 → 219,551 B (gzip 101,044 → 96,129 B), because component CSS no longer ships inside JS and HTML. HTML 130,733 → 112,961 B. The CSS moved into 30 per-page stylesheets, 87,128 B in total (gzip 28,512 B; per page 950 B gzip on average, 1.9 KB max). One site-wide stylesheet would be 9.0 KB gzip, and it would also be wrong, because pages define conflicting global `body` rules. `examples/counter` JS 10,792 → 11,745 B (gzip 4,156 → 4,632 B).
- Cost of the linked stylesheet: on a cold load at 150 ms RTT / 1.6 Mbps, first contentful paint is 190–320 ms later (one render-blocking round trip). Warm cache and unthrottled: no difference. There is no flash of unstyled content (the stylesheet is in `<head>`).

---

## [0.17.0] - 2026-09-26

### Fixed

- **Static pages ship zero JavaScript.** The page classifier treated any `let` in a component script as interactive, so data-only pages (blog posts v0.11+, most docs pages) loaded ~20 KB of JS each. A component now needs client JS only if its script uses signals/effects/lifecycle, the `state` façade or browser APIs, or its markup has `on*={…}` / `bind:` / `on:`. docs site: 23 → 13 pages with JS; total per-page JS 472,513 → 261,710 B.
- **`{expr}` inside `<pre>` / `<code>` / `<textarea>` / `<title>`** now interpolates (`CodeSnippet` rendered the text `{code}`). Two causes: those tags were parsed as raw text, and the script parser classified any declaration whose value *contains* `=>` (here, sample code in a string) as a function, so it never became a template binding.
- **Literal braces in code samples** use the new `is:raw` attribute (children emitted verbatim, attribute stripped); `&#123;`/`&#125;` still work for single braces.
- **Source maps:** `build.sourcemap: true` now emits an external `.map` per JS asset plus a `sourceMappingURL`; `false` emits none (before, no maps were written either way).
- **Comments no longer leak into pages:** a `// …` header before `<script>` (counter.pulse) and `<!-- … -->` comments are dropped by the parser.
- **Missing spaces after inline elements** (`2remaining`, `0items left`, `</strong>— a`): the parser deleted every whitespace-only text node; it now collapses whitespace HTML-style and keeps a space next to inline content. `<pre>`/`<textarea>` keep whitespace verbatim.
- docs site lists with stable ids are keyed (`blog`, `list`, `examples/todo`, `features/list`, `features/show`).
- Stray `console.log`s removed from the CLI startup banner, HTML parser, validator and form compilation.

### Removed

- Old build path superseded by SSR + `Bun.build` in v0.16: `bundler/entry-generator`, `code-splitter`, `minifier`, `runtime/runtime-builder` (+ test).
- Old islands compiler cascade: `bundler/compiler/component-compiler`, `code-generator`, `template-compiler`, `slots-compiler`, `component-resolver`, `template-optimizer`, `prop-inferencer`, `reactivity-transformer`, and `runtime/error-boundary` (only emitted by that codegen).
- Orphans: `bundler/reactivity-analyzer`, `bundler/usage-detector`; dev-server members that were constructed but never used (`server/page-compiler`, `mount-script-generator`, `hot-reload`, `module-graph`); unused types and error classes.
- Public exports of the removed classes (`RuntimeBuilder`, `CodeSplitter`, `EntryGenerator`, `Minifier`, `CodeGenerator`, `TemplateOptimizer`, `ReactivityAnalyzer`, bundler `ComponentCompiler`). `ComponentCompiler` / `TemplateTransformer` exported from `pulse` and `pulse/compiler` are the real compiler.
- Scratch scripts (`test_*.ts` at the root and in the framework, `test-parser.ts`, `inspect_ultrahtml.ts`, extension `debug-tree.js`, `scripts/*`, `test-fixtures/`), stale configs (`pulse-framework/pulse.config.ts`, `pulse-app/index.ts`), the stale extension `package-lock.json`, and unused `ultrahtml` / `puppeteer` dependencies of the framework package.

### Changed

- **Monorepo layout** (Bun workspaces): `packages/pulse` (was `pulse-framework/`), `packages/vscode-extension` (was `extension/`), `apps/docs` (was `pulse-app/`), `examples/counter` (new), `benchmarks/micro` (was `bench/`), `benchmarks/js-framework-benchmark`. Root `package.json` scripts: `build`, `test`, `typecheck`, `dev`, `bench`; shared `tsconfig.base.json`; one root `bun.lock`.
- Package name stays `pulse`; import specifiers unchanged (`pulse`, `pulse/runtime`, `pulse/runtime/dom|list|show`, `pulse/cli`). New: `pulse/compiler`, `pulse/runtime/hydration`, and `types` for every subpath export. The docs app package is now `@pulse/docs` and imports from `pulse` (legacy `pulse-framework/runtime*` specifiers still resolve).
- Framework version lives in one place (`src/version.ts`, asserted equal to `package.json` by a test) instead of seven hard-coded strings.
- Static components are serialized from the parsed template instead of a regex over the source.
- `benchmarks/js-framework-benchmark/pulse-runtime` re-synced to the current runtime; `sync-runtime.sh` added.
- CI updated for the monorepo layout (`.github/workflows/ci.yml`: install, build, typecheck, test, docs and examples build).

---

## [0.16.0] - 2026-09-24

### Added

- Adopt-and-bind hydration: client adopts SSR DOM via `data-p-h` / `data-p-key` / `data-p-list` / `data-p-show` markers instead of remounting with `replaceWith` (PR #3).
- `hydrate(Component, target)` preserves matching SSR roots; List/Show host mode keeps hosts in place and adopts keyed children.
- `renderToString` marks hydratable roots for tests / light SSR.
- Hydration mismatch fallback with `onMismatch` and a dev `console.warn` when the SSR root is missing.
- Shared SFC compiler at `src/compiler` (server `ComponentCompiler`; bundler interactive path delegates) (PR #1 / #2).
- Keyed `<List>` reconcile with common prefix/suffix + Map reuse; explicit `key` wiring through transformer and mount (PR #1 / #2).
- Longest-increasing-subsequence reorder in the keyed `List` middle range after the prefix/suffix skip, run only when surviving rows actually moved (PR #6).
- `createSelector` and `createRoot` on the core runtime (Solid-style selected-row updates; List disposes row effects on remove) (PR #6).
- Production browser runtime files under `dist/runtime/` and `pulse/runtime` package exports (PR #6).
- `dist/index.d.ts` emitted from `tsconfig.dts.json` so package `types`/`exports` resolve after build (PR #6).
- Dev-only `console.warn` when `List` sees duplicate keys (Map reconcile keeps the last item; no production cost) (PR #6).
- List remounts a row when the key is unchanged but the item object identity changes (immutable plain-object updates) (PR #6).
- js-framework-benchmark keyed entry (`benchmarks/js-framework-benchmark`) using one delegated click listener on `<tbody>` (PR #5 / #6).
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
- Row swap no longer `insertBefore`s the whole middle of the list (PR #6).
- Empty list clear uses a bulk `replaceChildren` path (PR #6).
- List item `class` / attribute bindings stay on the item instead of being hoisted (PR #6).
- Compiled SFCs import `pulse/runtime` instead of `/runtime/*.js` (PR #6).
- `RuntimeBuilder` emits a non-empty production runtime (path + TS transpile) (PR #6).
- Script transform skips locally shadowed state names (`const data` inside `buildData`) (PR #6).
- `pulse-app` depends on `file:../pulse-framework` (Bun `link:` failed against package name `pulse`) (PR #6).
- Dev server imports and serves the real `hydrate` (`/runtime/hydration.js` + allowlist) (PR #6).
- Nested template-literal class attributes (``class={`btn btn-${x}`}``) emit valid JS; the docs site minifies with terser (PR #6).
- `tsc --noEmit` is clean after import-path fixes (PR #6).
- Hygiene: untracked extension `out/`, framework `dist/`, logs, duplicate wasm; `.gitignore` updated (PR #6).
- **Production build shipped an empty `<body>`** on every page (minified and unminified): nothing ever set the page `staticHTML`, the minifier stripped the leftover comment, and page JS was never loaded (island imports used bare `pulse/runtime` specifiers the browser could not resolve). `pulse build` now server-renders each page into `<div id="app">` with the `data-p-h` / `data-p-c` / `data-p-list` / `data-p-show` (and, for keyed lists, `data-p-key`) hydration markers, and bundles one hydration entry per interactive page (`Bun.build`, shared chunks, `/assets/*`), which adopts that DOM instead of remounting. Pages with no interactive components ship no JS (PR #6).
- Build output follows the route tree (`pages/blog/v0.16.pulse` → `dist/blog/v0.16/index.html`); basename collisions no longer drop pages (30/30 built instead of 28), and `outDir` resolves against the project root (PR #6).
- Hydration adopts server-rendered child components (`data-p-c`) and binds adopted `<List>` rows (events, bindings, nested `<Show>`). Object items without a `key` adopt by position instead of all mapping to `"[object Object]"` (PR #6).
- Compiler: adjacent text and `{expr}` interpolations get a `<!---->` separator so they no longer merge into one text node (`Count: {count}` rendered blank); `{decl}` / `{props.x}` interpolations render their value; static components no longer print literal `${props.x}`; explicit accessor calls (`count()`) and `createMemo` work in scripts; inline handlers (`onClick={() => setOpen(!open)}`) and `{handler}` names are resolved; a `<style>` inside a script string is no longer taken as the component stylesheet (PR #6).
- Dev server: SSR resolves `pulse/runtime*` with a Bun plugin; happy-dom no longer replaces the native `Response` (Bun.serve failed with "Expected a Response object"); pages get an import map for `pulse/runtime*` and the real HMR client instead of a `/@vite/client` placeholder; SSR does not attach document event delegation (PR #6).
- `pulse build --no-minify` (documented in `--help`) is accepted (PR #6).

### Security

- Error UI no longer injects HTML via `innerHTML` for boundary / overlay messages (PR #1 / #2).
- Expression eval hardened behind `safeEvalExpr` with a stricter scope (PR #1 / #2).
- Template transformer no longer uses `new Function`; it goes through the shared `safeEval` evaluator (PR #6).

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

From `benchmarks/js-framework-benchmark/RESULTS.md` (js-framework-benchmark CPU tests, Chrome 151, headless, count 10, same run as vanillajs / Solid / Vue):

| Test | Pulse / vanilla |
|------|-----------------|
| Create 1,000 rows | 1.11 |
| Select a row | 1.14 |
| Swap two rows | 1.13 |
| Create 10,000 rows | 1.17 |
| Clear all rows | 1.39 |
| **Geometric mean (9 CPU tests)** | **1.16** |

Measured and rejected during PR #6: clearing via `textContent = ''` (slower than `replaceChildren`) and merging the label and select effects into one (select about 3× slower).

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

[Unreleased]: https://github.com/iam-mrkeyboard/pulse-js/compare/v0.17.0...HEAD
[0.17.0]: https://github.com/iam-mrkeyboard/pulse-js/compare/v0.16.0...v0.17.0
[0.16.0]: https://github.com/iam-mrkeyboard/pulse-js/releases/tag/v0.16.0
