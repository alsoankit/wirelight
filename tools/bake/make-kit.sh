#!/usr/bin/env bash
# Builds the self-contained bake kit for another Linux machine (Blender included, without this repo):
#   ./tools/bake/make-kit.sh [region…]  →  dist-bake/wirelight-bake-kit-<date>.zip
# With regions (./tools/bake/make-kit.sh 3), the kit holds only those regions' layouts.
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
if [[ $# -gt 0 ]]; then
  node -e '
    const { readFileSync, rmSync, writeFileSync } = require("node:fs");
    const [dir, ...regions] = process.argv.slice(1);
    const file = `${dir}/layouts.json`;
    const all = JSON.parse(readFileSync(file, "utf8"));
    const wanted = (l) => regions.some((r) => l.id.startsWith(`r${r}-`));
    for (const l of all.filter((l) => !wanted(l))) for (const x of [".glb", ".json"]) rmSync(`${dir}/${l.id}${x}`, { force: true });
    writeFileSync(file, `${JSON.stringify(all.filter(wanted), null, 1)}\n`);
  ' "$stage/in" "$@"
fi

# The official Blender, fetched once and checked against Blender's published sums.
blender_version=5.2.2
blender_file="blender-$blender_version-linux-x64.tar.xz"
blender_url="https://download.blender.org/release/Blender${blender_version%.*}"
cache="$repo/dist-bake/blender-cache"
mkdir -p "$cache" "$stage/blender"
[[ -f "$cache/$blender_file" ]] || curl -fL -o "$cache/$blender_file" "$blender_url/$blender_file"
[[ -f "$cache/blender-$blender_version.sha256" ]] || curl -fsS -o "$cache/blender-$blender_version.sha256" "$blender_url/blender-$blender_version.sha256"
(cd "$cache" && grep " $blender_file\$" "blender-$blender_version.sha256" | sha256sum -c -)
cp "$cache/$blender_file" "$stage/blender/"

cp "$repo/tools/bake/bake.py" "$stage/"
for f in verify.py pack.py run.sh README.md CLAUDE.md; do
  cp "$repo/tools/bake/kit/$f" "$stage/"
done
chmod +x "$stage/run.sh"
layouts="$(node -e 'console.log(require(process.argv[1]).length)' "$stage/in/layouts.json")"
# About 8 minutes a layout at best quality on 12 fast cores, as a range.
hours="$(node -e 'const n = +process.argv[1]; console.log(`${Math.max(1, Math.round(n * 0.1))}–${Math.ceil(n * 0.17)}`)' "$layouts")"
sed -i "s/{{LAYOUTS}}/$layouts/g; s/{{DATE}}/$date/g; s/{{HOURS}}/$hours/g" "$stage/README.md" "$stage/CLAUDE.md"

rm -f "$repo/dist-bake/$name.zip"
(cd "$repo/dist-bake" && zip -q -r -6 -n .xz "$name.zip" "$name")
echo "$repo/dist-bake/$name.zip ($(du -h "$repo/dist-bake/$name.zip" | cut -f1), $layouts layouts)"
