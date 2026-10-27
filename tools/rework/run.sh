#!/usr/bin/env bash
# Reworks every model in tools/rework/assets.json (or the slugs given), one Blender at a time.
# Usage: tools/rework/run.sh [slug …]   FINAL=1 bakes at final quality (rework.py --final)    Logs: assets-src/rework/<slug>/log.txt; summary at the end.
set -uo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$root"
if [ $# -gt 0 ]; then slugs=("$@"); else mapfile -t slugs < <(python3 -I -c 'import json;[print(a["slug"]) for a in json.load(open("tools/rework/assets.json"))]'); fi
for slug in "${slugs[@]}"; do
  mkdir -p "assets-src/rework/$slug"
  rm -f "assets-src/rework/$slug/report.json" # a stale report must not pass a failed run
  start=$(date +%s)
  if blender -b --factory-startup --disable-autoexec --python tools/rework/rework.py -- --slug "$slug" ${FINAL:+--final} > "assets-src/rework/$slug/log.txt" 2>&1 \
    && [ -f "assets-src/rework/$slug/report.json" ]; then
    echo "ok     $slug ($(( $(date +%s) - start )) s)"
  else
    echo "FAILED $slug ($(( $(date +%s) - start )) s): $(grep -m1 -E 'Error|error|SystemExit' "assets-src/rework/$slug/log.txt")"
  fi
done
