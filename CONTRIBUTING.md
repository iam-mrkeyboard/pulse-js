# Contributing to Pulse

Thanks for helping improve Pulse. This guide covers local setup, repo layout, tests, commits, PRs, and releases.

## Requirements

- [Bun](https://bun.sh) ≥ 1.1 (workspaces)
- Git
- (Optional, for `benchmarks/`) Google Chrome / Chromium
- (Optional, for packaging `packages/vscode-extension`) Node.js (vsce)

## Setup

```bash
git clone https://github.com/iam-mrkeyboard/pulse-js.git
cd pulse-js
bun install            # one install for every workspace (root bun.lock)
bun run build:pulse    # build packages/pulse (apps use its dist/ CLI and types)
```

## Repo layout

```text
├── packages/
│   ├── pulse/               # framework: runtime, compiler, SSR, dev server, build, CLI, tests
│   └── vscode-extension/    # VS Code extension (own bun.lock + vsce; not a root workspace)
├── apps/docs/               # docs / showcase site (.pulse pages, blog)
├── examples/counter/        # minimal example app
├── benchmarks/
│   ├── js-framework-benchmark/  # keyed Pulse implementation + results
│   └── micro/               # headless-Chrome microbenchmarks
├── tsconfig.base.json       # shared TypeScript options (packages extend it)
└── .github/                 # CI (ci-workflow.yml), issue & PR templates
```

Workspaces: `packages/pulse`, `apps/*`, `examples/*`, `benchmarks/micro`. Apps depend on
the framework with `"pulse": "workspace:*"`.

## Running tests, typecheck, build, bench

From the repository root:

```bash
bun test               # framework test suite (happy-dom preload; see bunfig.toml)
bun run typecheck      # tsc for packages/pulse, apps/docs and examples
bun run build          # packages/pulse → apps/docs → examples
bun run dev            # docs site dev server
bun run bench          # microbenchmarks (needs Chrome)
```

Per package: `cd packages/pulse && bun test` / `bun run build`; `cd apps/docs && bun run dev`.

After changing `packages/pulse/src/runtime`, refresh the vendored copy used by the
js-framework-benchmark implementation: `cd benchmarks/js-framework-benchmark && bun run sync-runtime`.

VS Code extension:

```bash
cd packages/vscode-extension
bun install            # own bun.lock; intentionally not a root workspace
bun run compile        # tsc -b client server; package with `bun run package` (vsce)
```

## Commit message convention

Use [Conventional Commits](https://www.conventionalcommits.org/):

```text
feat: add adopt-and-bind hydration markers
fix: restore state setters on the reactive façade
docs: reconstruct CHANGELOG from blog posts
bench: record hydrate vs remount local medians
chore: bump pulse to 0.17.0
test: cover List keyed adopt after hydrate
```

Scopes are optional (`fix(runtime): …`). Breaking changes: add `!` after the type or a `BREAKING CHANGE:` footer.

## Pull requests

1. Branch from `master`.
2. Keep PRs focused; include a short “why” and how you verified (`bun test`, `bun run build`, bench if relevant).
3. Do not force-push shared long-lived branches (`master`, integration branches) without maintainer agreement.
4. Fill out the PR template. Link related issues when applicable.
5. Wait for CI to pass: `bun install`, build `packages/pulse`, `bun run typecheck`, `bun test`,
   then build `apps/docs` and `examples/*`. The workflow is `.github/workflows/ci.yml`
   (the v0.17 version is staged at `.github/ci-workflow.yml` until a maintainer moves it into place).

## How releases are cut

1. Land the release PR into the integration branch / `master`.
2. Ensure `CHANGELOG.md` has a dated `[x.y.z]` section and package versions match.
3. Tag `vX.Y.Z` on the release commit and create a GitHub Release from that tag (notes from the changelog).
4. Publish packages only when the maintainer is ready (`packages/pulse` → npm `pulse`; the extension has its own cadence).

Until you are asked otherwise: **do not** create tags or GitHub Releases from contributor PRs—only from the maintainer after merge.

## Code of conduct

By participating you agree to uphold our [Code of Conduct](CODE_OF_CONDUCT.md).

## Security

Please report vulnerabilities privately via [SECURITY.md](SECURITY.md)—do not open a public issue for unfixed security bugs.
