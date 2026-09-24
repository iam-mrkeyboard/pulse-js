# Pulse SFC compiler notes (js-framework-benchmark entry)

Attempted: compile `src/App.pulse` with Pulse's shared SFC compiler
(`pulse-framework/src/server/component-compiler.ts`) and ship that as the bench bundle.

## Failures observed (2026-09-24, branch `merge/restructure-with-fixes`)

1. **List item `class={...}` binding is hoisted incorrectly**
   - Expression `state.selected === row.id ? "danger" : ""` was emitted as a
     top-level `createEffect` that references unbound `row`, instead of a
     per-item attribute binding inside the List template.
   - Consequence: select-row highlighting cannot work from compiled output.

2. **List item attribute bindings incomplete**
   - Compiled `data-bindings` contained only text bindings (`row.id`, `row.label`),
     not the `class` attribute binding for the `<tr>`.

3. **No fine-grained nested reactivity for row fields**
   - Top-level `state.*` fields become signals; nested `row.label` is a plain
     property. List reuses DOM nodes by key and does **not** re-invoke `children`
     when the same key's data changes, so "update every 10th row" does not update
     text unless each row exposes a signal (Solid-style) that an effect reads.
   - The compiled List binding `createEffect` closes over the original `item`
     plain object and only re-runs when a tracked signal is read — plain
     `row.label` reads track nothing.

4. **Absolute `/runtime/*.js` imports**
   - Compiler emits `import ... from '/runtime/core.js'` (dev-server paths),
     which must be rewritten for a standalone browser bundle.

## Fallback used for this entry

`src/main.js` uses the **Pulse runtime API directly** (`createSignal`, `batch`,
`createEffect`, keyed `List`, template clone) — clearly labelled in source.
This is still Pulse (same runtime as compiled SFCs), not hand-written vanilla DOM
diffing. Per-row `label` signals mirror Solid's fine-grained update pattern so
partial update and keyed reuse both pass the benchmark's validation.
