# sokudo

The Sokudo framework package: fine-grained signals, a `.pulse` single-file-component
compiler, server rendering with in-place hydration, a Bun dev server with HMR, and a
production build that ships **zero JavaScript for pages without reactive code**.

> Pre-1.0: APIs can change between minor versions. See the repository
> [CHANGELOG](../../CHANGELOG.md).

## Install

Inside this monorepo apps depend on it with `"sokudo": "workspace:*"`. The CLI and the
library entry are built into `dist/`:

```bash
bun run build          # dist/index.js, dist/compiler, dist/cli, dist/runtime/*, .d.ts
```

## CLI

```bash
sokudo dev       # dev server + HMR (default port from sokudo.config.ts)
sokudo build     # SSR every page, bundle client JS only where needed
sokudo preview   # serve dist/
sokudo analyze   # dependency graph / which components are interactive
```

## Exports

| Specifier | Contents |
|-----------|----------|
| `sokudo` | `build`, `SokudoBundler`, `createDefaultConfig`, `DependencyAnalyzer`, `ComponentCompiler`, `TemplateTransformer`, `CSSScoper`, `DevServer`, `SSRRenderer`, runtime re-exports, `VERSION` |
| `sokudo/runtime` | `createSignal`, `createEffect`, `createMemo`, `createSelector`, `createRoot`, `batch`, `untrack`, `onCleanup` |
| `sokudo/runtime/dom` | `walk`, `template`, `mountPrimitives`, `text`, `setAttribute`, `on`, … |
| `sokudo/runtime/list` / `sokudo/runtime/show` | `List`, `Show` primitives |
| `sokudo/runtime/hydration` | `hydrate`, `hydrateAll`, `renderToString` |
| `sokudo/compiler` | `ComponentCompiler`, `TemplateTransformer` |
| `sokudo/cli` | CLI entry |

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

## Content Security Policy

The compiler turns every template expression into a closure: `<List each>` /
`key`, row bindings, `<Show when>`, and `on*` / `bind:` handlers. The markup only
references a closure by id (`each="<tag>:3"`). The runtime never evaluates
strings (no `eval` / `new Function`), and production pages load their JS from
external files. Styles are CSP-safe too: `sokudo build` links each page's
component CSS from a hashed stylesheet (`assets/page-<route>-<hash>.css`), turns
static `style="…"` attributes into generated classes, and style bindings write
through CSSOM (`el.style.cssText`). Production pages therefore work under:

```
Content-Security-Policy: default-src 'self'; object-src 'none'; base-uri 'self'
```

`sokudo dev` uses no inline scripts either (it works under `script-src 'self'`);
in dev, component CSS stays inline. An expression that is not valid JavaScript
fails the build.

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
├── cli/         # `sokudo` command
├── dev/, llm/   # planned tooling, not wired in yet
└── index.ts     # library entry
tests/           # bun test (happy-dom preload via bunfig.toml)
scripts/         # build-runtime.ts (emits dist/runtime/*)
```
