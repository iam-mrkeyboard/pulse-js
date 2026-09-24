# Contributing to Pulse

Thanks for helping improve Pulse. This guide covers local setup, repo layout, tests, commits, PRs, and releases.

## Requirements

- [Bun](https://bun.sh) ≥ 1.0
- Git
- (Optional, for `bench/`) Google Chrome / Chromium + Puppeteer

## Setup

```bash
git clone https://github.com/iam-mrkeyboard/pulse-js.git
cd pulse-js

# Framework package
cd pulse-framework
bun install
bun run build

# Optional: link for local pulse-app development
bun link
cd ../pulse-app
bun install
# pulse-app depends on pulse-framework via link:pulse-framework
```

## Repo layout

```text
├── pulse-framework/   # Core compiler, runtime, CLI, server, tests
├── pulse-app/         # Docs / example site (.pulse pages, blog)
├── extension/         # VS Code extension (separate versioning)
├── bench/             # Headless Chromium microbenchmarks
└── .github/           # CI, issue & PR templates
```

## Running tests, bench, and build

```bash
cd pulse-framework

bun test              # unit + integration tests (happy-dom preload)
bun run build         # emit dist/ (CLI + library)
bun run type-check    # tsc --noEmit (optional)

# Microbenchmarks (needs Chrome + puppeteer at repo root)
cd ..
bun install           # root puppeteer dep
bun ./bench/run.mjs
```

Smoke-compile the docs app after framework changes:

```bash
cd pulse-app
bun run build         # requires a built/linked `pulse` CLI
```

## Commit message convention

Use [Conventional Commits](https://www.conventionalcommits.org/):

```text
feat: add adopt-and-bind hydration markers
fix: restore state setters on the reactive façade
docs: reconstruct CHANGELOG from blog posts
bench: record hydrate vs remount local medians
chore: bump pulse-framework to 0.16.0
test: cover List keyed adopt after hydrate
```

Scopes are optional (`fix(runtime): …`). Breaking changes: add `!` after the type or a `BREAKING CHANGE:` footer.

## Pull requests

1. Branch from the current integration tip (today: stack on open work such as `fix/hydration` → `merge/restructure-with-fixes` → `master` when those land).
2. Keep PRs focused; include a short “why” and how you verified (`bun test`, `bun run build`, bench if relevant).
3. Do not force-push shared long-lived branches (`master`, integration branches) without maintainer agreement.
4. Fill out the PR template. Link related issues when applicable.
5. Wait for CI (`bun install` + `bun test` + `bun run build` in `pulse-framework`) to pass.

## How releases are cut

1. Land the release PR into the integration branch / `master`.
2. Ensure `CHANGELOG.md` has a dated `[x.y.z]` section and package versions match.
3. Tag `vX.Y.Z` on the release commit and create a GitHub Release from that tag (notes from the changelog).
4. Publish packages only when the maintainer is ready (`pulse` / framework package; extension has its own cadence).

Until you are asked otherwise: **do not** create tags or GitHub Releases from contributor PRs—only from the maintainer after merge.

## Code of conduct

By participating you agree to uphold our [Code of Conduct](CODE_OF_CONDUCT.md).

## Security

Please report vulnerabilities privately via [SECURITY.md](SECURITY.md)—do not open a public issue for unfixed security bugs.
