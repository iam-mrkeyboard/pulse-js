# pulse

The Pulse framework package: fine-grained signals, a `.pulse` single-file-component
compiler, server rendering with in-place hydration, a Bun dev server with HMR, and a
production build that ships **zero JavaScript for pages without reactive code**.

> Pre-1.0: APIs can change between minor versions. See the repository
> [CHANGELOG](../../CHANGELOG.md).

## Install

Inside this monorepo apps depend on it with `"pulse": "workspace:*"`. The CLI and the
library entry are built into `dist/`:

```bash
bun run build          # dist/index.js, dist/compiler, dist/cli, dist/runtime/*, .d.ts
```

## CLI

```bash
pulse dev       # dev server + HMR (default port from pulse.config.ts)
pulse build     # SSR every page, bundle client JS only where needed
pulse preview   # serve dist/
pulse analyze   # dependency graph / which components are interactive
```

## Exports

| Specifier | Contents |
|-----------|----------|
| `pulse` | `build`, `PulseBundler`, `createDefaultConfig`, `DependencyAnalyzer`, `ComponentCompiler`, `TemplateTransformer`, `CSSScoper`, `DevServer`, `SSRRenderer`, runtime re-exports, `VERSION` |
| `pulse/runtime` | `createSignal`, `createEffect`, `createMemo`, `createSelector`, `createRoot`, `batch`, `untrack`, `onCleanup` |
| `pulse/runtime/dom` | `walk`, `template`, `mountPrimitives`, `text`, `setAttribute`, `on`, … |
| `pulse/runtime/list` / `pulse/runtime/show` | `List`, `Show` primitives |
| `pulse/runtime/hydration` | `hydrate`, `hydrateAll`, `renderToString` |
| `pulse/compiler` | `ComponentCompiler`, `TemplateTransformer` |
| `pulse/cli` | CLI entry |

The build and dev server also resolve the legacy `pulse-framework/runtime*` specifiers.

## Template syntax notes

- `{expression}` is evaluated everywhere in markup, including `<pre>`, `<code>`,
  `<textarea>` and `<title>`. Only `<script>` and `<style>` bodies are raw.
- Add `is:raw` to an element to emit its children literally (code samples with
  braces). The attribute is removed from the output. For one literal brace use
  `&#123;` / `&#125;`.
- HTML comments and comments before the first markup (for example a `// header`
  above `<script>`) are never rendered.
- Whitespace follows HTML rules: runs collapse to one space, indentation between
  block elements is dropped, a space next to inline content is kept, `<pre>` and
  `<textarea>` keep whitespace verbatim.

## When does a page ship JavaScript?

A component is interactive when its script uses signals / effects / lifecycle
(`createSignal`, `createMemo`, `createEffect`, `createStore`, `createSelector`,
`createResource`, `createRoot`, `onMount`, `onCleanup`, `batch`, `untrack`), the
`state` façade, or browser APIs (`window`, `document`, `localStorage`, timers,
`fetch`, observers, …), or when its markup has event handlers (`onClick={…}`),
`bind:` or `on:` directives. Interactivity is inherited from imported components.
Everything else, including `let`/`const` data rendered with `List`/`Show`, is
rendered on the server and ships no JS.

## Source maps

`build.sourcemap: true` writes an external `.map` next to every JS asset and links it
with `//# sourceMappingURL`; `false` writes none.

## Layout

```text
src/
├── runtime/     # browser runtime (signals, DOM helpers, List/Show, hydration, SSR markers)
├── compiler/    # public compiler entry (re-exports server/component-compiler)
├── server/      # SFC compiler, template transformer, SSR, dev server, HMR, Bun plugin
├── bundler/     # production build: dependency analysis, page SSR, Bun.build, compression
├── cli/         # `pulse` command
├── dev/, llm/   # planned tooling, not wired in yet
└── index.ts     # library entry
tests/           # bun test (happy-dom preload via bunfig.toml)
scripts/         # build-runtime.ts (emits dist/runtime/*)
```
