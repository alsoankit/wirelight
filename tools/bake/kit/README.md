# Wirelight bake kit ({{DATE}})

This folder bakes the light for {{LAYOUTS}} of the game Wirelight's room layouts: soft moon shadows, lamp pools,
bounce light and contact shadows, each in two states (ruined and restored) plus an occlusion map.

**The room meshes in `in/` come from licensed asset kits and are here for baking only. Please don't
share them, upload them or use them for anything else. Delete the kit when you're done.**

## Run it
Unzip this anywhere with about 6 GB free, then either:
- open Claude Code in this folder and say **run the bake**, or
- run `bash run.sh` yourself.

That one command does the rest. Blender 5.2.2 is inside the kit and needs no installing. The PC stays
awake while it runs.

**Expected time:** {{HOURS}} hours on a 12-core desktop CPU. `run.log` (or the screen) shows each layout's
`ruin`, `lit` and `ao` lines and then `done in … s`; `lit` is by far the slowest.

It can be stopped at any time: run the same command again and finished layouts are skipped (the one in
progress starts over). `bash run.sh --quality draft` takes minutes and is only for checking that it works.

## Bring back
**`wirelight-bake-results.zip`** appears in this folder at the end, once every map passes the check.
Carry that one file back; nothing else is needed.

## What's in here
| | |
|---|---|
| `run.sh` | the one command: unpack Blender, bake, check, pack |
| `blender/` | Blender 5.2.2 for Linux, the official build (sha256 checked when this kit was made) |
| `in/` | each layout's room (`.glb`: geometry and lightmap UVs) and its lights and colours (`.json`) |
| `bake.py`, `verify.py`, `pack.py` | the bake, the check and the packing (Blender scripts) |
| `out/` | appears when you run it: the maps (`.webp`), a log per layout, `bake.log`, `report.json` |
