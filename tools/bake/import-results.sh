#!/usr/bin/env bash
# Brings a bake back: ./tools/bake/import-results.sh wirelight-bake-results.zip
# Copies the maps into apps/web/public/bake/, checks them against the rooms as they are now, and
# rewrites apps/web/src/world/bake/manifest.ts. Prints what changed.
set -euo pipefail
repo="$(cd "$(dirname "$0")/../.." && pwd)"
[[ $# -ge 1 ]] || { echo "usage: $0 <wirelight-bake-results.zip | folder> [--keep-stale]"; exit 2; }
node "$repo/tools/bake/import-results.mjs" "$@"
npx --no-install biome format --write "$repo/apps/web/src/world/bake/manifest.ts" >/dev/null 2>&1 || true
git -C "$repo" status --short -- apps/web/public/bake apps/web/src/world/bake/manifest.ts | sed 's/^/changed: /' || true
