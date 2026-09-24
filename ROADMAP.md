# Roadmap

Pulse is **pre-1.0**. APIs may change. This file tracks near-term work; it is not a commitment calendar.

## Now

- Finish **comment-marker hydration** through all compiler emit paths (path-walk works today; `<!--p-->` / `<!--/p-->` bookends are defined but not fully marker-driven everywhere).
- **js-framework-benchmark** entry and tuning (in progress).
- Measure real **minified + gzip** runtime size and keep README claims honest (partially done in v0.16.0; re-check after further tree-shaking).
- Wire **error-overlay-v2** into the dev server (overlay exists; integration incomplete).

## Next

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

## From code audit (pending)

> **This section is reserved for findings from a forthcoming code audit.**
> Do not treat it as committed work until it is filled in by the maintainer.

<!-- Maintainer: paste audit items here. -->

