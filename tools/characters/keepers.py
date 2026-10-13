# The keepers: one per region, the same rig and clips so the game treats them alike.
#
# Bones (every keeper): root > body > chest > head > eye / light, plus lantern > flame where it carries
# one. `eye` marks where its beam starts; `light` where its lantern light sits (a point light goes there);
# `heart` where arriving messages end (the lantern it holds, or its folded hands).
# Clips (every keeper): Idle (4 s loop), Asleep (6 s loop, head bowed), Bow (1 s, once).
#
# Rules (owner): nothing that reads as a doll, a robot or a cap; never horror (no dark hooded figure);
# the world is old, the tools are modern; calm idle only; attendants of brass, stone and lantern light.

import math

from lib import TAU, Character, R, S, T, aim, noise, smooth, wave

TURRETS = "assets-src/_downloads/quaternius-turret-pack/Turret Pack - March 2020/OBJ"


def keeper_bones(c, chest_z, head_z, eye, light, heart, lantern=None, flame=None, arms=None):
    c.bone("root", (0, 0, 0), 0.1)
    c.bone("body", (0, 0, 0.1), chest_z - 0.1, "root")
    c.bone("chest", (0, 0, chest_z), head_z - chest_z, "body")
    c.bone("head", (0, 0, head_z), 0.2, "chest")
    c.bone("eye", eye, 0.05, "head")
    c.bone("heart", heart, 0.05, "chest")
    if lantern:
        c.bone("lantern", lantern, 0.1, arms[0] if arms and arms[0] in c.bones else "chest")
        c.bone("light", light, 0.05, "lantern")
    else:
        c.bone("light", light, 0.05, "head")


def keeper_clips(c, arm, extra_idle=None, extra_sleep=None, extra_bow=None):
    """The shared clips. extra_*: more bone channels (lantern sway, arms) per keeper."""
    from lib import clip

    has_lantern = "lantern" in c.bones

    def idle_lantern(t):
        return {"rz": 2.2 * wave(t, 1), "rx": 1.6 * wave(t, 1, 0.3)}

    idle = {
        "body": lambda t: {"rz": 0.4 * wave(t, 1, 0.1)},
        "chest": lambda t: {"ly": 0.006 * wave(t, 1), "sx": 1 + 0.008 * wave(t, 1), "rx": 0.6 * wave(t, 1, 0.2)},
        "head": lambda t: {"ry": 4 * wave(t, 1, 0.15), "rx": 1.5 * wave(t, 2, 0.4), "rz": 1.0 * wave(t, 1, 0.6)},
    }
    if has_lantern:
        idle["lantern"] = idle_lantern
    idle.update(extra_idle or {})
    clip(arm, "Idle", 120, idle)

    sleep = {
        "body": lambda t: {"rx": 3},
        "chest": lambda t: {"rx": 7 + 0.8 * wave(t, 1), "ly": 0.004 * wave(t, 1) - 0.01, "sx": 1 + 0.006 * wave(t, 1)},
        "head": lambda t: {"rx": 24 + 1.2 * wave(t, 1, 0.1), "rz": 3},
    }
    if has_lantern:
        sleep["lantern"] = lambda t: {"rx": -9 + 0.8 * wave(t, 1, 0.3), "rz": 0.8 * wave(t, 1)}
    sleep.update(extra_sleep or {})
    clip(arm, "Asleep", 180, sleep)

    def bump(t):
        return math.sin(math.pi * t)

    bow = {
        "chest": lambda t: {"rx": 5 * bump(t)},
        "head": lambda t: {"rx": 12 * bump(t)},
    }
    if has_lantern:
        bow["lantern"] = lambda t: {"rx": -6 * bump(t)}
    bow.update(extra_bow or {})
    clip(arm, "Bow", 30, bow)


# --------------------------------------------------------------------------------------------------------
# Region 1: the moss keeper. A stone attendant like an old garden lantern that learned to stand: a robe of
# carved stone, a mantle of moss over its shoulders, hands folded in its sleeves, and a brass lantern for
# a head with one warm eye.


def lantern_head(c, z0, bone, r=0.17, h=0.26, segs=6, brass="Brass", glass="Glass", roof_h=0.17, eye_z=None,
                 moss=None):
    """A brass lantern: base plate, glowing panes, corner posts, a roof and a ring."""
    c.cyl(r, r * 0.95, 0.05, segs, brass, bone, T(0, 0, z0), phase=math.pi / segs)
    c.cyl(r * 0.84, r * 0.84, h, segs, glass, bone, T(0, 0, z0 + 0.05), phase=math.pi / segs)
    for i in range(segs):
        a = i / segs * TAU
        c.box(0.024, 0.024, h, brass, bone, T(math.sin(a) * r * 0.9, -math.cos(a) * r * 0.9, z0 + 0.05 + h / 2) @ R(0, 0, math.degrees(a)))
    top = z0 + 0.05 + h
    c.cyl(r * 1.05, r * 1.05, 0.03, segs, brass, bone, T(0, 0, top), phase=math.pi / segs)
    c.lathe([(r * 1.15, top + 0.03), (r * 0.5, top + roof_h * 0.7), (0.035, top + roof_h), (0.0, top + roof_h + 0.01)],
            segs, brass, bone, phase=math.pi / segs)
    c.torus(0.045, 0.012, 10, 4, brass, bone, T(0, 0, top + roof_h + 0.05) @ R(90, 0, 0))
    if moss:
        moss(top + roof_h * 0.4)
    return top + roof_h + 0.09


def moss_clump(c, at, size, seed, bone="chest", flat=0.45, mat="Moss"):
    def warp(p):
        n = noise(p.x * 9 + seed, p.y * 9, p.z * 9)
        return p * (n - 0.5) * 0.7

    c.ico(size, 1, mat, bone, T(*at) @ S(1.0, 1.0, flat), warp=warp)


def roots(c, count, radius_at, seed, bone="body", height=0.55, mat="Root"):
    """Roots climbing from the floor around a robe: tapering tubes that wind upward."""
    for k in range(count):
        a0 = seed + k * TAU / count + 0.4 * math.sin(seed * 3 + k)
        h = height * (0.6 + 0.4 * noise(k * 1.7, seed, 0.3))
        turn = (0.9 + 0.5 * noise(seed, k, 1.0)) * (1 if k % 2 else -1)
        pts, rad = [], []
        for i in range(7):
            t = i / 6
            z = -0.02 + t * h
            a = a0 + turn * t
            r = radius_at(z) + 0.025 + (0.12 * (1 - t) ** 3)
            pts.append((math.sin(a) * r, -math.cos(a) * r, z))
            rad.append(0.035 * (1 - t) + 0.006)
        c.tube(pts, rad, 5, mat, bone)


def moss_shawl(c, z_top, r_top, z_low, r_low, segs, seed, bone="chest", M=None):
    """A mantle of moss draped over the shoulders, its lower edge ragged."""

    def warp(a, z, r):
        if z > z_low + 1e-4:
            return (0, 0, 0)
        drop = 0.09 * noise(math.cos(a) * 3 + seed, math.sin(a) * 3, seed) + 0.03 * math.sin(a * 7 + seed)
        return (0, 0, -drop)

    c.lathe([(r_low, z_low), (r_low + 0.015, (z_low + z_top) / 2), (r_top, z_top), (r_top * 0.55, z_top + 0.03)],
            segs, "Moss", bone, M=M, warp=warp, cap_bottom=False, phase=0.2)


def keeper_r1():
    c = Character("keeper-r1")
    stone = "Stone"

    # The robe: carved stone falling in folds to a ragged hem that spreads on the floor, a little train
    # behind.
    def robe_r(z):
        return 0.36 - 0.1 * smooth(0.0, 0.8, z)

    def folds(a, z, r):
        f = (0.045 * math.sin(a * 7 + 0.4) + 0.02 * math.sin(a * 3 + 1.1)) * (1 - smooth(0.6, 1.0, z))
        back = 0.07 * max(0.0, -math.cos(a)) * (1 - smooth(0.0, 0.45, z))
        dz = 0.03 * noise(math.cos(a) * 4, math.sin(a) * 4, 2.0) if z < 0.01 else 0
        return (math.sin(a) * (f + back), -math.cos(a) * (f + back), dz)

    c.lathe([(0.38, 0.0), (0.355, 0.1), (0.31, 0.35), (0.28, 0.62), (0.265, 0.85), (0.27, 0.96)], 14, stone, "body",
            warp=folds, cap_top=False)
    c.torus(0.268, 0.016, 20, 4, "Brass", "body", T(0, 0, 0.8))
    roots(c, 4, robe_r, 0.7)

    # Upper body, stooped a little forward toward its doors; the lantern head held level. Shoulders
    # broader than deep, rounding into the neck.
    lean = Character.pivot((0, 0, 0.95), R(9, 0, 0))
    c.frame(lean)

    def shoulders(a, z, r):
        sx = 1 + 0.5 * smooth(0.95, 1.12, z) * (1 - smooth(1.2, 1.32, z))
        sy = 0.82
        x, y = math.sin(a) * r, -math.cos(a) * r
        return (x * (sx - 1), y * (sy - 1), 0)

    c.lathe([(0.27, 0.94), (0.28, 1.04), (0.285, 1.13), (0.25, 1.21), (0.17, 1.28), (0.11, 1.31)], 12, stone, "chest",
            warp=shoulders, cap_bottom=False)
    # Moss draped over the shoulders and down the back, in clumps and hanging strands.
    for i, (x, y, z, s, f) in enumerate([(-0.3, 0.02, 1.17, 0.15, 0.5), (0.3, 0.03, 1.17, 0.14, 0.5),
                                         (-0.12, 0.1, 1.25, 0.13, 0.5), (0.12, 0.1, 1.24, 0.12, 0.5),
                                         (0.0, 0.2, 1.1, 0.14, 0.8), (-0.22, 0.17, 1.05, 0.11, 0.9),
                                         (0.24, 0.16, 1.02, 0.1, 0.9), (-0.38, -0.04, 1.08, 0.09, 0.8)]):
        moss_clump(c, (x, y, z), s, i * 3.1, flat=f)
    for i, (x, y) in enumerate([(-0.24, 0.21), (0.04, 0.25), (0.27, 0.19), (-0.4, 0.04), (0.41, 0.02), (-0.1, 0.24)]):
        top, ln = 1.08, 0.2 + 0.14 * (i % 2)
        c.tube([(x, y, top), (x * 1.04, y + 0.03, top - ln * 0.5), (x * 1.06, y + 0.02, top - ln)],
               [0.035, 0.024, 0.006], 4, "Moss", "chest")
    # Sleeves from the shoulders to the folded hands, brass cuffs where they meet.
    for side in (-1, 1):
        a, b = (side * 0.37, 0.0, 1.12), (side * 0.07, -0.3, 0.86)
        c.cyl(0.1, 0.13, 1, 7, stone, "chest", aim(a, b))
        c.torus(0.125, 0.015, 12, 4, "Brass", "chest", aim(b, (b[0] * 2, b[1] - 0.02, b[2] - 0.05)) @ S(1, 1, 0.0001))
    c.box(0.2, 0.12, 0.1, stone, "chest", T(0, -0.3, 0.84) @ R(10, 0, 0))
    c.cyl(0.12, 0.105, 0.07, 8, "Brass", "chest", T(0, 0, 1.28))

    # Head: the lantern, its panes softly lit, one eye on its front pane.
    c.frame(lean @ Character.pivot((0, 0, 1.32), R(-9, 0, 0)))

    def roof_moss(z):
        moss_clump(c, (0.06, 0.05, z), 0.08, 21.0, "head", 0.5)

    lantern_head(c, 1.33, "head", r=0.16, h=0.25, moss=roof_moss)
    c.cyl(0.05, 0.05, 0.03, 10, "Brass", "head", T(0, -0.13, 1.5) @ R(90, 0, 0))
    c.cyl(0.037, 0.037, 0.012, 10, "Eye", "head", T(0, -0.162, 1.5) @ R(90, 0, 0))
    c.frame(None)
    c.bone("root", (0, 0, 0), 0.1)
    c.bone("body", (0, 0, 0.1), 0.85, "root")
    c.frame(lean)
    c.bone("chest", (0, 0, 0.95), 0.36, "body")
    c.bone("heart", (0, -0.33, 0.86), 0.05, "chest")
    c.frame(lean @ Character.pivot((0, 0, 1.32), R(-9, 0, 0)))
    c.bone("head", (0, 0, 1.32), 0.2, "chest")
    c.bone("eye", (0, -0.17, 1.5), 0.05, "head")
    c.bone("light", (0, 0, 1.5), 0.05, "head")
    c.frame(None)
    return c


def hanging_lantern(c, hook, bone, r=0.09, h=0.14, segs=6):
    """A small brass lantern hanging from a hook point by a short chain. Returns its light's centre."""
    x, y, z = hook
    c.torus(0.025, 0.007, 8, 4, "Iron", bone, T(x, y, z) @ R(90, 0, 0))
    c.cyl(0.005, 0.005, 0.06, 4, "Iron", bone, T(x, y, z - 0.085))
    top = z - 0.09
    c.lathe([(0.0, top), (0.03, top - 0.005), (r * 1.1, top - 0.05), (r * 1.0, top - 0.06)], segs, "Brass", bone,
            phase=math.pi / segs, cap_bottom=True)
    c.cyl(r * 0.8, r * 0.8, h, segs, "Glass", bone, T(x, y, top - 0.06 - h), phase=math.pi / segs)
    for i in range(segs):
        ang = i / segs * TAU
        c.box(0.016, 0.016, h, "Brass", bone,
              T(x + math.sin(ang) * r * 0.86, y - math.cos(ang) * r * 0.86, top - 0.06 - h / 2) @ R(0, 0, math.degrees(ang)))
    c.cyl(r * 0.95, r * 1.05, 0.035, segs, "Brass", bone, T(x, y, top - 0.095 - h), phase=math.pi / segs)
    return (x, y, top - 0.06 - h / 2)


def shoulder_warp(z0, z1, z2, z3, widen=0.5, depth=0.82):
    def warp(a, z, r):
        sx = 1 + widen * smooth(z0, z1, z) * (1 - smooth(z2, z3, z))
        x, y = math.sin(a) * r, -math.cos(a) * r
        return (x * (sx - 1), y * (depth - 1), 0)

    return warp


# --------------------------------------------------------------------------------------------------------
# Region 2: the sorter. A clockwork attendant: a walnut cabinet of tiny drawers on a brass gear foot,
# a gear-collar swivel and a domed brass turret head with one lens; four thin brass arms with stamps
# folded at its sides, and a small lamp hung on a bracket before it.


def keeper_r2():
    c = Character("keeper-r2")
    kit = {"Dark": "Copper", "Light": "Brass"}
    # The gear foot (Turret Pack: Base).
    c.obj_part(f"{TURRETS}/Base.obj", "Base", kit, "body", S(0.5, 0.5, 0.5))
    # The cabinet: square walnut, a little wider at the top, tiny drawers flush on its sides and back, a
    # clock dial on its front.
    c.lathe([(0.25, 0.26), (0.25, 0.5), (0.29, 1.0), (0.31, 1.2), (0.31, 1.24)], 4, "Walnut", "body",
            phase=math.pi / 4, cap_bottom=False, M=S(1, 0.85, 1))
    c.cyl(0.33, 0.33, 0.05, 4, "Brass", "body", T(0, 0, 1.2) @ S(1, 0.85, 1), phase=math.pi / 4)
    c.cyl(0.27, 0.27, 0.04, 4, "Brass", "body", T(0, 0, 0.26) @ S(1, 0.85, 1), phase=math.pi / 4)
    for side in range(4):
        rot = side * 90
        half_w = 0.25 * 0.707 * (0.85 if side % 2 == 0 else 1)
        depth = 0.25 * 0.707 * (1 if side % 2 == 0 else 0.85)
        for row in range(5 if side else 2):
            z = 0.36 + row * 0.13
            r = (0.25 + 0.06 * smooth(0.5, 1.2, z)) * 0.707
            d = r * (0.85 if side % 2 == 0 else 1) + 0.004
            w = r * (1 if side % 2 == 0 else 0.85) * 2 - 0.06
            for col in (-1, 1):
                M = R(0, 0, rot) @ T(col * w / 4, -d, z)
                c.box(w / 2 - 0.02, 0.01, 0.1, "Walnut", "body", M)
                c.box(0.022, 0.016, 0.022, "Brass", "body", R(0, 0, rot) @ T(col * w / 4, -d - 0.008, z))
        del half_w, depth
    # The dial: an enamel face in a brass bezel, two hands.
    c.cyl(0.13, 0.13, 0.02, 16, "Brass", "body", T(0, -0.235, 0.93) @ R(90, 0, 0))
    c.cyl(0.11, 0.11, 0.012, 16, "Enamel", "body", T(0, -0.25, 0.93) @ R(90, 0, 0))
    c.box(0.012, 0.006, 0.08, "Iron", "body", T(0.0, -0.258, 0.96))
    c.box(0.06, 0.006, 0.012, "Iron", "body", T(0.025, -0.258, 0.93))
    for k in range(12):
        ang = k / 12 * TAU
        c.box(0.008, 0.004, 0.018, "Iron", "body", T(math.sin(ang) * 0.09, -0.257, 0.93 + math.cos(ang) * 0.09) @ R(0, -math.degrees(ang), 0))
    # Shoulders: a brass yoke.
    c.lathe([(0.33, 1.24), (0.38, 1.27), (0.36, 1.32), (0.2, 1.37)], 4, "Brass", "chest", M=S(1.15, 0.85, 1),
            phase=math.pi / 4)
    # Four thin arms: the upper pair hangs to the sides with stamps; the lower pair folds before it.
    for side, bone in ((-1, "arm_r"), (1, "arm_l")):
        sh = (side * 0.37, 0.0, 1.29)
        el = (side * 0.44, -0.04, 0.98)
        wr = (side * 0.36, -0.2, 0.8)
        c.sphere(0.05, 8, 5, "Copper", bone, T(*sh))
        c.cyl(0.022, 0.02, 1, 6, "Brass", bone, aim(sh, el))
        c.sphere(0.035, 8, 5, "Copper", bone, T(*el))
        c.cyl(0.02, 0.018, 1, 6, "Brass", bone, aim(el, wr))
        c.cyl(0.05, 0.05, 0.05, 8, "Copper", bone, T(wr[0], wr[1], wr[2] - 0.06))
        c.cyl(0.018, 0.018, 0.06, 6, "Walnut", bone, T(wr[0], wr[1], wr[2] - 0.01))
        sh2 = (side * 0.27, -0.12, 1.12)
        el2 = (side * 0.3, -0.27, 0.98)
        wr2 = (side * 0.1, -0.33, 1.02)
        c.sphere(0.035, 8, 5, "Copper", "chest", T(*sh2))
        c.cyl(0.016, 0.015, 1, 6, "Brass", "chest", aim(sh2, el2))
        c.cyl(0.015, 0.014, 1, 6, "Brass", "chest", aim(el2, wr2))
        c.box(0.05, 0.05, 0.03, "Copper", "chest", T(*wr2))
    # The lamp's bracket, out from the yoke.
    c.tube([(0, -0.25, 1.3), (0, -0.36, 1.33), (0, -0.42, 1.28)], 0.015, 5, "Iron", "chest")
    light = hanging_lantern(c, (0, -0.42, 1.26), "lantern")
    # The swivel (Turret Pack: GearCannon_1 Mid) and the domed turret head with its one lens.
    c.obj_part(f"{TURRETS}/GearCannon_1.obj", "GearCannon_1_Mid", kit, "head", T(0, 0, 1.13) @ S(0.4, 0.4, 0.4))
    hz = 1.6
    c.cyl(0.19, 0.2, 0.16, 10, "Brass", "head", T(0, 0, hz), phase=math.pi / 10)
    c.lathe([(0.2, hz + 0.16), (0.19, hz + 0.22), (0.14, hz + 0.29), (0.06, hz + 0.32), (0.0, hz + 0.325)], 10, "Copper",
            "head", phase=math.pi / 10)
    c.torus(0.2, 0.012, 20, 4, "Copper", "head", T(0, 0, hz + 0.02))
    # Its crest: a small gear (Turret Pack: Base, the gear ring only shows).
    c.obj_part(f"{TURRETS}/Base.obj", "Base", kit, "head", T(0, 0, hz + 0.28) @ S(0.16, 0.16, 0.12))
    c.cyl(0.075, 0.08, 0.1, 10, "Brass", "head", T(0, -0.17, hz + 0.1) @ R(90, 0, 0))
    c.torus(0.07, 0.014, 12, 4, "Enamel", "head", T(0, -0.27, hz + 0.1) @ R(90, 0, 0))
    c.cyl(0.055, 0.055, 0.01, 12, "Eye", "head", T(0, -0.27, hz + 0.1) @ R(90, 0, 0))
    for side in (-1, 1):
        c.cyl(0.045, 0.045, 0.03, 8, "Enamel", "head", T(side * 0.2, 0, hz + 0.09) @ R(0, 90, 0))
    c.bone("root", (0, 0, 0), 0.1)
    c.bone("body", (0, 0, 0.1), 1.1, "root")
    c.bone("chest", (0, 0, 1.22), 0.2, "body")
    c.bone("arm_l", (0.37, 0, 1.29), 0.1, "chest")
    c.bone("arm_r", (-0.37, 0, 1.29), 0.1, "chest")
    c.bone("lantern", (0, -0.42, 1.26), 0.1, "chest")
    c.bone("light", light, 0.05, "lantern")
    c.bone("heart", light, 0.05, "lantern")
    c.bone("head", (0, 0, 1.4), 0.2, "chest")
    c.bone("eye", (0, -0.28, hz + 0.1), 0.05, "head")
    return c


keeper_r2.clips = {
    "extra_idle": {
        "arm_l": lambda t: {"rx": 2 * wave(t, 1, 0.1), "rz": 1.5 * wave(t, 1, 0.4)},
        "arm_r": lambda t: {"rx": 2 * wave(t, 1, 0.6), "rz": -1.5 * wave(t, 1, 0.9)},
    },
    "extra_sleep": {"arm_l": lambda t: {"rz": -4}, "arm_r": lambda t: {"rz": 4}},
}


# --------------------------------------------------------------------------------------------------------
# Region 3: the lamplighter. A tall figure in a long, warm coat with a short cape and a scarf; its head is
# a little street lantern on a brass post. It holds its lighting pole in one hand and a small lantern in
# the other. No hat, no hood, no broom.


def keeper_r3():
    c = Character("keeper-r3")
    lean = Character.pivot((0, 0, 1.0), R(4, 0, 0))

    def coat_folds(a, z, r):
        f = 0.035 * math.sin(a * 6 + 0.9) * (1 - smooth(0.3, 1.0, z))
        back = 0.05 * max(0.0, -math.cos(a)) * (1 - smooth(0.0, 0.6, z))
        sw = shoulder_warp(1.25, 1.45, 1.52, 1.62, 0.55, 0.8)(a, z, r)
        return (math.sin(a) * (f + back) + sw[0], -math.cos(a) * (f + back) + sw[1], 0)

    # Boots peeking out under the hem.
    for side in (-1, 1):
        c.box(0.11, 0.2, 0.08, "Iron", "body", T(side * 0.1, -0.1, 0.04), bevel=0.02)
    c.lathe([(0.37, 0.07), (0.33, 0.35), (0.27, 0.75), (0.22, 1.0)], 12, "Coat", "body", warp=coat_folds,
            cap_top=False)
    # The coat's front edge, piped in the scarf's colour, from the hem to the collar.
    c.tube([(-0.02, -0.37, 0.08), (-0.01, -0.33, 0.35), (0.0, -0.27, 0.75), (0.0, -0.225, 1.0)], 0.018, 4, "Scarf", "body")
    c.frame(lean)
    c.tube([(0.0, -0.225, 1.0), (0.0, -0.24, 1.2), (-0.01, -0.25, 1.4), (-0.06, -0.2, 1.56)], 0.018, 4, "Scarf", "chest")
    c.lathe([(0.22, 1.0), (0.235, 1.2), (0.25, 1.4), (0.24, 1.52), (0.16, 1.6), (0.09, 1.64)], 12, "Coat", "chest",
            warp=coat_folds, cap_bottom=False)
    c.torus(0.225, 0.02, 16, 4, "Iron", "chest", T(0, 0, 1.02) @ S(1, 0.8, 1))
    c.box(0.07, 0.03, 0.06, "Brass", "chest", T(0, -0.185, 1.02))
    for i in range(5):
        z = 1.1 + i * 0.09
        c.sphere(0.026, 6, 4, "Brass", "chest", T(0.04, -0.215 - 0.004 * i, z))

    # A short cape over the shoulders, its edge in shallow scallops.
    def cape(a, z, r):
        sw = shoulder_warp(1.3, 1.5, 1.6, 1.66, 0.42, 0.85)(a, z, r)
        dz = -0.03 * (1 + math.sin(a * 8)) if z < 1.35 else 0
        return (sw[0], sw[1], dz)

    c.lathe([(0.33, 1.3), (0.31, 1.45), (0.25, 1.56), (0.13, 1.64)], 14, "Coat", "chest", warp=cape, cap_bottom=False,
            cap_top=False)
    # The scarf, and its end hanging down the front.
    c.torus(0.11, 0.035, 12, 5, "Scarf", "chest", T(0, 0, 1.64) @ S(1, 0.9, 1))
    c.tube([(-0.07, -0.08, 1.62), (-0.1, -0.2, 1.5), (-0.11, -0.25, 1.3), (-0.1, -0.27, 1.18)],
           [0.04, 0.035, 0.032, 0.03], 4, "Scarf", "chest")
    # Arms: the right holds the pole at its side, the left holds the lantern before it.
    c.cyl(0.075, 0.1, 1, 7, "Coat", "chest", aim((0.36, 0, 1.5), (0.36, -0.12, 1.06)))
    c.box(0.07, 0.08, 0.09, "Brass", "chest", T(0.36, -0.13, 1.02))
    c.cyl(0.075, 0.1, 1, 7, "Coat", "chest", aim((-0.36, 0, 1.5), (-0.17, -0.3, 1.12)))
    c.box(0.07, 0.08, 0.08, "Brass", "chest", T(-0.15, -0.33, 1.1))
    lantern_hook = (-0.15, -0.34, 1.06)
    c.frame(None)
    # The pole: brass, taller than its bearer, a hook and a little wick-lamp at its top.
    pole_at = (0.36, -0.14)
    c.cyl(0.018, 0.018, 2.45, 6, "Brass", "pole", T(pole_at[0], pole_at[1], 0.05))
    c.tube([(pole_at[0], pole_at[1], 2.48), (pole_at[0], pole_at[1] - 0.06, 2.56), (pole_at[0], pole_at[1] - 0.13, 2.52)],
           0.012, 5, "Brass", "pole")
    c.cyl(0.03, 0.035, 0.07, 6, "Brass", "pole", T(pole_at[0], pole_at[1] - 0.13, 2.42))
    c.ico(0.022, 1, "Flame", "pole", T(pole_at[0], pole_at[1] - 0.13, 2.51) @ S(1, 1, 1.6))
    c.frame(lean)
    light = hanging_lantern(c, lantern_hook, "lantern", r=0.08, h=0.13)
    # The head: a street lantern on a brass post.
    c.cyl(0.035, 0.03, 0.12, 6, "Brass", "head", T(0, 0, 1.62))
    c.lathe([(0.05, 1.72), (0.12, 1.75), (0.13, 1.77)], 4, "Brass", "head", phase=math.pi / 4, cap_bottom=True)
    lantern_head(c, 1.76, "head", r=0.13, h=0.22, segs=4, roof_h=0.11)
    c.cyl(0.035, 0.035, 0.012, 10, "Eye", "head", T(0, -0.115, 1.92) @ R(90, 0, 0))
    c.frame(None)
    c.bone("root", (0, 0, 0), 0.1)
    c.bone("body", (0, 0, 0.1), 0.9, "root")
    c.bone("pole", (pole_at[0], pole_at[1], 1.02), 0.2, "body")
    c.frame(lean)
    c.bone("chest", (0, 0, 1.0), 0.6, "body")
    c.bone("lantern", lantern_hook, 0.1, "chest")
    c.bone("light", light, 0.05, "lantern")
    c.bone("heart", light, 0.05, "lantern")
    c.bone("head", (0, 0, 1.64), 0.2, "chest")
    c.bone("eye", (0, -0.12, 1.92), 0.05, "head")
    c.frame(None)
    return c


keeper_r3.clips = {
    "extra_idle": {"pole": lambda t: {"rz": 0.8 * wave(t, 1, 0.2), "rx": 0.6 * wave(t, 1, 0.5)}},
    "extra_sleep": {"pole": lambda t: {"rz": 2.5, "rx": 1.5}},
}


# --------------------------------------------------------------------------------------------------------
# Region 4: the navigator. A tall figure of pale stone in a fluted robe trimmed with brass, a high standing
# collar, and for a head an armillary sphere of brass rings around a warm core with one eye. It holds a
# lit lantern before it on a short chain.


def keeper_r4():
    c = Character("keeper-r4")
    stone = "PaleStone"

    def flutes(a, z, r):
        f = 0.03 * abs(math.sin(a * 6)) * (1 - smooth(1.0, 1.35, z))
        sw = shoulder_warp(1.3, 1.5, 1.56, 1.66, 0.5, 0.8)(a, z, r)
        return (math.sin(a) * f + sw[0], -math.cos(a) * f + sw[1], 0)

    c.lathe([(0.4, 0.0), (0.36, 0.1), (0.31, 0.4), (0.28, 0.8), (0.27, 1.05)], 16, stone, "body", warp=flutes,
            cap_top=False)
    c.torus(0.37, 0.022, 24, 4, "Brass", "body", T(0, 0, 0.07))
    c.lathe([(0.27, 1.05), (0.275, 1.3), (0.27, 1.5), (0.2, 1.6), (0.12, 1.64)], 16, stone, "chest", warp=flutes,
            cap_bottom=False)
    # Brass trim: the stole down its front, a belt.
    for side in (-1, 1):
        c.tube([(side * 0.1, -0.2, 1.58), (side * 0.11, -0.27, 1.3), (side * 0.12, -0.29, 1.0), (side * 0.13, -0.32, 0.6),
                (side * 0.14, -0.37, 0.12)], 0.022, 4, "Brass", "body")
    c.torus(0.282, 0.018, 20, 4, "Brass", "chest", T(0, 0, 1.08) @ S(1, 0.82, 1))
    # A high standing collar, open at the front (no hood).
    c.lathe([(0.17, 1.6), (0.19, 1.72), (0.21, 1.82)], 14, stone, "chest", cap_bottom=False, cap_top=False,
            warp=lambda a, z, r: (0, 0, -0.12 * smooth(0.0, 1.0, math.cos(a)) * smooth(1.6, 1.82, z)))
    c.torus(0.21, 0.012, 16, 4, "Brass", "chest", T(0, 0, 1.82) @ R(-12, 0, 0) @ T(0, 0.02, 0))
    # Wide sleeves to hands meeting before it, holding the lantern's chain.
    for side in (-1, 1):
        sh, hand = (side * 0.38, 0, 1.5), (side * 0.06, -0.33, 1.14)
        c.cyl(0.08, 0.14, 1, 8, stone, "chest", aim(sh, hand))
        c.torus(0.135, 0.012, 12, 4, "Brass", "chest", aim(hand, (hand[0] * 3, hand[1] - 0.03, hand[2] - 0.06)) @ S(1, 1, 0.0001))
    c.box(0.15, 0.09, 0.08, stone, "chest", T(0, -0.36, 1.12))
    light = hanging_lantern(c, (0, -0.38, 1.07), "lantern", r=0.1, h=0.16)
    # The head: an armillary sphere around a warm core with one eye.
    hz = 1.86
    c.cyl(0.04, 0.05, 0.12, 8, "Brass", "head", T(0, 0, 1.64))
    c.ico(0.085, 2, "Glass", "head", T(0, 0, hz))
    c.cyl(0.035, 0.035, 0.012, 10, "Eye", "head", T(0, -0.085, hz) @ R(90, 0, 0))
    c.torus(0.16, 0.011, 24, 4, "Brass", "rings", T(0, 0, hz) @ R(90, 0, 0))
    c.torus(0.15, 0.01, 24, 4, "Brass", "rings", T(0, 0, hz) @ R(90, 0, 90))
    c.torus(0.165, 0.013, 24, 4, "Brass", "rings", T(0, 0, hz) @ R(0, 23, 0))
    c.sphere(0.02, 6, 4, "Brass", "head", T(0, 0, hz + 0.17))
    c.bone("root", (0, 0, 0), 0.1)
    c.bone("body", (0, 0, 0.1), 0.95, "root")
    c.bone("chest", (0, 0, 1.05), 0.55, "body")
    c.bone("lantern", (0, -0.38, 1.07), 0.1, "chest")
    c.bone("light", light, 0.05, "lantern")
    c.bone("heart", light, 0.05, "lantern")
    c.bone("head", (0, 0, 1.66), 0.2, "chest")
    c.bone("rings", (0, 0, hz), 0.1, "head")
    c.bone("eye", (0, -0.1, hz), 0.05, "head")
    return c


keeper_r4.clips = {
    "extra_idle": {"rings": lambda t: {"ry": 12 * wave(t, 1), "rx": 4 * wave(t, 1, 0.25)}},
    "extra_sleep": {"rings": lambda t: {"ry": 3 * wave(t, 1)}},
}


KEEPERS = {"keeper-r1": keeper_r1, "keeper-r2": keeper_r2, "keeper-r3": keeper_r3, "keeper-r4": keeper_r4}
