#!/usr/bin/env bash
# Bakes every room layout on this machine, unattended, and brings the result into the game.
#
#   tools/bake/bake-laptop.sh                 best quality, every layout, then import and run the checks
#   tools/bake/bake-laptop.sh --commit        the same, and commit the new bake if every check passes
#   tools/bake/bake-laptop.sh --quality final --only r1-house-d1 --no-import --work /tmp/x   (a quick test)
#
# Steps: export the layouts from the rooms as they are in this checkout → bake them in Blender (CPU)
# → verify every map against the export → import into apps/web/public/bake → pnpm check, test and
# rooms:validate. Safe to stop: run the same command again and finished layouts are kept. After the
# rooms change, only the layouts whose geometry changed are baked again.
# The machine is kept awake while Blender runs. Everything is logged to <work>/bake.log.
set -uo pipefail

repo="$(cd "$(dirname "$0")/../.." && pwd)"
quality=best
only=""
work="$repo/assets-src/bake/laptop"
import=1
commit=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --quality) quality="$2"; shift 2 ;;
    --only) only="$2"; shift 2 ;;
    --work) work="$2"; shift 2 ;;
    --no-import) import=0; shift ;;
    --commit) commit=1; shift ;;
    -h | --help) sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "Unknown option: $1 (see --help)"; exit 2 ;;
  esac
done

blender="${BLENDER:-$(command -v blender || true)}"
if [[ -z "$blender" ]] || ! "$blender" -b --factory-startup --version >/dev/null 2>&1; then
  echo "Blender isn't installed or won't start (set BLENDER=/path/to/blender)."; exit 2
fi
mkdir -p "$work"
log="$work/bake.log"
say() { echo "[$(date '+%H:%M:%S')] $*" | tee -a "$log"; }
started=$(date +%s)
say "Wirelight bake: quality $quality, work folder $work, $("$blender" -b --factory-startup --version 2>/dev/null | head -1)"

# 1. Export the layouts. Keep earlier maps only if the rooms are exactly what they were.
fresh="$work/in.new"
rm -rf "$fresh"
only_args=()
[[ -n "$only" ]] && only_args=(--only "$only")
# Always every layout: the list (layouts.json) is only written for a full export. --only limits the bake.
if ! (cd "$repo" && node tools/bake/export.mjs --out "$fresh") >>"$log" 2>&1 || [[ ! -f "$fresh/layouts.json" ]]; then
  say "Export failed: see $log"; exit 1
fi
# Throw away only the layouts whose geometry changed (each has a signature); all of them if the
# quality changed or this is the first run.
if [[ -f "$work/in/layouts.json" && -f "$work/quality" && "$(cat "$work/quality")" == "$quality" && -d "$work/out" ]]; then
  changed=$(node -e '
    const [a, b] = process.argv.slice(1).map((f) => require(f));
    const before = new Map(a.map((l) => [l.id, l.signature]));
    console.log(b.filter((l) => before.get(l.id) !== l.signature).map((l) => l.id).join(" "));
  ' "$work/in/layouts.json" "$fresh/layouts.json")
  for id in $changed; do rm -f "$work/out/$id"-*.webp "$work/out/$id".log.json; done
  if [[ -z "$changed" ]]; then say "Rooms unchanged since the last run: finished layouts are kept."
  else say "Changed since the last run, baked again: $changed"; fi
else
  say "Starting clean (the quality changed, or this is the first run)."
  rm -rf "$work/out"
fi
rm -rf "$work/in" && mv "$fresh" "$work/in"
echo "$quality" >"$work/quality"
mkdir -p "$work/out"
layouts=$(node -e 'console.log(require(process.argv[1]).length)' "$work/in/layouts.json")
say "$layouts layouts to bake."

# 2. Bake, kept awake. Blender's own exit status, not the filter's.
awake=()
command -v systemd-inhibit >/dev/null 2>&1 &&
  awake=(systemd-inhibit --what=idle:sleep:handle-lid-switch --who=wirelight-bake --why="Lightmap bake")
run_log="$work/last-run.log"
"${awake[@]}" "$blender" -b --factory-startup --python "$repo/tools/bake/bake.py" -- \
  --in "$work/in" --out "$work/out" --quality "$quality" --cpu "${only_args[@]}" 2>&1 |
  tee "$run_log" | tee -a "$log" | grep --line-buffered -E '^\[bake\]|^\[[0-9]+/[0-9]+\]|Traceback'
status=${PIPESTATUS[0]}
# Blender exits 0 even when the script inside it raised: a traceback is a failure too.
grep -q '^Traceback' "$run_log" && status=1
say "Bake finished in $(( ($(date +%s) - started) / 60 )) min (Blender exit $status)."
[[ "$status" == 0 ]] || { say "The bake stopped with an error: see $log. Run the same command again to resume."; exit 1; }

# 3. Verify every map against the export (a partial --only run can't be verified or imported).
if [[ -n "$only" ]]; then
  say "Partial run ($only) baked into $work/out. Not verified or imported: run without --only for that."; exit 0
fi
"$blender" -b --factory-startup --python "$repo/tools/bake/kit/verify.py" -- --in "$work/in" --out "$work/out" 2>&1 |
  grep -E '^\[verify\]' | tee -a "$log"
if ! grep -q '"ok": true' "$work/out/report.json" 2>/dev/null; then
  say "Verification failed: nothing was imported. See $work/out/report.json."; exit 1
fi
[[ "$import" == 1 ]] || { say "Verified. Not imported (--no-import)."; exit 0; }

# 4. Import into the game, then the project's own checks.
if ! "$repo/tools/bake/import-results.sh" "$work/out" 2>&1 | tee -a "$log"; then
  say "Import failed: see $log"; exit 1
fi
cd "$repo"
if pnpm check >>"$log" 2>&1 && pnpm test >>"$log" 2>&1 && pnpm rooms:validate >>"$log" 2>&1; then
  say "All checks pass."
else
  say "A check failed after the import: see $log. Nothing was committed."; exit 1
fi

# 5. Commit the bake (only with --commit), as whoever this checkout's git identity is.
if [[ "$commit" == 1 ]]; then
  git add apps/web/public/bake apps/web/src/world/bake/manifest.ts &&
    git commit -q -m "Rebake every room at $quality quality" &&
    say "Committed $(git log -1 --format=%h). Push with: git push"
else
  say "Done. To keep it: git add apps/web/public/bake apps/web/src/world/bake/manifest.ts && git commit -m \"Rebake every room at $quality quality\" && git push"
fi
say "Total time $(( ($(date +%s) - started) / 60 )) min."
