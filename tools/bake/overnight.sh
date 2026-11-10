#!/usr/bin/env bash
# The unattended bake on this laptop: best-quality light for the chosen regions, imported and committed,
# then those regions' room pictures recaptured with the new light and committed. Safe to stop and run
# again: finished layouts are kept. Nothing is pushed. Keeps the machine awake throughout.
#
#   tools/bake/overnight.sh            Regions 1 and 2 (0119: get them right first)
#   tools/bake/overnight.sh 1,2,3      other regions
#   tools/bake/overnight.sh 1,2 --fresh   bake them all again (after a lighting change in bake.py)
#
# Logged to assets-src/bake/overnight.log (and the bake itself to assets-src/bake/laptop/bake.log).
set -uo pipefail

regions="${1:-1,2}"
fresh=()
[[ "${2:-}" == "--fresh" ]] && fresh=(--fresh)
repo="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$repo"
log="assets-src/bake/overnight.log"
mkdir -p "$(dirname "$log")"
say() { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$log"; }

# Stay awake for the whole run (bake and capture), not only while Blender runs.
if [[ -z "${WIRELIGHT_AWAKE:-}" ]] && command -v systemd-inhibit >/dev/null 2>&1; then
  exec env WIRELIGHT_AWAKE=1 systemd-inhibit --what=idle:sleep:handle-lid-switch --who=wirelight-bake \
    --why="Wirelight overnight bake" "$0" "$@"
fi

# Work only from committed code, so the bake matches what's in git.
if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  say "Uncommitted changes: commit or stash them first, so the bake matches the code."; exit 1
fi
say "Overnight bake: regions $regions, branch $(git branch --show-current) at $(git log -1 --format='%h %s')"
started=$(date +%s)

# 1. Bake (export, Blender at best quality, verify, import keeping the other regions, checks, commit).
if ! tools/bake/bake-laptop.sh --quality best --regions "$regions" "${fresh[@]}" --commit; then
  say "The bake stopped: see assets-src/bake/laptop/bake.log. Run '$0 $regions' again to resume."; exit 1
fi

# 2. Recapture those regions' room pictures with the new light, from a dev server on port 5199.
say "Recapturing the room pictures for regions $regions…"
pkill -f "vite.*--port 5199" 2>/dev/null || true
(cd apps/web && exec pnpm dev --port 5199 --host 127.0.0.1) >>"$log" 2>&1 &
server=$!
for _ in $(seq 1 90); do
  curl -s -o /dev/null -m 2 http://127.0.0.1:5199/ && break
  sleep 1
done
captured=0
node tools/shots/capture-rooms.mjs http://127.0.0.1:5199/play --regions "$regions" >>"$log" 2>&1 && captured=1
kill "$server" 2>/dev/null
pkill -f "vite.*--port 5199" 2>/dev/null || true

# 3. Commit the pictures if every check passes.
if [[ "$captured" == 1 ]]; then
  git add apps/web/public/prerender apps/web/src/world/prerender/pictures.json 2>/dev/null
  if git diff --cached --quiet; then
    say "The pictures didn't change."
  elif pnpm check >>"$log" 2>&1 && pnpm test >>"$log" 2>&1 && pnpm rooms:validate >>"$log" 2>&1; then
    git commit -q -m "Recapture region $regions room pictures with the new light" && say "Committed $(git log -1 --format=%h)."
  else
    git reset -q
    say "A check failed after the capture: pictures left uncommitted. See $log."
  fi
else
  say "The picture capture failed (see $log). The bake is committed; recapture later with:"
  say "  node tools/shots/capture-rooms.mjs http://127.0.0.1:5199/play --regions $regions"
fi
say "Done in $(( ($(date +%s) - started) / 60 )) min. Nothing was pushed."
