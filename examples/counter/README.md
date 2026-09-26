# Example: counter

The smallest useful Pulse app: a static home page (zero JS) and a page with an
interactive `Counter` component (server-rendered, then hydrated in place).

```bash
# from the repository root
bun install
bun run build:pulse          # build the framework once
cd examples/counter
bun run dev                  # http://localhost:3001
bun run build                # static output in dist/
```
