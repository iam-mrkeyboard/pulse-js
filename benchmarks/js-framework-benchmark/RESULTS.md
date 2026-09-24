# Pulse vs js-framework-benchmark (local measurements)

**All numbers below are local measurements on this machine. Nothing is invented or copied from published leaderboards.**

| Field | Value |
| --- | --- |
| Machine | Linux box (Africa/Dar_es_Salaam, UTC+3) |
| Browser | Google Chrome 151.0.7922.169 (`/usr/bin/google-chrome-stable`) |
| Runner | js-framework-benchmark `webdriver-ts` / Puppeteer, `--headless true` |
| CPU iterations | **10** per test (default is 15; reduced for wall-clock; labelled) |
| Benchmarks | CPU only (`01_`–`09_`). Memory / startup / size **not run to completion** (stopped after steering request; partial `21_ready-memory` for pulse+solid only — omitted from ranking). |
| Pulse entry | `frameworks/keyed/pulse` — **runtime API fallback** (see below) |
| Pulse version | 0.15.0 (branch `merge/restructure-with-fixes`) |
| isKeyed | **PASSED** — keyed for run / remove / swap |
| Date | 2026-09-24 |

## Implementation note (compiler vs runtime)

**Shipped bundle uses the Pulse runtime API directly** (`createSignal`, `batch`, `createEffect`, keyed `List`, template clone) in `src/main.js`, **not** a `.pulse` SFC compiled by Pulse’s compiler.

Attempted path: idiomatic `src/App.pulse` → Pulse SFC compiler. That path is **not** what was benchmarked. Failures (evidence in `COMPILER_NOTES.md` + `src/App.compiled.js`):

1. List-item `class={...}` binding incorrectly hoisted to a top-level effect referencing unbound `row`.
2. List `data-bindings` contained only text nodes (`row.id`, `row.label`) — no `class` attribute binding.
3. No fine-grained nested reactivity for row fields: keyed `List` reuses DOM by key and does not re-invoke children when the same key’s plain object mutates, so “update every 10th” cannot work without per-row signals.
4. Compiler emits absolute `/runtime/*.js` imports unsuitable for a standalone browser bundle without rewrite.

So: **fallback = Pulse runtime API** (same runtime compiled SFCs would call), clearly labelled in source — not hand-rolled vanilla DOM diffing.

## Ranking (4 requested + extras)

Among the **four requested** keyed entries (vanillajs, solid, vue, pulse), by unweighted geometric mean of **total** median ms vs the fastest of those four on each test:

| Rank | Framework | Geom mean (total) |
| --- | --- | --- |
| 1 | vanillajs | 1.00 (baseline among the four*) |
| 2 | solid-v1.9.3 | ~1.13 vs vanillajs geom |
| 3 | vue-v3.5.39 | ~1.22 vs vanillajs geom |
| 4 | **pulse-v0.15.0** | **~1.39 vs vanillajs geom** |

\*Exact geom-vs-fastest across **all six** local entries (including vanillajs-lite + vue-vapor) is in the table below; Pulse ranks **6th of 6** locally (geom **1.453** vs fastest overall = vanillajs-lite).

Among just vanillajs / solid / vue / pulse: **Pulse ranks 4th (last)**.

## CPU results — median **total** ms (include layout/paint)

| framework | create 1k | replace 1k | partial update | select row | swap rows | remove row | create 10k | append 1k | clear rows | geom mean vs fastest |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| vanillajs-lite | 62.3 | 69.4 | 39.1 | 7.8 | 41.4 | 31.2 | 678.7 | 73.2 | 29.0 | **1.004** |
| vanillajs | 62.5 | 67.5 | 38.9 | 8.9 | 48.1 | 31.4 | 712.8 | 76.4 | 29.6 | **1.047** |
| vue-vapor-v3.6.0-rc.5 | 67.2 | 73.0 | 43.3 | 9.3 | 47.7 | 34.1 | 715.6 | 85.0 | 32.1 | **1.116** |
| solid-v1.9.3 | 64.8 | 73.0 | 40.5 | 12.6 | 53.2 | 32.1 | 769.8 | 84.0 | 42.2 | **1.189** |
| vue-v3.5.39 | 75.6 | 82.0 | 47.7 | 11.4 | 48.2 | 39.0 | 823.8 | 88.0 | 47.5 | **1.281** |
| **pulse-v0.15.0** | **70.5** | **78.1** | **42.0** | **11.4** | **303.6** | **33.0** | **843.5** | **80.0** | **38.2** | **1.453** |

## CPU results — median **script** ms (JS time only)

| framework | create 1k | replace 1k | partial update | select row | swap rows | remove row | create 10k | append 1k | clear rows | geom mean vs fastest |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| vanillajs-lite | 3.5 | 8.6 | 1.4 | 0.5 | 0.6 | 0.2 | 33.5 | 3.3 | 22.5 | **1.021** |
| vanillajs | 5.2 | 10.7 | 1.3 | 1.1 | 0.6 | 0.8 | 51.2 | 5.2 | 24.5 | **1.531** |
| vue-vapor-v3.6.0-rc.5 | 8.4 | 13.9 | 2.6 | 1.0 | 1.9 | 0.9 | 69.6 | 10.5 | 26.6 | **2.339** |
| solid-v1.9.3 | 8.4 | 13.8 | 2.8 | 2.9 | 3.1 | 1.1 | 73.6 | 9.1 | 34.8 | **2.873** |
| **pulse-v0.15.0** | **9.7** | **16.0** | **2.9** | **2.8** | **33.5** | **0.6** | **89.6** | **9.6** | **32.5** | **3.719** |
| vue-v3.5.39 | 18.3 | 22.8 | 5.7 | 2.9 | 3.2 | 7.5 | 147.9 | 17.8 | 40.4 | **5.292** |

Raw JSON: `results/*.json` (copied next to this file) and `/workspace/jsfb/webdriver-ts/results/`.

## Weakest tests vs vanillajs / solid (evidence-based)

### 1. Swap rows — **worst by far** (total 303.6 vs vanillajs 48.1 = **6.3×**; script 33.5 vs 0.6 = **~56×**)

**Cause:** `List` reconciles with common-prefix / common-suffix + Map (`pulse-runtime/primitives/list.ts`). Swapping indices 1 and 998 leaves only a 1-element prefix and 1-element suffix, so the middle range is ~997 keys. The algorithm then `insertBefore`s every node in that range even though only two nodes moved.

**Suggestions:**
- Detect pure swaps / moves (or use LIS / longest increasing subsequence keyed reconcile like Solid’s `mapArray`) so a 2-row swap is O(1) DOM moves.
- Short-term bench workaround: special-case swap in the app (manual `insertBefore` of the two `<tr>`s) — not done here; we measured the real `List` path.

### 2. Select row (script 2.8 vs vanillajs 1.1 = **2.4×**; still slightly faster than Solid total)

**Cause:** Each row installs `createEffect(() => { tr.className = selected() === row.id ? "danger" : "" })`. Changing `selected` notifies **all** row effects (O(n)), not just the previously/newly selected rows.

**Suggestions:** Add a `createSelector`-style primitive (Solid), or keep a `selectedEl` ref and toggle two classNames imperatively on click (vanillajs pattern).

### 3. Create 10k / create 1k (script ~1.75–1.9× vanillajs; ~1.15–1.22× Solid)

**Cause:** Per-row work is heavier than vanilla: signal allocation for every label, `createEffect` for label text + selected class, event listeners per row, and List bookkeeping. Not a correctness bug — baseline overhead of the fine-grained model as implemented.

**Suggestions:** Clone a single row template (already done) but attach one delegated click handler on `<tbody>`; consider lazy selected-class updates; pool/reuse label signals more carefully; ensure `batch` covers create paths.

### Honourable mention: clear rows (script 1.33× vanillajs)

List clears via per-node `removeChild` while walking the cache; vanilla can assign `textContent = ""` on tbody. A fast path for empty `each` would help.

## Bundle size (local dist / main)

| framework | JS size (approx) |
| --- | --- |
| pulse | 6.0 KB (`dist/main.js`, minified) |
| vanillajs-lite | 2.3 KB |
| vanillajs | 9.5 KB |
| solid | 11.6 KB |
| vue-vapor | 54 KB |
| vue | 65 KB |

## Memory / startup

**Not completed.** Runner killed after steering request. Partial ready-memory JSON may exist for pulse/solid only; excluded from tables and ranking.
