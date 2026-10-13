#!/usr/bin/env bash
# Builds the self-contained bake kit for another machine (a GPU box with Blender, without this repo):
#   ./tools/bake/make-kit.sh  →  dist-bake/wirelight-bake-kit-<date>.zip
# The layouts are exported now, from the rooms as they are in this checkout: build the kit after the
# art you want baked has landed. Bring the results back with tools/bake/import-results.sh.
set -euo pipefail
repo="$(cd "$(dirname "$0")/../.." && pwd)"
date="$(date +%Y-%m-%d)"
name="wirelight-bake-kit-$date"
stage="$repo/dist-bake/$name"
rm -rf "$stage" && mkdir -p "$stage/in"

echo "Exporting layouts…"
node "$repo/tools/bake/export.mjs" --out "$stage/in" | sed 's/^/  /'

cp "$repo/tools/bake/bake.py" "$stage/"
for f in verify.py run.sh run.ps1 pack-results.sh pack-results.ps1 README.md CLAUDE.md; do
  cp "$repo/tools/bake/kit/$f" "$stage/"
done
chmod +x "$stage/run.sh" "$stage/pack-results.sh"
layouts="$(node -e 'console.log(require(process.argv[1]).length)' "$stage/in/layouts.json")"
sed -i "s/{{LAYOUTS}}/$layouts/g; s/{{DATE}}/$date/g" "$stage/README.md" "$stage/CLAUDE.md"

rm -f "$repo/dist-bake/$name.zip"
(cd "$repo/dist-bake" && zip -q -r -9 "$name.zip" "$name")
echo "$repo/dist-bake/$name.zip ($(du -h "$repo/dist-bake/$name.zip" | cut -f1), $layouts layouts)"
