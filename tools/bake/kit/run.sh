#!/usr/bin/env bash
# One command for the whole job: unpacks the Blender in this kit, bakes every layout in in/ into out/
# at best quality on the CPU, checks the results and, when they pass, packs wirelight-bake-results.zip.
#   bash run.sh [--quality draft|final|best] [--only id,id] [--force]
# Resumable: run it again after a stop or a failure and finished layouts are skipped.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
cd "$here"

archive="$(ls blender/blender-*-linux-x64.tar.xz | head -1)"
bundled="$here/blender/$(basename "$archive" .tar.xz)/blender"
if [[ ! -x "$bundled" ]]; then
  echo "Unpacking $archive…"
  tar -xf "$archive" -C blender
fi

# $BLENDER if set, else the kit's own, else one already on this machine.
works() { [[ -n "$1" ]] && "$1" -b --factory-startup --version >/dev/null 2>&1; }
blender=""
for candidate in "${BLENDER:-}" "$bundled" "$(command -v blender || true)"; do
  if works "$candidate"; then blender="$candidate"; break; fi
done
if [[ -z "$blender" ]]; then
  echo "Blender won't start. Its libraries are probably missing; this usually fixes it:"
  echo "  sudo apt-get install -y libx11-6 libxi6 libxxf86vm1 libxfixes3 libxrender1 libxkbcommon0 libsm6 libgl1 libegl1"
  "$bundled" --version 2>&1 | tail -3 || true
  exit 2
fi
echo "Using $blender ($("$blender" -b --factory-startup --version 2>/dev/null | grep -m1 '^Blender'))"

mkdir -p out
start=$(date +%s)
# Keep the machine awake through a long run.
awake=()
command -v systemd-inhibit >/dev/null 2>&1 && awake=(systemd-inhibit --what=idle:sleep --who=wirelight-bake --why="Lightmap bake")
# Blender's own exit status (not the filter's): read PIPESTATUS before anything else runs.
set +e
"${awake[@]}" "$blender" -b --factory-startup --python bake.py -- --in in --out out --quality best --cpu "$@" 2>&1 |
  tee -a out/bake.log | grep --line-buffered -E '^\[bake\]|Traceback'
status=${PIPESTATUS[0]}
set -e
echo "Bake finished in $(( ($(date +%s) - start) / 60 )) min (exit $status)"
"$blender" -b --factory-startup --python verify.py -- --in in --out out 2>&1 | grep -E '^\[verify\]' | tee -a out/bake.log || true
if [[ "$status" == 0 ]] && grep -q '"ok": true' out/report.json; then
  "$blender" -b --factory-startup --python pack.py 2>&1 | grep -E '^\[pack\]' | tee -a out/bake.log
else
  echo "Not packed: fix what's listed above, then run this again."
  exit 1
fi
