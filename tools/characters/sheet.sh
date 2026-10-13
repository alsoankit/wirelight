#!/usr/bin/env bash
# Build one character and join its renders into a contact sheet:  tools/characters/sheet.sh <id> <sheet dir> [glb]
set -euo pipefail
cd "$(dirname "$0")/../.."
id=$1; dir=$2; glb=${3:-$dir/$id.glb}
rm -f "$dir/raw/$id-"*.png
blender -b --python tools/characters/build.py -- "$id" "$glb" "$dir/raw" 2>&1 | grep -E "^CHARACTER|Traceback|Error:|line [0-9]+" | grep -v OCIO || true
montage "$dir/raw/$id-"*.png -tile x1 -geometry +4+4 -background '#222' "$dir/$id-sheet.png"
