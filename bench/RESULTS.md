# Pulse microbenchmark results

**Environment:** real headless Chromium via Puppeteer (`/usr/bin/google-chrome-stable`, HeadlessChrome/151), not happy-dom.
**Method:** `bench/run.mjs` → `bench/bench.html`; each case warmed then repeated; **median ms** reported.
**Label:** local measurements on this machine only — do not treat as js-framework-benchmark scores.

Reproduce:
```bash
cd pulse-js-work   # repo root
bun install        # needs puppeteer + chrome
bun ./bench/run.mjs
```

---

## (a) Compiled component create — 1,000 / 10,000 rows

Factories hoist template/parse once (mirrors a compiled component). Timed work is instance creation only.

| Approach | 1,000 rows (ms) | 10,000 rows (ms) | Correct for reactive bindings? |
|---|---:|---:|---|
| cloneNode + path walk | 3.4 | 37.4 | Yes |
| createElement chains | 2.9 | 28.0 | Yes |
| innerHTML per instance | 3.2 | 31.2 | No (no stable node refs; XSS if raw expressions) |

**Winner (fastest correct):** `createElement` chains (1k: 2.9 ms, 10k: 28.0 ms).

**Why not innerHTML:** fastest-ish raw paint but unsuitable as the component emit target when expressions must bind to live nodes and user data must not be parsed as HTML.

**Implementation note:** Pulse SFCs are authored as HTML. The unified compiler still emits `<template>` + `cloneNode` + path walk because that is the direct compile of HTML markup and stays within ~20–30% of createElement on this row shape; List item `render()` paths may use createElement where the tree is tiny and fully owned by JS. Revisit if richer static trees reverse the ranking.

---

## (b) Reactivity / update path

| Approach | partial every-10th @1k | single cell @1k | partial @10k | single @10k |
|---|---:|---:|---:|---:|
| effect-per-binding + direct textContent | ≈0 | ≈0 | 0.1 | ≈0 |
| batched/scheduled (microtask Set) | 0.1 | ≈0 | 0.8 | ≈0 |

**Winner:** fine-grained effect-per-binding with direct `textContent`/`nodeValue` writes. At 1k both are ~noise; at 10k partial update, batching was **slower** (0.8 ms vs 0.1 ms) because of Set bookkeeping + microtask without reducing DOM writes.

---

## (c) Keyed list reconcile (js-framework-benchmark-style ops)

| Op | always-insertBefore | prefix/suffix + Map | LIS minimal moves | vanilla baseline |
|---|---:|---:|---:|---:|
| create_1k | 2.6 | 2.8 | 2.9 | 2.8 |
| replace_1k | 3.2 | 2.8 | 3.5 | 2.9 |
| partial_1k | 0.1 | 0.1 | ≈0 | ≈0 |
| select | ≈0 | ≈0 | ≈0 | ≈0 |
| swap | 0.9 | 0.5 | 0.9 | ≈0 |
| remove | 0.6 | ≈0 | 0.4 | ≈0 |
| create_10k | 29.4 | 31.3 | 54.5 | 30.2 |
| append_1k | 5.9 | 2.7 | 3.9 | 2.7 |
| clear | ≈0 | ≈0 | ≈0 | ≈0 |

**Winner:** **prefix/suffix + Map** keyed reconcile. Competitive on create/replace; best among the three on append (2.7 vs 5.9 always-insert / 3.9 LIS) and remove (≈0 vs 0.6 / 0.4); solid on swap. LIS paid a large create_10k tax (54.5 ms vs ~30 ms) from LIS bookkeeping when most nodes are new. always-insertBefore is simplest but loses on append/swap/remove.

Vanilla hand-written baseline remains the floor (especially swap/remove via direct node ops). Framework List should approach prefix/suffix+Map, not always-insertBefore.

---

## Decisions locked for the three fixes

1. **Compiler emit:** HTML SFC → `<template>` clone + path walk (correct, SFC-native); keep createElement available for tiny programmatic rows. Reject innerHTML-per-instance for components.
2. **Updates:** effect-per-binding + direct DOM property writes; no batching layer on the hot path.
3. **List:** keyed Map reuse + common prefix/suffix reconcile; dispose removed entries; FLIP off by default. Do not ship always-insertBefore; skip full LIS unless a reverse/shuffle bench later justifies the create tax.

---

---

## Re-run after merge/restructure-with-fixes (local, HeadlessChrome via Puppeteer)

Same winners confirmed after porting PR #1 onto `local-restructure`:

| Op | prefix/suffix+Map | always-insert | LIS | vanilla |
|---|---:|---:|---:|---:|
| append_1k | 2.6 | 5.4 | 5.4 | 2.6 |
| create_10k | 28.2 | 30.0 | 57.7 | 28.1 |

Create 10k rows: createElement=27.100000000558794, cloneNode=31.799999999813735, innerHTML=30
