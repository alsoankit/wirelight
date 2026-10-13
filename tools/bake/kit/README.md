# Wirelight bake kit ({{DATE}})

This folder bakes the light for the game Wirelight's rooms: soft moon shadows, lamp pools, bounce
light and contact shadows, for {{LAYOUTS}} room layouts, each in two states (ruined and restored) plus
an occlusion map. It runs Blender's Cycles renderer with no window, then checks its own output.

**The room meshes in `in/` come from licensed asset kits and are here for baking only. Please don't
share them, upload them or use them for anything else. Delete the kit when you're done.**

## What you need
- **Blender 4.2 or later** (made with 5.2). From blender.org; the Steam version works too.
- An **NVIDIA graphics card with a current driver** (OptiX is used when it's there, then CUDA). It
  also runs on the CPU, just much more slowly.
- About 2 GB of free disk space.

## Run it (one command)
- **Linux:** `./run.sh --quality final`
- **Windows (PowerShell):** `.\run.ps1 --quality final`
  (if scripts are blocked: `powershell -ExecutionPolicy Bypass -File .\run.ps1 --quality final`)

If Blender isn't found, set its path first: `BLENDER=/path/to/blender ./run.sh …` or
`$env:BLENDER="C:\…\blender.exe"`.

The first lines of output name the Blender version and the device (for example `OPTIX: NVIDIA TITAN
RTX`). Each layout then prints three lines (`ruin`, `lit`, `ao`), or six when it also has a `-kit` map set, and a `done in … s` line.

**Expected time:** about 1 minute per layout on a recent NVIDIA card at `final` quality, so roughly
20–40 minutes in all. `--quality draft` takes a few minutes and is only for checking that it works.

It can be stopped at any time: run the same command again and finished layouts are skipped. To redo
one layout: `./run.sh --quality final --only r1-observatory-d1 --force`.

At the end, the check runs by itself and says `[verify] N/N maps present; 0 problem(s)`.

## Send back
- **Linux:** `./pack-results.sh` · **Windows:** `.\pack-results.ps1`

This makes `wirelight-bake-results.zip` (maps, logs and the check report, about 10–30 MB). Send that
file back; nothing else is needed.

## What's in here
| | |
|---|---|
| `in/` | each layout's room (`.glb`: geometry and lightmap UVs) and its lights and colours (`.json`); `layouts.json` lists them |
| `bake.py` | the bake (Blender script); the lighting is decided there and in the JSON: please don't change it |
| `verify.py` | checks every map exists, has the right size and isn't black; writes `out/report.json` |
| `run.sh`, `run.ps1` | find Blender, bake everything, then check |
| `pack-results.sh`, `.ps1` | pack the results for sending back |
| `out/` | appears when you run it: the maps (`.webp`), a log per layout, `bake.log`, `report.json` |
