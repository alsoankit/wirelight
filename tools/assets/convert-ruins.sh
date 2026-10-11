#!/usr/bin/env bash
# Converts Quaternius's Ultimate Modular Ruins pack (OBJ) into compressed glTF for the game.
# Raw files stay in assets-src/_downloads (git-ignored, decision 0048); only these converted
# files ship, in apps/web/public/assets/region-1/ruins/.
#
# Usage: tools/assets/convert-ruins.sh   (from the repo root; needs network for npx the first time)
set -euo pipefail

SRC="assets-src/_downloads/quaternius-ultimate-modular-ruins/Ultimate Modular Ruins Pack - Aug 2021/OBJ"
OUT="apps/web/public/assets/region-1/ruins"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# Pinned: obj2gltf 3.1.6 crashes on Node 24 ("defaultValue is not a function"); 3.2.0 works.
OBJ2GLTF="npx -y obj2gltf@3.2.0"
GLTF_TRANSFORM="npx -y @gltf-transform/cli@4.5.1"

[ -d "$SRC" ] || { echo "Missing $SRC: download the pack first (see findings/3d-kits.md)." >&2; exit 1; }
mkdir -p "$OUT"

for obj in "$SRC"/*.obj; do
  name="$(basename "$obj" .obj)"
  # The animated character needs its FBX (OBJ has no animation); it isn't used in rooms.
  [ "$name" = "Character_Animated" ] && continue
  $OBJ2GLTF -i "$obj" -o "$TMP/$name.glb" >/dev/null
  # Keep named materials (the restyling shader targets them), so no palette or joining across materials.
  $GLTF_TRANSFORM optimize "$TMP/$name.glb" "$OUT/$name.glb" \
    --compress meshopt --simplify false --palette false --instance false --texture-compress false >/dev/null
  echo "$name"
done

echo "Converted $(ls "$OUT"/*.glb | wc -l) pieces into $OUT ($(du -sh "$OUT" | cut -f1))."
