# The Guardians (decision 0022: graceful and beautiful, never grotesque) and the messenger.
#
# Each faces -Y (the glTF front, +Z in the game) and stands on z = 0 (the moss spirit floats above it).
# Bones point up, as the keepers' do: rotation X bows forward, Y turns, Z tilts sideways (for a wing on
# the left, +X, positive Z raises it). `eye` marks the gaze; `core` (moss spirit) where its light sits.

import math

from keepers import moss_clump
from lib import TAU, Character, R, S, T, aim, clip, noise, smooth, wave


def hold(t, cycles=1, phase=0.0):
    """A wave that lingers at its ends: a slow turn, a pause, a turn back (calm, owl-like)."""
    s = math.sin((t * cycles + phase) * TAU)
    return math.copysign(abs(s) ** 0.5, s)


def bump(t, at, width):
    """A soft hump around t = at."""
    d = abs(t - at)
    return 0.0 if d > width else 0.5 * (1 + math.cos(math.pi * d / width))


# --------------------------------------------------------------------------------------------------------
# The owl (Region 2): a gleaming brass owl with lens eyes. Feathered wings and back; brass face, breast
# scales, beak and talons. About 0.7 m tall; it perches on gear trains.


def owl():
    c = Character("owl")
    # Talons.
    for side in (-1, 1):
        for k in (-1, 0, 1):
            c.cyl(0.012, 0.006, 1, 5, "Brass", "root", aim((side * 0.06, 0.0, 0.03), (side * 0.06 + k * 0.035, -0.07, 0.0)))
        c.cyl(0.022, 0.018, 0.08, 6, "Brass", "body", T(side * 0.06, 0.0, 0.02))

    # The body: an egg of feathers, a little deeper at the chest.
    def body_warp(a, z, r):
        chest = 0.025 * max(0.0, math.cos(a)) * smooth(0.1, 0.25, z) * (1 - smooth(0.32, 0.45, z))
        return (0, -chest, 0)

    c.lathe([(0.0, 0.05), (0.11, 0.07), (0.17, 0.15), (0.19, 0.25), (0.17, 0.36), (0.12, 0.44), (0.0, 0.47)], 12,
            "Brass", "body", M=S(1, 0.88, 1), warp=body_warp)
    # Brass breast scales in overlapping rows.
    for row in range(4):
        z = 0.13 + row * 0.065
        n = 3 if row % 2 == 0 else 4
        for k in range(n):
            x = (k - (n - 1) / 2) * 0.055
            ang = math.asin(max(-1, min(1, x / 0.18)))
            rr = 0.2 * (1 - 0.1 * abs(row - 1.5) / 1.5)
            pts = [(-0.028, 0, 0.03), (0.028, 0, 0.03), (0, 0, -0.035), (0, -0.012, 0.0)]
            c.poly(pts, [(0, 2, 3), (2, 1, 3), (0, 3, 1), (0, 1, 2)], "Copper", "body",
                   T(math.sin(ang) * rr, -math.cos(ang) * rr * 0.88 - 0.02, z) @ R(-12, 0, math.degrees(ang)))

    # Folded wings: long feathered leaves along each side, brass at the shoulder, primaries crossing at the
    # tail.
    wing = [(0.0, 0.0), (0.07, 0.03), (0.11, -0.05), (0.1, -0.2), (0.06, -0.33), (0.0, -0.4), (-0.03, -0.25),
            (-0.04, -0.08)]
    for side, bone in ((1, "wing_l"), (-1, "wing_r")):
        M = T(side * 0.15, 0.03, 0.4) @ R(0, 0, side * 90) @ R(0, side * -6, 0) @ R(0, 0, 0)
        c.slab([(u if side > 0 else -u, v) for u, v in wing], 0.04, "Feather", bone,
               T(side * 0.2, 0.02, 0.42) @ R(0, 0, side * 80) @ R(0, side * 6, 0))
        c.slab([(-0.05, 0.0), (0.06, 0.02), (0.05, -0.07), (-0.04, -0.06)], 0.03, "Copper", bone,
               T(side * 0.215, 0.0, 0.41) @ R(0, 0, side * 80))
        del M
    for k in (-1, 1):
        c.slab([(-0.025, 0.0), (0.025, 0.0), (0.01, -0.16), (-0.01, -0.16)], 0.015, "Feather", "body",
               T(k * 0.03, 0.17, 0.1) @ R(-28, 0, 0) @ R(0, k * 12, 0))

    # The head: round, a heart-shaped brass face, lens eyes, a small beak, soft ear tufts.
    hz = 0.42
    c.lathe([(0.0, hz), (0.11, hz + 0.02), (0.145, hz + 0.09), (0.14, hz + 0.16), (0.1, hz + 0.22), (0.0, hz + 0.24)],
            12, "Brass", "head", M=S(1.08, 0.95, 1))
    for side in (-1, 1):
        c.cyl(0.075, 0.07, 0.03, 12, "Enamel", "head", T(side * 0.055, -0.1, hz + 0.12) @ R(90, 0, side * -14))
        c.cyl(0.045, 0.04, 0.05, 10, "Brass", "head", T(side * 0.055, -0.11, hz + 0.125) @ R(90, 0, side * -14))
        c.torus(0.042, 0.009, 12, 4, "Brass", "head", T(side * 0.058, -0.16, hz + 0.125) @ R(90, 0, side * -14))
        c.cyl(0.03, 0.03, 0.006, 10, "Eye", "head", T(side * 0.058, -0.162, hz + 0.125) @ R(90, 0, side * -14))
        c.slab([(-0.02, 0.0), (0.03, 0.0), (0.035, 0.09), (0.0, 0.03)], 0.02, "Feather", "head",
               T(side * 0.09, -0.02, hz + 0.19) @ R(0, side * -25, 0) @ S(-side, 1, 1))
    c.lathe([(0.025, 0.0), (0.0, -0.05)], 5, "Brass", "head", T(0, -0.15, hz + 0.08) @ R(-25, 0, 0), cap_bottom=True)

    c.bone("root", (0, 0, 0), 0.05)
    c.bone("body", (0, 0, 0.05), 0.35, "root")
    c.bone("head", (0, 0, hz), 0.2, "body")
    c.bone("eye", (0, -0.17, hz + 0.125), 0.03, "head")
    c.bone("wing_l", (0.15, 0.03, 0.4), 0.1, "body")
    c.bone("wing_r", (-0.15, 0.03, 0.4), 0.1, "body")
    return c


def owl_clips(c, arm):
    clip(arm, "Idle", 240, {
        "body": lambda t: {"ly": 0.004 * wave(t, 2), "sx": 1 + 0.012 * wave(t, 2)},
        "head": lambda t: {"ry": 28 * hold(t, 1), "rz": 7 * bump(t, 0.4, 0.12) - 6 * bump(t, 0.85, 0.1)},
        "wing_l": lambda t: {"rz": 3 * bump(t, 0.6, 0.06)},
        "wing_r": lambda t: {"rz": -3 * bump(t, 0.62, 0.06)},
    })
    # Resting: head sunk into its shoulders, very slow breath.
    clip(arm, "Rest", 180, {
        "body": lambda t: {"ly": 0.003 * wave(t, 1) - 0.01, "sx": 1 + 0.015 * wave(t, 1)},
        "head": lambda t: {"ly": -0.03, "rx": 8, "ry": 4 * wave(t, 1)},
    })


owl.facing = 0
owl.poses = [("Idle", 0.25), ("Rest", 0.5)]
owl.make_clips = owl_clips


# --------------------------------------------------------------------------------------------------------
# The moss spirit (Region 1): a soft, knee-high spirit of moss and roots that drifts above the floor. Two
# leaves unfurl from its crown; roots trail beneath; a warm core glows in its breast behind a cage of
# roots. Warm only: cyan belongs to living messages.


def moss_spirit():
    c = Character("moss-spirit")
    bz = 0.34

    def blob(p):
        n = noise(p.x * 7 + 3, p.y * 7, p.z * 7)
        return p * (n - 0.5) * 0.35

    c.ico(0.2, 2, "Moss", "body", T(0, 0, bz) @ S(1, 0.92, 0.88), smooth_shade=True, warp=blob)
    for i, (x, y, z, s) in enumerate([(0.08, 0.05, bz + 0.15, 0.07), (-0.1, 0.02, bz + 0.13, 0.065), (0.0, 0.1, bz + 0.12, 0.08),
                                      (0.15, 0.08, bz + 0.02, 0.06), (-0.15, 0.1, bz + 0.0, 0.06)]):
        moss_clump(c, (x, y, z), s, 30 + i * 2.3, bone="body", flat=0.7)
    # Eyes: two soft warm lights, wide apart and low on its face (gentle, curious).
    for side in (-1, 1):
        c.sphere(0.028, 8, 6, "Eye", "body", T(side * 0.075, -0.168, bz + 0.03) @ S(1, 0.55, 1.2))
    # Its core: a warm bud of light on its crown, held between two leaves.
    c.ico(0.055, 1, "Core", "body", T(0, 0.0, bz + 0.2) @ S(1, 1, 1.25))
    c.lathe([(0.0, bz + 0.13), (0.05, bz + 0.16), (0.045, bz + 0.19)], 6, "Leaf", "body", cap_top=False)
    leaf = [(0.0, 0.0), (0.05, 0.06), (0.06, 0.16), (0.02, 0.24), (-0.03, 0.14), (-0.03, 0.05)]
    for side, bone in ((1, "leaf_l"), (-1, "leaf_r")):
        c.slab([(u * side, v) for u, v in leaf], 0.012, "Leaf", bone,
               T(side * 0.06, 0.0, bz + 0.16) @ R(0, side * 40, 0) @ R(-10, 0, 0))
    # Roots gathering beneath it into one soft trailing tail, curling back.
    for k in range(3):
        a0 = (k - 1) * 0.6
        pts = []
        for i in range(6):
            t = i / 5
            r = 0.07 * (1 - t)
            pts.append((math.sin(a0) * r + 0.02 * math.sin(t * 5 + k), 0.03 + 0.12 * t * t, bz - 0.15 - 0.17 * t + 0.06 * t ** 3))
        c.tube(pts, [0.03, 0.026, 0.02, 0.014, 0.009, 0.003], 5, "Root", "roots")

    c.bone("root", (0, 0, 0), 0.05)
    c.bone("body", (0, 0, bz - 0.15), 0.3, "root")
    c.bone("leaf_l", (0.05, 0, bz + 0.15), 0.1, "body")
    c.bone("leaf_r", (-0.05, 0, bz + 0.15), 0.1, "body")
    c.bone("roots", (0, 0, bz - 0.14), 0.05, "body")
    c.bone("core", (0, 0, bz + 0.2), 0.03, "body")
    c.bone("eye", (0, -0.18, bz + 0.03), 0.03, "body")
    return c


def moss_spirit_clips(c, arm):
    clip(arm, "Idle", 150, {
        "body": lambda t: {"ly": 0.03 * wave(t, 1), "rz": 3 * wave(t, 1, 0.3), "ry": 6 * wave(t, 1, 0.1),
                           "sx": 1 + 0.02 * wave(t, 2), "sy": 1 - 0.02 * wave(t, 2)},
        "leaf_l": lambda t: {"rz": -6 + 8 * wave(t, 1, 0.2), "rx": 4 * wave(t, 1, 0.5)},
        "leaf_r": lambda t: {"rz": 6 - 8 * wave(t, 1, 0.35), "rx": 4 * wave(t, 1, 0.7)},
        "roots": lambda t: {"rx": -6 * wave(t, 1, 0.2), "rz": 4 * wave(t, 1, 0.55)},
    })
    # Shy: it draws in and leans away a little, leaves folding.
    clip(arm, "Shy", 120, {
        "body": lambda t: {"ly": -0.04 + 0.01 * wave(t, 1), "rx": -10, "s": 0.94},
        "leaf_l": lambda t: {"rz": -20},
        "leaf_r": lambda t: {"rz": 20},
        "roots": lambda t: {"rx": 8},
    })


moss_spirit.facing = 0
moss_spirit.poses = [("Idle", 0.25), ("Shy", 0.5)]
moss_spirit.make_clips = moss_spirit_clips


# --------------------------------------------------------------------------------------------------------
# The stone warden (Region 4): a tall, serene winged statue of pale stone; robed, hands folded, a faint
# light in its eyes, great wings folded behind it with their tips rising above its head.


def stone_warden():
    c = Character("stone-warden")
    stone = "PaleStone"

    def robe(a, z, r):
        f = 0.028 * abs(math.sin(a * 7)) * (1 - smooth(1.0, 1.4, z))
        sx = 1 + 0.55 * smooth(1.25, 1.48, z) * (1 - smooth(1.55, 1.66, z))
        rr = r + f
        return (math.sin(a) * (rr * sx - r), -math.cos(a) * (rr * 0.82 - r), 0)

    c.lathe([(0.4, 0.0), (0.36, 0.12), (0.31, 0.5), (0.28, 0.95), (0.29, 1.3), (0.28, 1.5), (0.18, 1.62), (0.08, 1.66)],
            14, stone, "body", warp=robe, cap_top=False)
    c.torus(0.37, 0.016, 24, 4, "Brass", "body", T(0, 0, 0.1) @ S(1, 0.85, 1))
    # Hands folded at its breast, in long sleeves.
    for side in (-1, 1):
        sh, hand = (side * 0.34, -0.02, 1.48), (side * 0.04, -0.26, 1.2)
        el = (side * 0.3, -0.16, 1.12)
        c.cyl(0.075, 0.085, 1, 7, stone, "chest", aim(sh, el))
        c.cyl(0.085, 0.11, 1, 7, stone, "chest", aim(el, hand))
    c.box(0.12, 0.08, 0.12, stone, "chest", T(0, -0.29, 1.21) @ R(20, 0, 0), bevel=0.02)
    # The head, bowed a little: smooth stone, a straight nose, hair swept back to the nape, and
    # two thin lines of faint light for eyes (no circlet: on a bare head it read as a hat brim).
    hz = 1.66
    c.cyl(0.055, 0.06, 0.1, 8, stone, "head", T(0, 0, hz - 0.02))
    head = T(0, -0.01, hz + 0.08) @ R(10, 0, 0)
    c.lathe([(0.0, 0.0), (0.06, 0.015), (0.095, 0.08), (0.1, 0.15), (0.085, 0.21), (0.05, 0.245), (0.0, 0.255)], 10,
            stone, "head", M=head @ S(0.9, 1.05, 1))
    # Hair: swept back from the brow (the head's own crown) and gathered in a fall down the nape.
    c.lathe([(0.0, 0.03), (0.07, 0.05), (0.09, 0.12), (0.08, 0.2), (0.0, 0.235)], 8, stone, "head",
            M=head @ T(0, 0.05, 0.0) @ S(0.95, 0.9, 1))
    c.slab([(-0.07, 0.0), (0.07, 0.0), (0.09, -0.26), (0.0, -0.3), (-0.09, -0.26)], 0.04, stone, "head",
           head @ T(0, 0.1, 0.13) @ R(-12, 0, 0))
    c.poly([(0, -0.098, 0.14), (0.014, -0.098, 0.09), (-0.014, -0.098, 0.09), (0, -0.118, 0.088)],
           [(0, 3, 1), (0, 2, 3), (1, 3, 2)], stone, "head", head)
    for side in (-1, 1):
        c.box(0.034, 0.012, 0.008, "Eye", "head", head @ T(side * 0.035, -0.095, 0.136) @ R(0, side * 10, side * 4))
    # Wings, folded: tips rising over its head, long primaries falling behind it to near the floor; each in
    # two layers with scalloped feather tips.
    outline = [(0.0, 0.0), (0.12, 0.45), (0.2, 0.9), (0.24, 1.0), (0.3, 0.86), (0.36, 0.6), (0.38, 0.3), (0.37, 0.0),
               (0.33, -0.25), (0.34, -0.38), (0.27, -0.5), (0.27, -0.66), (0.2, -0.8), (0.19, -0.98), (0.12, -1.1),
               (0.08, -0.85), (0.03, -0.55), (-0.02, -0.25)]
    covert = [(0.0, 0.0), (0.1, 0.38), (0.18, 0.72), (0.25, 0.62), (0.3, 0.4), (0.33, 0.1), (0.28, -0.12),
              (0.29, -0.24), (0.2, -0.3), (0.17, -0.42), (0.08, -0.38), (0.0, -0.2)]
    for side, bone in ((1, "wing_l"), (-1, "wing_r")):
        base = T(side * 0.2, 0.16, 1.42) @ R(0, 0, side * 48) @ R(14, 0, 0) @ R(0, -side * 6, 0)
        c.slab([(u * side * 1.3, v) for u, v in outline], 0.05, stone, bone, base)
        c.slab([(u * side * 1.3, v) for u, v in covert], 0.04, stone, bone, base @ T(0, -0.035, 0.04))
    c.bone("root", (0, 0, 0), 0.1)
    c.bone("body", (0, 0, 0.1), 1.0, "root")
    c.bone("chest", (0, 0, 1.1), 0.5, "body")
    c.bone("head", (0, 0, hz - 0.02), 0.2, "chest")
    c.bone("eye", (0, -0.11, hz + 0.2), 0.03, "head")
    c.bone("wing_l", (0.16, 0.18, 1.42), 0.2, "chest")
    c.bone("wing_r", (-0.16, 0.18, 1.42), 0.2, "chest")
    return c


def stone_warden_clips(c, arm):
    clip(arm, "Idle", 300, {
        "chest": lambda t: {"ly": 0.004 * wave(t, 2), "sx": 1 + 0.006 * wave(t, 2)},
        "head": lambda t: {"rz": 2.5 * wave(t, 1, 0.2), "ry": 4 * hold(t, 1, 0.1), "rx": 1.5 * wave(t, 1)},
        "wing_l": lambda t: {"rz": 1.5 * bump(t, 0.5, 0.25), "ry": 1.0 * wave(t, 1)},
        "wing_r": lambda t: {"rz": -1.5 * bump(t, 0.52, 0.25), "ry": -1.0 * wave(t, 1)},
    })
    # Watching: it lifts its head toward the player and its wings open a little.
    clip(arm, "Watch", 180, {
        "chest": lambda t: {"ly": 0.004 * wave(t, 1), "rx": -2},
        "head": lambda t: {"rx": -10, "ry": 2 * wave(t, 1)},
        "wing_l": lambda t: {"rz": 7 + 1.0 * wave(t, 1), "ry": 6},
        "wing_r": lambda t: {"rz": -7 - 1.0 * wave(t, 1), "ry": -6},
    })


stone_warden.facing = 0
stone_warden.poses = [("Idle", 0.25), ("Watch", 0.5)]
stone_warden.make_clips = stone_warden_clips


# --------------------------------------------------------------------------------------------------------
# The messenger: a folded-paper bird, as the game has it now: a keel-shaped body, two wings raised in a
# V, a tail, a pointed head. Paper is double-sided.


def messenger():
    c = Character("messenger")
    nb, tb = (0, -0.09, 0.06), (0, 0.11, 0.06)
    kl, kr = (0.022, 0.0, -0.01), (-0.022, 0.0, -0.01)
    c.poly([nb, kl, tb], [(0, 1, 2)], "Paper", "body")
    c.poly([nb, tb, kr], [(0, 1, 2)], "Paper", "body")
    c.poly([nb, (0, -0.06, 0.03), (0, -0.15, 0.18)], [(0, 1, 2)], "Paper", "head")
    c.poly([(0, -0.15, 0.18), (0, -0.135, 0.15), (0, -0.23, 0.155)], [(0, 1, 2)], "Paper", "head")
    c.poly([tb, (0, 0.08, 0.03), (0, 0.24, 0.17)], [(0, 1, 2)], "Paper", "tail")
    for side, bone in ((1, "wing_l"), (-1, "wing_r")):
        root_a, root_b = (0, -0.05, 0.06), (0, 0.07, 0.06)
        crease = (side * 0.11, 0.0, 0.1)
        tip = (side * 0.23, 0.05, 0.16)
        c.poly([root_a, root_b, crease], [(0, 1, 2) if side > 0 else (1, 0, 2)], "Paper", bone)
        c.poly([root_a, crease, tip], [(0, 1, 2) if side > 0 else (1, 0, 2)], "Paper", bone)
        c.poly([root_b, tip, crease], [(0, 1, 2) if side > 0 else (1, 0, 2)], "Paper", bone)
    c.bone("root", (0, 0, 0), 0.05)
    c.bone("body", (0, 0, 0.02), 0.05, "root")
    c.bone("head", (0, -0.08, 0.05), 0.05, "body")
    c.bone("tail", (0, 0.1, 0.05), 0.05, "body")
    c.bone("wing_l", (0, 0, 0.06), 0.05, "body")
    c.bone("wing_r", (0, 0, 0.06), 0.05, "body")
    return c


def messenger_clips(c, arm):
    # Perched: breathing, wings shifting a little.
    clip(arm, "Idle", 90, {
        "body": lambda t: {"ly": 0.008 * wave(t, 1), "rz": 2.5 * wave(t, 1, 0.25)},
        "wing_l": lambda t: {"rz": 4 * wave(t, 1, 0.1)},
        "wing_r": lambda t: {"rz": -4 * wave(t, 1, 0.1)},
        "head": lambda t: {"rx": 4 * wave(t, 1, 0.4)},
    })
    # Flying: slow, soft wingbeats (under 1 Hz), body rising with each downstroke.
    clip(arm, "Fly", 36, {
        "body": lambda t: {"ly": 0.015 * wave(t, 1, 0.25), "rx": -4},
        "wing_l": lambda t: {"rz": 26 * wave(t, 1)},
        "wing_r": lambda t: {"rz": -26 * wave(t, 1)},
        "tail": lambda t: {"rx": 5 * wave(t, 1, 0.5)},
        "head": lambda t: {"rx": -6},
    })


messenger.facing = 0
messenger.poses = [("Idle", 0.25), ("Fly", 0.25)]
messenger.make_clips = messenger_clips

CREATURES = {"owl": owl, "moss-spirit": moss_spirit, "stone-warden": stone_warden, "messenger": messenger}


def clips(cid, c, arm):
    CREATURES[cid].make_clips(c, arm)


__all__ = ["CREATURES", "clips", "smooth", "R", "S", "T"]
