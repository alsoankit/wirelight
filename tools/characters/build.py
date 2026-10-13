# Builds one Wirelight character in Blender, exports it as GLB, and renders its contact sheet.
#
#   blender -b --python tools/characters/build.py -- <id> <out.glb> [<sheet dir>]
#
# Run from the repo root. <id> is a key of keepers.KEEPERS or creatures.CREATURES. The sheet is a set of
# PNGs (game view at game scale, close views, the clips' key poses) that build-all.sh joins into one.

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
import creatures  # noqa: E402
import keepers  # noqa: E402
import lib  # noqa: E402
from mathutils import Vector  # noqa: E402
from palette import MATERIALS  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1 :]
cid, out = argv[0], argv[1]
sheet = argv[2] if len(argv) > 2 else None

scene = lib.reset()
spec = keepers.KEEPERS.get(cid) or creatures.CREATURES[cid]
c = spec()
mats = {name: lib.material(name, **MATERIALS[name]) for name in c.mats}
tris = c.triangles()
obj, arm = c.build(mats)
if cid in creatures.CREATURES:
    creatures.clips(cid, c, arm)
else:
    keepers.keeper_clips(c, arm, **getattr(spec, "clips", {}))
height = max((obj.matrix_world @ Vector(v)).z for v in obj.bound_box)
print(f"CHARACTER {cid} triangles={tris} materials={c.mats} bones={list(c.bones)} height={height:.2f}")
lib.export(out)

if sheet:
    os.makedirs(sheet, exist_ok=True)
    lib.stage(scene)
    mid = height * 0.55
    facing = getattr(spec, "facing", 180)
    # 1. Game view, game scale: 19 m away at 28° → about 76 px per metre on a 720 px tall screen.
    lib.camera(scene, (0, 0, mid), lib.game_dir(facing), 19, fov=28 * 300 / 720, res=(260, 300))
    lib.render(scene, f"{sheet}/{cid}-0-game.png")
    # 2. Close views: the game's angle, front three-quarter, side.
    views = [("1-game-close", lib.game_dir(facing)), ("2-front", lib.game_dir(0)), ("3-side", (1, 0, 0.25))]
    for name, d in views:
        lib.camera(scene, (0, 0, mid), d, height * 3.4 + 1.0, fov=28, res=(520, 640))
        lib.render(scene, f"{sheet}/{cid}-{name}.png")
    # 3. Clip poses from the front three-quarter.
    lib.camera(scene, (0, 0, mid), lib.game_dir(0), height * 3.4 + 1.0, fov=28, res=(520, 640))
    for i, (clip_name, t) in enumerate(getattr(spec, "poses", [("Idle", 0.25), ("Asleep", 0.5)])):
        if clip_name in bpy.data.actions:
            lib.pose(arm, clip_name, t)
            lib.render(scene, f"{sheet}/{cid}-{4 + i}-{clip_name.lower()}.png")
