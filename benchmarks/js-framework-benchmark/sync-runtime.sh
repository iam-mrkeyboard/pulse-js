#!/usr/bin/env bash
# Copy the current Pulse runtime into pulse-runtime/ so this benchmark measures
# the code in packages/pulse (the js-framework-benchmark harness builds this
# folder on its own and cannot resolve workspace packages).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
src="$here/../../packages/pulse/src/runtime"
mkdir -p "$here/pulse-runtime/primitives"
for f in core.ts dom.ts ssr-markers.ts primitives/list.ts primitives/show.ts; do
  cp "$src/$f" "$here/pulse-runtime/$f"
done
echo "pulse-runtime/ synced from packages/pulse/src/runtime"
