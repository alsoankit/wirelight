#!/usr/bin/env bash
# Bakes every layout in in/ into out/, then checks the results.
#   ./run.sh [--quality draft|final] [--only id,id] [--force] [--cpu]
# Resumable: rerun after a failure or an interruption and finished layouts are skipped.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
cd "$here"

find_blender() {
  if [[ -n "${BLENDER:-}" && -x "${BLENDER}" ]]; then echo "$BLENDER"; return; fi
  if command -v blender >/dev/null 2>&1; then command -v blender; return; fi
  for b in /opt/blender*/blender /usr/local/blender*/blender "$HOME"/blender*/blender "$HOME"/Applications/blender*/blender \
    /snap/bin/blender /Applications/Blender.app/Contents/MacOS/Blender; do
    [[ -x "$b" ]] && { echo "$b"; return; }
  done
  return 1
}

blender="$(find_blender)" || { echo "Blender not found: install Blender 4.2 or later, or set BLENDER=/path/to/blender"; exit 2; }
version="$("$blender" --version 2>/dev/null | head -1)"
echo "Using $blender ($version)"
major="$(echo "$version" | sed -nE 's/^Blender ([0-9]+)\.([0-9]+).*/\1/p')"
minor="$(echo "$version" | sed -nE 's/^Blender ([0-9]+)\.([0-9]+).*/\2/p')"
if [[ -n "$major" ]] && (( major < 4 || (major == 4 && minor < 2) )); then
  echo "Blender $major.$minor is too old: 4.2 or later is needed"; exit 2
fi
if command -v nvidia-smi >/dev/null 2>&1; then nvidia-smi --query-gpu=name,driver_version,memory.total --format=csv,noheader || true; fi

mkdir -p out
start=$(date +%s)
# Blender's own exit status (not the filter's): read PIPESTATUS before anything else runs.
set +e
"$blender" -b --factory-startup --python bake.py -- --in in --out out "$@" 2>&1 | tee -a out/bake.log | grep --line-buffered -E '^\[bake\]|Error|error'
status=${PIPESTATUS[0]}
set -e
echo "Bake finished in $(( ($(date +%s) - start) / 60 )) min (exit $status)"
"$blender" -b --factory-startup --python verify.py -- --in in --out out 2>&1 | grep -E '^\[verify\]' || true
exit "$status"
