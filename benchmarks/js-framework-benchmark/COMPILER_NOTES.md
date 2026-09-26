# Pulse SFC compiler notes (js-framework-benchmark entry)

The keyed bench bundle is still `src/main.js` against the Pulse runtime API
(`createSignal`, `batch`, `createEffect`, `createSelector`, keyed `List`).
That is the same runtime compiled SFCs call.

The three compiler bugs that blocked `src/App.pulse` are fixed:

1. **List item `class={...}` stays on the item.** Attribute bindings inside
   `<List>` go into `data-bindings` on `<pulse-list>`, not a page-level
   `createEffect` that referenced unbound `row`.
2. **List item attribute bindings are complete.** `class` (and other
   expression attributes) are included next to the text bindings.
3. **Runtime imports are package specifiers.** Compiled output uses
   `pulse/runtime`, `pulse/runtime/dom`, `pulse/runtime/list`,
   `pulse/runtime/show`. The dev server import map still points those at
   `/runtime/*.js`. `package.json` exports the built files under
   `dist/runtime/`.

`src/App.compiled.js` is the current compiler output of `src/App.pulse`.

Remaining SFC gap for a compiled bench: nested `row.label` on a plain object
does not notify the item text binding when the object is replaced under the
same key. The runtime entry keeps per-row label signals so "update every 10th"
stays keyed. Script transform is now scope-aware (`const data` inside
`buildData` is no longer rewritten to `get_data`).
