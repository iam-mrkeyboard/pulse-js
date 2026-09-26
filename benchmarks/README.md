# Benchmarks

| Folder | What it measures | How to run |
|--------|------------------|------------|
| [`js-framework-benchmark/`](js-framework-benchmark) | Pulse keyed implementation for [krausest/js-framework-benchmark](https://github.com/krausest/js-framework-benchmark) (create/replace/update/select/swap/remove/clear rows). Results and notes in `RESULTS.md`. | Copy this folder to `frameworks/keyed/pulse` in a js-framework-benchmark checkout, run `bun run sync-runtime` here first so `pulse-runtime/` matches `packages/pulse/src/runtime`, then `bun run build-prod` and the harness's `benchmarkRunner`. |
| [`micro/`](micro) | Headless-Chrome microbenchmarks: signal updates, List reconcile, hydrate vs remount. Results in `RESULTS.md`. | `bun run bench` from the repository root (needs Chrome). |

`js-framework-benchmark/pulse-runtime/` is a vendored copy because the harness builds
each framework folder in isolation. `sync-runtime.sh` refreshes it; it was last synced
for v0.17.
