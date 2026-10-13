#!/usr/bin/env bash
# Packs the baked maps, their logs and the check report into wirelight-bake-results.zip (send that back).
set -euo pipefail
cd "$(dirname "$0")"
[[ -f out/report.json ]] || { echo "No out/report.json: run ./run.sh first"; exit 1; }
rm -f wirelight-bake-results.zip
mkdir -p .pack && cp in/layouts.json .pack/ && cp out/*.webp out/*.log.json out/report.json .pack/
(cd .pack && zip -q -9 ../wirelight-bake-results.zip ./*)
rm -rf .pack
echo "$(pwd)/wirelight-bake-results.zip ($(du -h wirelight-bake-results.zip | cut -f1))"
python3 -c 'import json; r = json.load(open("out/report.json")); print("verify:", "OK" if r["ok"] else str(len(r["problems"])) + " problem(s)")' || true
