# Roadmap

Pulse is **pre-1.0**. APIs may change. This file tracks near-term work; it is not a commitment calendar.

## Now

- Finish **comment-marker hydration** through all compiler emit paths (path-walk works today; `<!--p-->` / `<!--/p-->` bookends are defined but not fully marker-driven everywhere).
- **js-framework-benchmark** entry: keyed runtime bench lands geom ~1.16× vanilla (Chrome 151, count 10); clear ratio still elevated (~1.39×) — profile dispose/`replaceChildren` path.
- Measure real **minified + gzip** runtime size and keep README claims honest (partially done in v0.16.0; re-check after further tree-shaking).
- Wire **error-overlay-v2** into the dev server (overlay exists; integration incomplete).
- Optional: **compiler nested-row field bindings** without remount (today: remount on item identity change; same-ref field updates need signals or a future update callback).

## Next

- Documented List behavior: **duplicate keys** collapse in the Map (last wins); development warns once per update.
- Consider **`createElement` emit** vs template `cloneNode` for tiny rows (local bench: createElement slightly faster on that shape; SFC emit still cloneNode — documented tradeoff).
- Remove the **bundler fallback compile path** once the shared `src/compiler` covers all cases.
- **Surgical hydration mismatch repair** (today: mismatch → client remount / fallback rather than patch).
- Dev tools: **auto-fixer** (AST-based) polished and exposed in the DX loop.
- **LLM introspector** event extraction improvements.

## Later

- Router and documented global state patterns.
- Pulse DevTools browser extension.
- Native mobile via Pulse Bridge (aspirational; listed historically in README).
- Ecosystem growth beyond the core compiler/runtime.

---

## From code audit

Fixed in v0.16.0 (PR #6):

1. Empty production runtime — `RuntimeBuilder` looked in the wrong directory after the file move and minified TypeScript with terser; it now resolves `src/runtime` / `dist/runtime` and transpiles TS first.
2. Missing `dist/runtime/*.js` — `bun run build` emits browser ESM runtime files; `./runtime` package exports resolve.
3. Runtime APIs not exported — `createSignal`, `createSelector`, `List`, `Show`, DOM helpers are on the package index.
4. Compiler `/runtime/*.js` imports — compiled SFCs import `pulse/runtime` (import map + package exports).
5. List item class/attribute bindings hoisted or dropped — they stay in per-item `data-bindings`.
6. Scope-unaware identifier rewrite — local `const data` is no longer rewritten to `get_data`.

