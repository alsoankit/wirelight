"""Bakes Wirelight's static rooms into lightmaps with Cycles (Blender 4.2 or later; made on 5.2).

Input: a folder of layouts from tools/bake/export.mjs, each <id>.glb (the room's static geometry as
the game draws it, lightmap UVs in its first UV map) and <id>.json (material colours and lights).
Output, per layout, into the out folder:
  <id>-ruin.webp  light in ruin (the moon, cold and strong; lamps out), with soft shadows and bounce
  <id>-lit.webp   light restored (a softer moon, the lamps and glowing things lit), shadows and bounce
  <id>-ao.webp    contact occlusion, for the game's ambient fill
  <id>.log.json   timings and settings

How the game reads them (apps/web/src/world/kit/regionMaterials.ts): a light map holds the light E
that the surface's colour is multiplied by and added (as the old vertex moonlight was), stored as
sRGB(E / RANGE) so the darks keep their precision; the AO map is plain occlusion (1 = open).

  blender -b --factory-startup --python bake.py -- --in in --out out [--quality draft|final|best]
          [--only id,id] [--force] [--calibrate]

Resumable: a layout whose three maps already exist in the out folder is skipped (unless --force).
Lighting is decided here and in the layouts' JSON; change it in the repo, not on the baking machine.
"""

import argparse
import json
import math
import os
import sys
import time

import bpy
import numpy as np

RANGE = 4.0  # light values stored up to this (sRGB-encoded / RANGE)
PI = math.pi

QUALITY = {
    # samples: Cycles samples per texel; scale: bake at size × scale, then average down (smoother edges);
    # bounces: diffuse light bounces.
    "draft": {"samples": 48, "ao_samples": 24, "scale": 1, "webp": 90, "bounces": 3},
    "final": {"samples": 512, "ao_samples": 128, "scale": 1, "webp": 92, "bounces": 3},
    "best": {"samples": 2048, "ao_samples": 512, "scale": 2, "webp": 95, "bounces": 8},
}

# The look, decided once (tune here, then rebake everything):
SUN_ANGLE = math.radians(4.0)  # the moon's disc: how soft its shadow edges are
LAMP_RADIUS = 0.12  # metres: how soft the lamps' shadows are
LAMP_SHARE = 0.55  # how much of each lamp is baked (the game still lights with it; at 1 a room drops its live lamps: 0102)
BOUNCE = 1.0  # indirect light as baked (1 = physical)
AO_DISTANCE = 0.9  # metres: how far contact occlusion reaches


def args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--in", dest="src", default="in")
    p.add_argument("--out", default="out")
    p.add_argument("--quality", choices=QUALITY.keys(), default="draft")
    p.add_argument("--only", default="")
    p.add_argument("--force", action="store_true")
    p.add_argument("--calibrate", action="store_true")
    p.add_argument("--cpu", action="store_true", help="never use a GPU")
    return p.parse_args(argv)


def log(*parts):
    print("[bake]", *parts, flush=True)


# --- Device -------------------------------------------------------------------------------------


def choose_device(cpu_only):
    """OptiX, then CUDA, then HIP, then Metal/oneAPI; the CPU if none. Returns a description."""
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    prefs = bpy.context.preferences.addons["cycles"].preferences
    if not cpu_only:
        for kind in ("OPTIX", "CUDA", "HIP", "METAL", "ONEAPI"):
            try:
                prefs.compute_device_type = kind
            except TypeError:
                continue
            prefs.refresh_devices()
            gpus = [d for d in prefs.devices if d.type == kind]
            if not gpus:
                continue
            for d in prefs.devices:
                d.use = d.type == kind
            scene.cycles.device = "GPU"
            return f"{kind}: " + ", ".join(d.name for d in gpus)
    try:
        prefs.compute_device_type = "NONE"
    except TypeError:
        pass
    scene.cycles.device = "CPU"
    return f"CPU ({os.cpu_count()} threads)"


# --- Colour -------------------------------------------------------------------------------------


def srgb_to_linear(c):
    c = np.asarray(c, dtype=np.float64)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def linear_to_srgb(c):
    c = np.clip(c, 0.0, 1.0)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def hex_linear(h):
    h = h.lstrip("#")
    return [float(x) for x in srgb_to_linear([int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)])]


# --- Scene --------------------------------------------------------------------------------------


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def setup_render(quality, cpu_only):
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    device = choose_device(cpu_only)
    c = scene.cycles
    c.samples = quality["samples"]
    c.use_denoising = False
    bounces = quality.get("bounces", 3)
    c.max_bounces = bounces + 1
    c.diffuse_bounces = bounces
    c.glossy_bounces = 0
    c.transmission_bounces = 0
    c.transparent_max_bounces = 2
    c.caustics_reflective = False
    c.caustics_refractive = False
    scene.view_settings.view_transform = "Standard"
    world = bpy.data.worlds.new("void")
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    bg.inputs["Color"].default_value = (0, 0, 0, 1)
    bg.inputs["Strength"].default_value = 0
    scene.world = world
    world.light_settings.distance = AO_DISTANCE
    bake = scene.render.bake
    bake.margin = 4 * quality.get("scale", 1)
    bake.margin_type = "EXTEND"
    bake.use_clear = True
    bake.target = "IMAGE_TEXTURES"
    return device


def base_name(name):
    # Blender renames duplicates "Floor.001"; the kit's and the code-made floor share a swatch.
    head, _, tail = name.rpartition(".")
    return head if head and tail.isdigit() else name


def make_material(mat, colour_hex, emission_hex, emission, target):
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    diffuse = nt.nodes.new("ShaderNodeBsdfDiffuse")
    diffuse.inputs["Color"].default_value = (*hex_linear(colour_hex), 1)
    shader = diffuse
    if emission > 0:
        emit = nt.nodes.new("ShaderNodeEmission")
        emit.inputs["Color"].default_value = (*hex_linear(emission_hex), 1)
        emit.inputs["Strength"].default_value = emission
        add = nt.nodes.new("ShaderNodeAddShader")
        nt.links.new(diffuse.outputs[0], add.inputs[0])
        nt.links.new(emit.outputs[0], add.inputs[1])
        shader = add
    nt.links.new(shader.outputs[0], out.inputs["Surface"])
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = target
    nt.nodes.active = tex
    tex.select = True


def import_layout(path):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    # The "casters" mesh (live models) shadows the room and is never baked onto.
    objs = [o for o in bpy.data.objects if o not in before and o.type == "MESH" and not o.name.startswith("casters")]
    for o in objs:
        # Lightmap UVs are the only UV map; make sure the bake writes through it.
        if o.data.uv_layers:
            o.data.uv_layers.active_index = 0
    return objs


def to_blender(v):
    """The game's Y-up coordinates as Blender's Z-up (as the glTF importer converts the room)."""
    return (v[0], -v[2], v[1])


def add_sun(toward, colour_hex, strength):
    """The moon: a sun lamp whose light, on a surface facing it, adds colour × strength (game units)."""
    data = bpy.data.lights.new("moon", "SUN")
    data.color = hex_linear(colour_hex)
    # Cycles: a sun of strength S lights a white diffuse surface to S / π.
    data.energy = strength * PI
    data.angle = SUN_ANGLE
    obj = bpy.data.objects.new("moon", data)
    bpy.context.scene.collection.objects.link(obj)
    # A sun shines along its local −Z: point −Z away from the moon.
    from mathutils import Vector

    d = Vector(to_blender(toward)).normalized()
    obj.rotation_euler = (-d).to_track_quat("-Z", "Y").to_euler()
    return obj


def add_lamp(lamp, share):
    """A three.js point light (candela I, decay 2): on a white surface it adds I·cos / (π d²)."""
    data = bpy.data.lights.new("lamp", "POINT")
    data.color = hex_linear(lamp["colour"])
    # Cycles: a point light of power P gives a white diffuse surface P·cos / (4π² d²).
    data.energy = lamp["strength"] * share * 4 * PI
    data.shadow_soft_size = LAMP_RADIUS
    obj = bpy.data.objects.new("lamp", data)
    obj.location = to_blender(lamp["position"])
    bpy.context.scene.collection.objects.link(obj)
    return obj


def clear_lights():
    for o in list(bpy.data.objects):
        if o.type == "LIGHT":
            bpy.data.objects.remove(o, do_unlink=True)


# --- Baking -------------------------------------------------------------------------------------


def bake_pass(objs, kind):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if kind == "AO":
        bpy.ops.object.bake(type="AO")
    else:
        bpy.ops.object.bake(type="DIFFUSE", pass_filter={"DIRECT", "INDIRECT"}, use_clear=True)


def pixels(image):
    w, h = image.size
    buf = np.empty(w * h * 4, dtype=np.float32)
    image.pixels.foreach_get(buf)
    return buf.reshape(h, w, 4)


def coverage_mask(objs, size, wanted):
    """Which texels the group's triangles cover (before the bake's margin), from the UVs.

    `wanted(material_name)` picks the group's triangles (the room's own or its kit pieces')."""
    mask = np.zeros((size, size), dtype=bool)
    for o in objs:
        me = o.data
        slots = [wanted(s.material.name) if s.material else False for s in o.material_slots]
        uv = me.uv_layers[0].data
        co = np.empty(len(uv) * 2, dtype=np.float64)
        uv.foreach_get("uv", co)
        co = co.reshape(-1, 2) * size
        me.calc_loop_triangles()
        n = len(me.loop_triangles)
        tris = np.empty(n * 3, dtype=np.int64)
        me.loop_triangles.foreach_get("loops", tris)
        mats = np.empty(n, dtype=np.int64)
        me.loop_triangles.foreach_get("material_index", mats)
        for (a, b, c), mi in zip(tris.reshape(-1, 3), mats):
            if not slots[mi]:
                continue
            pa, pb, pc = co[a], co[b], co[c]
            x0 = max(int(math.floor(min(pa[0], pb[0], pc[0]))), 0)
            x1 = min(int(math.ceil(max(pa[0], pb[0], pc[0]))), size - 1)
            y0 = max(int(math.floor(min(pa[1], pb[1], pc[1]))), 0)
            y1 = min(int(math.ceil(max(pa[1], pb[1], pc[1]))), size - 1)
            mask[y0 : y1 + 1, x0 : x1 + 1] = True
    return mask


def denoise(rgb, mask, samples):
    """Edge-aware smoothing inside covered texels (charts never bleed into each other's padding).

    A small cross-bilateral filter on luminance: Cycles bake has no built-in denoise, and the
    compositor's OIDN works on whole frames (it smears across chart borders). With final quality
    (512 samples) this barely does anything; at draft quality it removes most of the grain.
    """
    radius = 2 if samples >= 256 else 3
    sigma_s = radius * 0.7
    lum = rgb @ np.array([0.2126, 0.7152, 0.0722])
    sigma_r = max(float(np.percentile(lum[mask], 90)) * (0.12 if samples >= 256 else 0.25), 1e-4)
    acc = np.zeros_like(rgb)
    wsum = np.zeros(lum.shape)
    m = mask.astype(np.float64)
    for dy in range(-radius, radius + 1):
        for dx in range(-radius, radius + 1):
            ws = math.exp(-(dx * dx + dy * dy) / (2 * sigma_s * sigma_s))
            sh_rgb = np.roll(np.roll(rgb, dy, 0), dx, 1)
            sh_lum = np.roll(np.roll(lum, dy, 0), dx, 1)
            sh_m = np.roll(np.roll(m, dy, 0), dx, 1)
            w = ws * sh_m * np.exp(-((sh_lum - lum) ** 2) / (2 * sigma_r * sigma_r))
            acc += sh_rgb * w[..., None]
            wsum += w
    out = np.where(wsum[..., None] > 0, acc / np.maximum(wsum, 1e-12)[..., None], rgb)
    return np.where(mask[..., None], out, rgb)


def save_webp(path, rgb, quality):
    """Writes linear `rgb` (h × w × 3, already scaled to 0..1) sRGB-encoded as WebP."""
    h, w, _ = rgb.shape
    enc = linear_to_srgb(rgb)
    rgba = np.concatenate([enc, np.ones((h, w, 1))], axis=2).astype(np.float32)
    img = bpy.data.images.new(os.path.basename(path), w, h, alpha=False, float_buffer=False)
    img.colorspace_settings.name = "Non-Color"
    img.pixels.foreach_set(rgba.ravel())
    # Saved as data (Non-Color): the values above are written as they are, whatever the colour setup.
    img.file_format = "WEBP"
    img.save(filepath=path, quality=quality)
    bpy.data.images.remove(img)


def is_kit(name):
    return name.startswith("kit:")


def bake_layout(meta, glb, out_dir, quality, device):
    started = time.time()
    reset()
    setup_render(quality, device)
    # Two atlases: the room's own pieces, and its textured kit pieces (drawn apart by the game).
    groups = {"": {"size": meta["size"], "wanted": lambda n: not is_kit(n)}}
    if meta.get("kit"):
        groups["-kit"] = {"size": meta["kit"]["size"], "wanted": is_kit}
    for g in groups.values():
        size = g["size"] * quality["scale"]
        g["image"] = bpy.data.images.new("target", size, size, alpha=False, float_buffer=True)
        g["image"].colorspace_settings.name = "Non-Color"
    objs = import_layout(glb)
    mats = meta["materials"]
    lights = meta["lights"]

    def style(state):
        for o in objs:
            for slot in o.material_slots:
                m = slot.material
                name = base_name(m.name)
                info = mats.get(name, {"ruined": "#808080", "restored": "#808080"})
                colour = info["ruined"] if state == "ruin" else info["restored"]
                glow = info.get("glow") or 0
                ember = info.get("ember") if info.get("ember") is not None else 0.15
                emission = 0
                if glow:
                    emission = ember if state == "ruin" else glow + ember
                target = groups["-kit" if is_kit(name) and "-kit" in groups else ""]["image"]
                make_material(m, colour, info["restored"], emission, target)

    results = {}
    for state in ("ruin", "lit", "ao"):
        t = time.time()
        clear_lights()
        style("lit" if state == "ao" else state)
        scene = bpy.context.scene
        if state == "ao":
            scene.cycles.samples = quality["ao_samples"]
            bake_pass(objs, "AO")
        else:
            scene.cycles.samples = quality["samples"]
            moon = lights["moon"]["ruined" if state == "ruin" else "restored"]
            add_sun(lights["moon"]["toward"], moon["colour"], moon["strength"])
            if state == "lit":
                for lamp in lights["lamps"]:
                    add_lamp(lamp, LAMP_SHARE)
            bake_pass(objs, "DIFFUSE")
        seconds = round(time.time() - t, 1)
        for suffix, g in groups.items():
            size = g["size"] * quality["scale"]
            if "mask" not in g:
                g["mask"] = coverage_mask(objs, size, lambda n, w=g["wanted"]: w(base_name(n)))
            mask = g["mask"]
            px = pixels(g["image"])[..., :3].astype(np.float64)
            if state == "ao":
                rgb = np.repeat(px.mean(axis=2, keepdims=True), 3, axis=2)
                rgb = np.clip(denoise(rgb, mask, quality["ao_samples"] * 4), 0, 1)
            else:
                rgb = denoise(px * BOUNCE, mask, quality["samples"]) / RANGE
            bad = int(np.count_nonzero(~np.isfinite(rgb)))
            rgb = np.nan_to_num(rgb, nan=0.0, posinf=1.0, neginf=0.0)
            s = quality["scale"]
            if s > 1:
                n = size // s
                rgb = rgb.reshape(n, s, n, s, 3).mean(axis=(1, 3))
                mask = mask.reshape(n, s, n, s).any(axis=(1, 3))
            save_webp(os.path.join(out_dir, f"{meta['id']}{suffix}-{state}.webp"), rgb, quality["webp"])
            covered = rgb[mask] if mask.any() else rgb.reshape(-1, 3)
            entry = {
                "seconds": seconds,
                "mean": round(float(covered.mean()), 4),
                "p99": round(float(np.percentile(covered, 99)), 4),
                "clipped": round(float((covered >= 0.999).mean()), 5),
                "nonfinite": bad,
            }
            results[f"{suffix[1:] or 'room'}-{state}"] = entry
            log(meta["id"] + suffix, state, entry)
    report = {
        "id": meta["id"],
        "signature": meta["signature"],
        "key": meta["key"],
        "kit": meta.get("kit"),
        "quality": quality,
        "lamp_share": LAMP_SHARE,
        "device": device,
        "blender": bpy.app.version_string,
        "seconds": round(time.time() - started, 1),
        "maps": results,
    }
    with open(os.path.join(out_dir, f"{meta['id']}.log.json"), "w") as f:
        json.dump(report, f, indent=1)
    return report


def calibrate():
    """Checks the unit conversions above: a white plane under the moon and under a lamp."""
    reset()
    setup_render({"samples": 64}, True)
    bpy.ops.mesh.primitive_plane_add(size=2)
    plane = bpy.context.active_object
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.uv.reset()
    bpy.ops.object.mode_set(mode="OBJECT")
    img = bpy.data.images.new("cal", 16, 16, float_buffer=True)
    mat = bpy.data.materials.new("white")
    plane.data.materials.append(mat)
    make_material(mat, "#ffffff", "#000000", 0, img)
    add_sun([0, 1, 0], "#ffffff", 1.0)
    bake_pass([plane], "DIFFUSE")
    log("moon strength 1, facing: want 1.0, got", float(pixels(img)[..., :3].mean()))
    clear_lights()
    add_lamp({"position": [0, 1, 0], "colour": "#ffffff", "strength": 1}, 1.0)
    bake_pass([plane], "DIFFUSE")
    centre = float(pixels(img)[6:10, 6:10, :3].mean())
    log("lamp 1 cd at 1 m, centre: want", round(1 / PI, 4), "got", round(centre, 4))


def main():
    a = args()
    if a.calibrate:
        calibrate()
        return
    src = os.path.abspath(a.src)
    out = os.path.abspath(a.out)
    os.makedirs(out, exist_ok=True)
    quality = QUALITY[a.quality]
    only = {s for s in a.only.split(",") if s}
    with open(os.path.join(src, "layouts.json")) as f:
        layouts = json.load(f)
    todo = [entry for entry in layouts if not only or entry["id"] in only]
    log(f"{len(todo)} layouts, quality {a.quality}, Blender {bpy.app.version_string}")
    reset()
    device = choose_device(a.cpu)
    log("device:", device)
    done = 0
    failed = []
    for i, entry in enumerate(todo, 1):
        lid = entry["id"]
        suffixes = [""] + (["-kit"] if entry.get("kit") else [])
        maps = [os.path.join(out, f"{lid}{x}-{s}.webp") for x in suffixes for s in ("ruin", "lit", "ao")]
        if not a.force and all(os.path.exists(m) for m in maps):
            log(f"[{i}/{len(todo)}] {lid}: already baked, skipped")
            continue
        try:
            with open(os.path.join(src, f"{lid}.json")) as f:
                meta = json.load(f)
            report = bake_layout(meta, os.path.join(src, f"{lid}.glb"), out, quality, a.cpu)
            report["device"] = device
            done += 1
            log(f"[{i}/{len(todo)}] {lid}: done in {report['seconds']} s")
        except Exception as e:  # keep going; verify.py lists what is missing
            failed.append(lid)
            log(f"[{i}/{len(todo)}] {lid}: FAILED: {e!r}")
    log(f"finished: {done} baked, {len(failed)} failed {failed}")
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
