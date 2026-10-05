#!/usr/bin/env bash
# Copy the current Sokudo runtime into pulse-runtime/ so this benchmark measures
# the code in packages/sokudo (the js-framework-benchmark harness builds this
# folder on its own and cannot resolve workspace packages).
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
src="$here/../../packages/sokudo/src/runtime"
mkdir -p "$here/pulse-runtime/primitives"
for f in core.ts dom.ts ssr-markers.ts primitives/list.ts primitives/show.ts; do
  cp "$src/$f" "$here/pulse-runtime/$f"
done
echo "pulse-runtime/ synced from packages/sokudo/src/runtime"
