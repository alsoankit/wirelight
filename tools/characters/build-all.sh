#!/usr/bin/env bash
# Builds every Wirelight character in Blender and ships it:
#   assets-src/characters/<id>.glb          what Blender exports (uncompressed, for inspection)
#   apps/web/public/assets/characters/<id>.glb   meshopt-compressed (gltf-transform), what the game loads
# With a sheet dir, also renders each one's contact sheet there:
#   tools/characters/build-all.sh [<sheet dir>]
set -euo pipefail
cd "$(dirname "$0")/../.."
IDS=(keeper-r1 keeper-r2 keeper-r3 keeper-r4 owl moss-spirit stone-warden messenger)
SRC=assets-src/characters
OUT=apps/web/public/assets/characters
mkdir -p "$SRC" "$OUT"
sheet=${1:-}
for id in "${IDS[@]}"; do
  if [[ -n $sheet ]]; then
    tools/characters/sheet.sh "$id" "$sheet" "$SRC/$id.glb" &
  else
    blender -b --python tools/characters/build.py -- "$id" "$SRC/$id.glb" 2>&1 | grep -E "^CHARACTER|Traceback|Error:" | grep -v OCIO &
  fi
done
wait
for id in "${IDS[@]}"; do
  npx -y @gltf-transform/cli@4.5.1 meshopt "$SRC/$id.glb" "$OUT/$id.glb" >/dev/null
  printf '%-14s %6s bytes\n' "$id" "$(stat -c %s "$OUT/$id.glb")"
done
