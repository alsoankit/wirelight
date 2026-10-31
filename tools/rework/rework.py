"""Reworks one downloaded model for the game (decision 0089, "carved and painted"): imports it, joins
it into one mesh standing on the floor at its height, makes a low-poly copy, unwraps it, bakes the
high model's detail onto it (normal, ambient occlusion and its own colour, kept as a faint detail
mask), exports a small GLB, and renders a preview.

Run one model per Blender (memory stays bounded; tools/rework/run.sh loops):
  blender -b --factory-startup --disable-autoexec --python tools/rework/rework.py -- --slug keeper-mourner
In:  assets-src/_downloads/<slug>/ (tools/rework/unpack.py), settings in tools/rework/assets.json
Out: assets-src/rework/<slug>/  low.glb, normal.png, ao.png, colour.png, preview.png, report.json
"""

import json
import math
import pathlib
import sys
import time

import bmesh
import bpy
from mathutils import Vector

ROOT = pathlib.Path(__file__).resolve().parents[2]
DOWNLOADS = ROOT / "assets-src/_downloads"
OUT_ROOT = ROOT / "assets-src/rework"
MODELS = [".blend", ".glb", ".gltf", ".fbx", ".obj", ".dae", ".ply", ".stl"]
TEXTURE_SIZE = {"character": 1024, "statue": 1024, "ruin": 1024, "prop": 512}
# --final: bake twice as big (ship.mjs shrinks them: cleaner maps, same download), smoother AO.
FINAL = "--final" in sys.argv
AO_SAMPLES = 256 if FINAL else 48
MARGIN = 16 if FINAL else 8


def log(*parts):
    print("[rework]", *parts, flush=True)


def tris(obj) -> int:
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def find_model(folder: pathlib.Path) -> pathlib.Path:
    for ext in MODELS:
        found = sorted(p for p in folder.rglob("*") if p.suffix.lower() == ext)
        if found:
            return found[0]
    raise SystemExit(f"no model file in {folder}")


def import_model(path: pathlib.Path, up: str = "Y"):
    ext = path.suffix.lower()
    if ext == ".obj":
        # Most OBJs are Y-up; museum scans are often Z-up ("up": "Z" in assets.json).
        if up == "Z":
            bpy.ops.wm.obj_import(filepath=str(path), up_axis="Z", forward_axis="Y")
        else:
            bpy.ops.wm.obj_import(filepath=str(path))
    elif ext == ".fbx":
        bpy.ops.import_scene.fbx(filepath=str(path))
    elif ext in (".glb", ".gltf"):
        bpy.ops.import_scene.gltf(filepath=str(path))
    elif ext == ".blend":
        # Poly Haven's .blend: append its mesh objects (scripts never run: --disable-autoexec).
        with bpy.data.libraries.load(str(path), link=False) as (src, dst):
            dst.objects = list(src.objects)
        for obj in dst.objects:
            if obj is not None and obj.type == "MESH":
                bpy.context.scene.collection.objects.link(obj)
    else:
        raise SystemExit(f"can't import {ext}")


def fix_missing_images(folder: pathlib.Path):
    """Sketchfab OBJ/FBX often point at textures by a path that isn't where they landed: find them by name."""
    pictures = [p for p in folder.rglob("*") if p.suffix.lower() in {".png", ".jpg", ".jpeg", ".tga", ".webp", ".exr"}]
    files = {p.name.lower(): p for p in pictures} | {p.stem.lower(): p for p in pictures}
    for img in bpy.data.images:
        if img.source != "FILE" or not img.filepath:
            continue
        if pathlib.Path(bpy.path.abspath(img.filepath)).exists():
            continue
        wanted = pathlib.Path(img.filepath.replace("\\", "/"))
        match = files.get(wanted.name.lower()) or files.get(wanted.stem.lower())
        if match:
            img.filepath = str(match)
            img.reload()


def colour_texture(folder: pathlib.Path):
    """The model's own colour picture, when its materials have none hooked up (scans often don't)."""
    pics = [p for p in folder.rglob("*") if p.suffix.lower() in {".png", ".jpg", ".jpeg"}]
    named = [p for p in pics if any(k in p.name.lower() for k in ("basecolor", "base_color", "diff", "albedo", "color", "colour"))]
    named = [p for p in named if not any(k in p.name.lower() for k in ("normal", "rough", "metal", "ao", "spec", "opacity", "alpha"))]
    pool = named or [p for p in pics if not any(k in p.name.lower() for k in ("normal", "rough", "metal", "spec", "opacity"))]
    return max(pool, key=lambda p: p.stat().st_size) if pool else None


def ensure_colour(obj, folder: pathlib.Path, use_texture: bool = True):
    """A colour picture that loads (a missing one renders magenta), or a plain stone grey."""
    if not use_texture:
        # "colour": "none": the model's only picture isn't its colour (a shine map): plain grey.
        mat = bpy.data.materials.new("grey")
        mat.use_nodes = True
        mat.node_tree.nodes.get("Principled BSDF").inputs["Base Color"].default_value = (0.62, 0.6, 0.57, 1)
        obj.data.materials.clear()
        obj.data.materials.append(mat)
        return
    has_image = any(
        n.type == "TEX_IMAGE" and n.image is not None and n.image.size[0] > 0
        for slot in obj.material_slots
        if slot.material and slot.material.use_nodes
        for n in slot.material.node_tree.nodes
    )
    if has_image:
        return
    pic = colour_texture(folder)
    if not pic:
        log("no colour texture found; colour bake will be flat")
        return
    mat = bpy.data.materials.new("found_colour")
    mat.use_nodes = True
    nodes = mat.node_tree.nodes
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(str(pic))
    bsdf = nodes.get("Principled BSDF")
    mat.node_tree.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    log("hooked colour texture", pic.name)


def hook_textures(folder: pathlib.Path, hooks: dict):
    """Connects a material's colour and normal pictures (`<name>_BaseColor`, `<name>_Normal`) when the
    model file carries none (an FBX exported without them): "textures": {"material": "name"}."""
    pics = {p.name.lower(): p for p in folder.rglob("*.png")}

    def picture(prefix: str, kind: str) -> pathlib.Path:
        return next(path for name, path in pics.items() if name.startswith(f"{prefix.lower()}_") and any(k in name for k in kind))

    for mat_name, prefix in hooks.items():
        mat = bpy.data.materials.get(mat_name)
        if mat is None:
            continue
        mat.use_nodes = True
        nodes, links = mat.node_tree.nodes, mat.node_tree.links
        bsdf = nodes.get("Principled BSDF")
        col = nodes.new("ShaderNodeTexImage")
        col.image = bpy.data.images.load(str(picture(prefix, ("base", "albedo"))))
        links.new(col.outputs["Color"], bsdf.inputs["Base Color"])
        nrm = nodes.new("ShaderNodeTexImage")
        nrm.image = bpy.data.images.load(str(picture(prefix, ("normal",))))
        nrm.image.colorspace_settings.name = "Non-Color"
        nmap = nodes.new("ShaderNodeNormalMap")
        links.new(nrm.outputs["Color"], nmap.inputs["Color"])
        links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])


def keep_only(names: list):
    """One piece of a kit: every mesh not named goes ("only": ["object", …])."""
    for o in list(bpy.context.scene.objects):
        if o.type == "MESH" and o.name not in names:
            bpy.data.objects.remove(o, do_unlink=True)


def cut_wedge(obj, start: float, end: float):
    """One bay of a round structure: keeps the wedge between two angles about its centre, in degrees
    ("wedge": [start, end]), cut through the column axes so bays stand side by side."""
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    for angle, side in ((start, -1), (end, 1)):
        a = math.radians(angle)
        normal = Vector((-math.sin(a), math.cos(a), 0)) * side
        geom = bm.verts[:] + bm.edges[:] + bm.faces[:]
        bmesh.ops.bisect_plane(bm, geom=geom, plane_co=(0, 0, 0), plane_no=normal, clear_outer=True)
    bm.to_mesh(obj.data)
    bm.free()
    obj.data.update()
    bpy.context.view_layer.update()


def join_all():
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    if not meshes:
        raise SystemExit("no meshes imported")
    for o in meshes:
        if o.data.shape_keys:
            o.shape_key_clear()  # animation we don't keep; decimating refuses them
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.parent_clear(type="CLEAR_KEEP_TRANSFORM")
    for o in list(bpy.context.scene.objects):
        if o.type != "MESH":
            bpy.data.objects.remove(o, do_unlink=True)
    bpy.ops.object.select_all(action="DESELECT")
    for o in meshes:
        o.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    if len(meshes) > 1:
        bpy.ops.object.join()
    obj = bpy.context.view_layer.objects.active
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    obj.name = "high"
    return obj


def stand(obj, height: float):
    """Scale to its height, centred on x/y, standing on z = 0."""
    corners = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
    lo = Vector((min(c.x for c in corners), min(c.y for c in corners), min(c.z for c in corners)))
    hi = Vector((max(c.x for c in corners), max(c.y for c in corners), max(c.z for c in corners)))
    s = height / max(hi.z - lo.z, 1e-6)
    obj.location = Vector((-(lo.x + hi.x) / 2 * s, -(lo.y + hi.y) / 2 * s, -lo.z * s))
    obj.scale = (s, s, s)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=False, scale=True)


def make_low(high, target: int):
    low = high.copy()
    low.data = high.data.copy()
    low.name = "low"
    bpy.context.scene.collection.objects.link(low)
    bpy.ops.object.select_all(action="DESELECT")
    low.select_set(True)
    bpy.context.view_layer.objects.active = low
    have = tris(low)
    if have > target:
        mod = low.modifiers.new("decimate", "DECIMATE")
        mod.decimate_type = "COLLAPSE"
        mod.ratio = target / have
        mod.use_collapse_triangulate = True
        bpy.ops.object.modifier_apply(modifier=mod.name)
    # Fresh UVs for the baked maps.
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.003)
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.shade_smooth()
    return low


def colour_as_emission(obj):
    """For the colour bake: every material shows its base colour as light. A diffuse bake would give
    metals (no diffuse colour of their own) as black."""
    for slot in obj.material_slots:
        mat = slot.material
        if not mat or not mat.use_nodes:
            continue
        nodes, links = mat.node_tree.nodes, mat.node_tree.links
        bsdf = next((n for n in nodes if n.type == "BSDF_PRINCIPLED"), None)
        output = next((n for n in nodes if n.type == "OUTPUT_MATERIAL"), None)
        if not bsdf or not output:
            continue
        emit = nodes.new("ShaderNodeEmission")
        base = bsdf.inputs["Base Color"]
        if base.is_linked:
            links.new(base.links[0].from_socket, emit.inputs["Color"])
        else:
            emit.inputs["Color"].default_value = base.default_value
        links.new(emit.outputs["Emission"], output.inputs["Surface"])


def bake_maps(high, low, size: int, height: float, out: pathlib.Path) -> dict:
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    images = {}
    mat = bpy.data.materials.new("baked")
    mat.use_nodes = True
    low.data.materials.clear()
    low.data.materials.append(mat)
    nodes = mat.node_tree.nodes
    for name, colourspace in (("normal", "Non-Color"), ("ao", "Non-Color"), ("colour", "sRGB")):
        img = bpy.data.images.new(name, size, size, alpha=False)
        img.colorspace_settings.name = colourspace
        images[name] = img
    target = nodes.new("ShaderNodeTexImage")
    bpy.ops.object.select_all(action="DESELECT")
    high.select_set(True)
    low.select_set(True)
    bpy.context.view_layer.objects.active = low
    bake = scene.render.bake
    bake.use_selected_to_active = True
    bake.cage_extrusion = 0.015 * height
    bake.max_ray_distance = 0.04 * height
    bake.margin = MARGIN
    for kind, samples in (("normal", 1), ("ao", AO_SAMPLES), ("colour", 1)):
        target.image = images[kind]
        nodes.active = target
        scene.cycles.samples = samples
        started = time.time()
        if kind == "colour":
            colour_as_emission(high)
        bpy.ops.object.bake(type={"normal": "NORMAL", "ao": "AO", "colour": "EMIT"}[kind])
        images[kind].filepath_raw = str(out / f"{kind}.png")
        images[kind].file_format = "PNG"
        images[kind].save()
        log(f"baked {kind} in {time.time() - started:.0f} s")
    # The game material: its own colour (a faint mask later), the normal map, AO in the colour too.
    nodes.remove(target)
    bsdf = nodes.get("Principled BSDF")
    links = mat.node_tree.links
    col = nodes.new("ShaderNodeTexImage")
    col.image = images["colour"]
    ao = nodes.new("ShaderNodeTexImage")
    ao.image = images["ao"]
    mix = nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    mix.inputs["Factor"].default_value = 1.0
    links.new(col.outputs["Color"], mix.inputs[6])
    links.new(ao.outputs["Color"], mix.inputs[7])
    links.new(mix.outputs[2], bsdf.inputs["Base Color"])
    nrm = nodes.new("ShaderNodeTexImage")
    nrm.image = images["normal"]
    nmap = nodes.new("ShaderNodeNormalMap")
    links.new(nrm.outputs["Color"], nmap.inputs["Color"])
    links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    bsdf.inputs["Roughness"].default_value = 0.85
    return images


def export_low(low, out: pathlib.Path):
    bpy.ops.object.select_all(action="DESELECT")
    low.select_set(True)
    bpy.context.view_layer.objects.active = low
    bpy.ops.export_scene.gltf(
        filepath=str(out / "low.glb"),
        use_selection=True,
        export_format="GLB",
        export_image_format="WEBP",
        export_apply=True,
    )


def preview(low, height: float, out: pathlib.Path):
    scene = bpy.context.scene
    scene.cycles.samples = 24
    scene.cycles.use_denoising = True
    scene.render.resolution_x = scene.render.resolution_y = 420
    scene.render.film_transparent = False
    world = bpy.data.worlds.new("w")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.05, 0.05, 0.06, 1)
    scene.world = world
    for o in list(scene.objects):
        if o.name != "low":
            o.hide_render = True
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 3.5
    sun.rotation_euler = (math.radians(50), 0, math.radians(35))
    scene.collection.objects.link(sun)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    cam.data.lens = 50
    d = max(height, max(low.dimensions)) * 2.4
    cam.location = (d * 0.75, -d * 0.75, height * 0.75)
    direction = Vector((0, 0, height * 0.45)) - cam.location
    cam.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(cam)
    scene.camera = cam
    scene.render.filepath = str(out / "preview.png")
    bpy.ops.render.render(write_still=True)


def main():
    argv = sys.argv[sys.argv.index("--") + 1 :]
    slug = argv[argv.index("--slug") + 1]
    spec = next(a for a in json.loads((ROOT / "tools/rework/assets.json").read_text()) if a["slug"] == slug)
    folder = DOWNLOADS / spec.get("folder", slug)
    out = OUT_ROOT / slug
    out.mkdir(parents=True, exist_ok=True)
    started = time.time()
    clear_scene()
    model = folder / spec["file"] if spec.get("file") else find_model(folder)
    log(slug, "importing", model.name)
    import_model(model, spec.get("up", "Y"))
    fix_missing_images(folder)
    if spec.get("textures"):
        hook_textures(folder, spec["textures"])
    if spec.get("only"):
        keep_only(spec["only"])
    high = join_all()
    if spec.get("wedge"):
        cut_wedge(high, *spec["wedge"])
    # Any further turn a model needs to stand upright and face the front (degrees about x, y, z).
    if spec.get("rotate"):
        high.rotation_euler = [math.radians(a) for a in spec["rotate"]]
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    ensure_colour(high, folder, spec.get("colour") != "none")
    stand(high, spec["height"])
    if spec.get("clean"):
        # Doubled or flipped faces (some glTF scans) make the bake's rays hit the wrong side: speckles.
        bpy.ops.object.select_all(action="DESELECT")
        high.select_set(True)
        bpy.context.view_layer.objects.active = high
        bpy.ops.object.mode_set(mode="EDIT")
        bpy.ops.mesh.select_all(action="SELECT")
        bpy.ops.mesh.remove_doubles(threshold=0.0005 * spec["height"])
        bpy.ops.mesh.normals_make_consistent(inside=False)
        bpy.ops.object.mode_set(mode="OBJECT")
        if high.data.has_custom_normals:
            bpy.ops.mesh.customdata_custom_splitnormals_clear()
    high_tris = tris(high)
    log(f"high: {high_tris} triangles")
    low = make_low(high, spec["tris"])
    low_tris = tris(low)
    log(f"low: {low_tris} triangles")
    size = TEXTURE_SIZE.get(spec["role"], 1024) * (2 if FINAL else 1)
    bake_maps(high, low, size, spec["height"], out)
    export_low(low, out)
    preview(low, spec["height"], out)
    report = {
        "slug": slug,
        "source": str(model.relative_to(folder)),
        "high_tris": high_tris,
        "low_tris": low_tris,
        "texture": size,
        "final": FINAL,
        "glb_kb": round((out / "low.glb").stat().st_size / 1024),
        "seconds": round(time.time() - started),
        "licence": spec["licence"],
        "credit": spec["credit"],
    }
    (out / "report.json").write_text(json.dumps(report, indent=1))
    log("done", json.dumps(report))


main()
