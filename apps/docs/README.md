# @sokudo/docs

The Sokudo documentation and showcase site (30 pages: docs, examples, feature demos,
blog). It is built with Sokudo itself and doubles as the framework's end-to-end test
app.

```bash
# from the repository root
bun install
bun run build:sokudo      # build packages/sokudo first
bun run dev              # http://localhost:3000
bun run build:docs       # static output in apps/docs/dist
```

Configuration lives in `sokudo.config.ts`; pages in `src/pages`, shared components in
`src/components`, static files in `public/`.
