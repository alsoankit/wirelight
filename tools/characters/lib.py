# Wirelight characters: a small Blender toolkit for building rigid low-poly characters in code.
#
# A character is one mesh, skinned rigidly to a few named bones (every part follows exactly one bone),
# so the game draws it in one draw call per material and plays its clips with three's AnimationMixer.
# Bones all point up (+Z) with no roll, so in pose space: rotation X bows forward, Y turns (yaw), Z
# tilts sideways; location Y is up. Front is -Y in Blender, which the glTF exporter turns into +Z.
#
# Run by the per-character scripts in this folder (blender -b --python <script> -- <out dir>).

import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector

TAU = math.pi * 2
FPS = 30


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    scene.render.fps = FPS
    return scene


# ---------------------------------------------------------------- transforms


def T(x=0.0, y=0.0, z=0.0):
    return Matrix.Translation((x, y, z))


def R(x=0.0, y=0.0, z=0.0):
    """Rotation in degrees, applied X then Y then Z."""
    return Matrix.Rotation(math.radians(z), 4, "Z") @ Matrix.Rotation(math.radians(y), 4, "Y") @ Matrix.Rotation(
        math.radians(x), 4, "X"
    )


def S(x=1.0, y=None, z=None):
    y = x if y is None else y
    z = x if z is None else z
    m = Matrix.Identity(4)
    m[0][0], m[1][1], m[2][2] = x, y, z
    return m


def aim(a, b):
    """A matrix placing a +Z-up primitive of unit height so it runs from point a to point b."""
    a, b = Vector(a), Vector(b)
    d = b - a
    q = Vector((0, 0, 1)).rotation_difference(d.normalized())
    return T(*a) @ q.to_matrix().to_4x4() @ S(1, 1, d.length)


# ---------------------------------------------------------------- noise (deterministic)


def hash3(x, y, z):
    n = math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453
    return n - math.floor(n)


def noise(x, y, z):
    """Smooth value noise in [0, 1]."""
    xi, yi, zi = math.floor(x), math.floor(y), math.floor(z)
    xf, yf, zf = x - xi, y - yi, z - zi

    def s(t):
        return t * t * (3 - 2 * t)

    u, v, w = s(xf), s(yf), s(zf)
    out = 0.0
    for dx in (0, 1):
        for dy in (0, 1):
            for dz in (0, 1):
                h = hash3(xi + dx, yi + dy, zi + dz)
                out += h * (u if dx else 1 - u) * (v if dy else 1 - v) * (w if dz else 1 - w)
    return out


def smooth(a, b, x):
    t = min(max((x - a) / (b - a), 0.0), 1.0)
    return t * t * (3 - 2 * t)


# ---------------------------------------------------------------- materials


def material(name, colour, metal=0.0, rough=0.8, emit=None, strength=0.0, double=False, alpha=1.0):
    m = bpy.data.materials.get(name)
    if m:
        return m
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes.get("Principled BSDF")
    c = hex_rgb(colour)
    p.inputs["Base Color"].default_value = (*c, 1)
    p.inputs["Metallic"].default_value = metal
    p.inputs["Roughness"].default_value = rough
    if emit:
        p.inputs["Emission Color"].default_value = (*hex_rgb(emit), 1)
        p.inputs["Emission Strength"].default_value = strength
    if alpha < 1:
        p.inputs["Alpha"].default_value = alpha
        m.surface_render_method = "BLENDED"
    m.use_backface_culling = not double
    m.diffuse_color = (*c, 1)
    return m


def hex_rgb(h):
    h = h.lstrip("#")
    srgb = [int(h[i : i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(((v + 0.055) / 1.055) ** 2.4 if v > 0.04045 else v / 12.92 for v in srgb)


# ---------------------------------------------------------------- the builder


class Character:
    """Collects rigid parts into one bmesh: each face carries a material, each vertex one bone."""

    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.deform = self.bm.verts.layers.deform.verify()
        self.mats = []
        self.groups = []
        self.bones = {}  # name -> (head, length, parent)
        self.xform = Matrix.Identity(4)  # applied to every part and bone added while set (see lean())

    # -- bookkeeping
    def _mat(self, name):
        if name not in self.mats:
            self.mats.append(name)
        return self.mats.index(name)

    def _group(self, bone):
        if bone not in self.groups:
            self.groups.append(bone)
        return self.groups.index(bone)

    def bone(self, name, head, length=0.1, parent=None):
        self.bones[name] = ((self.xform @ Vector(head).to_4d()).to_3d(), length, parent)

    def frame(self, M=None):
        """Set the transform applied to what follows (None: identity)."""
        self.xform = M if M is not None else Matrix.Identity(4)

    @staticmethod
    def pivot(point, M):
        return T(*point) @ M @ T(*(-Vector(point)))

    def merge(self, tmp, mat, bone, M=None, smooth_shade=False):
        """Copy a temporary bmesh in, transformed by M."""
        M = self.xform @ (M or Matrix.Identity(4))
        mi, gi = self._mat(mat), self._group(bone)
        vmap = {}
        for v in tmp.verts:
            nv = self.bm.verts.new(M @ v.co)
            nv[self.deform][gi] = 1.0
            vmap[v] = nv
        for f in tmp.faces:
            try:
                nf = self.bm.faces.new([vmap[v] for v in f.verts])
            except ValueError:
                continue
            nf.material_index = mi
            nf.smooth = smooth_shade
        tmp.free()

    # -- primitives (each takes a matrix M placing it)
    def lathe(self, profile, segs, mat, bone, M=None, warp=None, cap_bottom=True, cap_top=True, phase=0.0,
              smooth_shade=False):
        """Revolve [(r, z)] around Z. warp(angle, z, r) -> (dx, dy, dz) moves each vertex (angle 0 = front, -Y)."""
        tmp = bmesh.new()
        rings = []
        for r, z in profile:
            if r < 1e-5:
                d = warp(0.0, z, 0.0) if warp else (0, 0, 0)
                v = tmp.verts.new((d[0], d[1], z + d[2]))
                rings.append([v] * segs)
                continue
            ring = []
            for i in range(segs):
                a = phase + i / segs * TAU
                x, y = math.sin(a) * r, -math.cos(a) * r
                d = warp(a, z, r) if warp else (0, 0, 0)
                ring.append(tmp.verts.new((x + d[0], y + d[1], z + d[2])))
            rings.append(ring)
        for j in range(len(rings) - 1):
            for i in range(segs):
                a, b = rings[j][i], rings[j][(i + 1) % segs]
                c, d = rings[j + 1][(i + 1) % segs], rings[j + 1][i]
                quad = [a, b, c, d]
                uniq = []
                for v in quad:
                    if v not in uniq:
                        uniq.append(v)
                if len(uniq) >= 3:
                    tmp.faces.new(uniq)
        if cap_bottom and profile[0][0] > 1e-5:
            tmp.faces.new(list(reversed(rings[0])))
        if cap_top and profile[-1][0] > 1e-5:
            tmp.faces.new(rings[-1])
        self.merge(tmp, mat, bone, M, smooth_shade)

    def cyl(self, r1, r2, h, segs, mat, bone, M=None, caps=True, phase=0.0, smooth_shade=False):
        self.lathe([(r1, 0), (r2, h)], segs, mat, bone, M, cap_bottom=caps, cap_top=caps, phase=phase,
                   smooth_shade=smooth_shade)

    def box(self, sx, sy, sz, mat, bone, M=None, bevel=0.0):
        tmp = bmesh.new()
        bmesh.ops.create_cube(tmp, size=1.0)
        bmesh.ops.scale(tmp, vec=(sx, sy, sz), verts=tmp.verts)
        if bevel > 0:
            bmesh.ops.bevel(tmp, geom=tmp.edges, offset=bevel, segments=1, affect="EDGES")
        self.merge(tmp, mat, bone, M)

    def sphere(self, r, segs, rings, mat, bone, M=None, smooth_shade=False, warp=None):
        tmp = bmesh.new()
        bmesh.ops.create_uvsphere(tmp, u_segments=segs, v_segments=rings, radius=r)
        if warp:
            for v in tmp.verts:
                v.co += Vector(warp(v.co))
        self.merge(tmp, mat, bone, M, smooth_shade)

    def ico(self, r, subdiv, mat, bone, M=None, smooth_shade=False, warp=None):
        tmp = bmesh.new()
        bmesh.ops.create_icosphere(tmp, subdivisions=subdiv, radius=r)
        if warp:
            for v in tmp.verts:
                v.co += Vector(warp(v.co))
        self.merge(tmp, mat, bone, M, smooth_shade)

    def torus(self, R_, r, segs, rsegs, mat, bone, M=None, smooth_shade=False):
        tmp = bmesh.new()
        rings = []
        for i in range(segs):
            a = i / segs * TAU
            ring = []
            for j in range(rsegs):
                b = j / rsegs * TAU
                rr = R_ + math.cos(b) * r
                ring.append(tmp.verts.new((math.cos(a) * rr, math.sin(a) * rr, math.sin(b) * r)))
            rings.append(ring)
        for i in range(segs):
            for j in range(rsegs):
                a, b = rings[i][j], rings[(i + 1) % segs][j]
                c, d = rings[(i + 1) % segs][(j + 1) % rsegs], rings[i][(j + 1) % rsegs]
                tmp.faces.new((a, b, c, d))
        self.merge(tmp, mat, bone, M, smooth_shade)

    def poly(self, points, faces, mat, bone, M=None, smooth_shade=False):
        """Raw geometry: points [(x,y,z)], faces [(i,j,k,...)]."""
        tmp = bmesh.new()
        vs = [tmp.verts.new(p) for p in points]
        for f in faces:
            try:
                tmp.faces.new([vs[i] for i in f])
            except ValueError:
                pass
        self.merge(tmp, mat, bone, M, smooth_shade)

    def slab(self, outline, thickness, mat, bone, M=None):
        """Extrude a closed 2D outline [(x, z)] in the XZ plane by thickness along Y (centred)."""
        tmp = bmesh.new()
        h = thickness / 2
        front = [tmp.verts.new((x, -h, z)) for x, z in outline]
        back = [tmp.verts.new((x, h, z)) for x, z in outline]
        n = len(outline)
        tmp.faces.new(front[::-1])
        tmp.faces.new(back)
        for i in range(n):
            j = (i + 1) % n
            tmp.faces.new((front[i], front[j], back[j], back[i]))
        bmesh.ops.recalc_face_normals(tmp, faces=tmp.faces)
        self.merge(tmp, mat, bone, M)

    def tube(self, path, radius, segs, mat, bone, smooth_shade=False):
        """A tube along points [(x,y,z)]; radius may be a number or a list per point."""
        tmp = bmesh.new()
        rings = []
        pts = [(self.xform @ Vector(p).to_4d()).to_3d() for p in path]
        for k, p in enumerate(pts):
            d = (pts[min(k + 1, len(pts) - 1)] - pts[max(k - 1, 0)]).normalized()
            up = Vector((0, 0, 1)) if abs(d.z) < 0.9 else Vector((1, 0, 0))
            u = d.cross(up).normalized()
            v = d.cross(u).normalized()
            rr = radius[k] if isinstance(radius, (list, tuple)) else radius
            ring = [tmp.verts.new(p + (u * math.cos(i / segs * TAU) + v * math.sin(i / segs * TAU)) * rr)
                    for i in range(segs)]
            rings.append(ring)
        for k in range(len(rings) - 1):
            for i in range(segs):
                tmp.faces.new((rings[k][i], rings[k][(i + 1) % segs], rings[k + 1][(i + 1) % segs], rings[k + 1][i]))
        tmp.faces.new(rings[0][::-1])
        tmp.faces.new(rings[-1])
        saved, self.xform = self.xform, Matrix.Identity(4)
        self.merge(tmp, mat, bone, None, smooth_shade)
        self.xform = saved

    def obj_part(self, path, object_prefix, mat_map, bone, M=None):
        """Kit-bash: take the mesh objects of an OBJ file whose names start with object_prefix.
        mat_map maps the kit's material names to ours."""
        before = set(bpy.data.objects)
        bpy.ops.wm.obj_import(filepath=path)
        new = [o for o in bpy.data.objects if o not in before]
        for o in new:
            if o.type == "MESH" and o.name.startswith(object_prefix):
                tmp = bmesh.new()
                tmp.from_mesh(o.data)
                tmp.transform(o.matrix_world)
                # Split by material: merge each material's faces separately.
                kit_mats = [s.material.name if s.material else "" for s in o.material_slots]
                for idx, kname in enumerate(kit_mats):
                    sub = tmp.copy()
                    bmesh.ops.delete(sub, geom=[f for f in sub.faces if f.material_index != idx], context="FACES")
                    bmesh.ops.delete(sub, geom=[v for v in sub.verts if not v.link_faces], context="VERTS")
                    ours = mat_map.get(kname.split(".")[0], mat_map.get("*"))
                    self.merge(sub, ours, bone, M)
                tmp.free()
        for o in new:
            bpy.data.objects.remove(o, do_unlink=True)

    # -- finishing
    def triangles(self):
        return sum(len(f.verts) - 2 for f in self.bm.faces)

    def build(self, materials):
        """Make the mesh and armature objects. materials: name -> bpy material."""
        scene = bpy.context.scene
        mesh = bpy.data.meshes.new(self.name)
        self.bm.normal_update()
        self.bm.to_mesh(mesh)
        self.bm.free()
        obj = bpy.data.objects.new(self.name, mesh)
        scene.collection.objects.link(obj)
        for m in self.mats:
            mesh.materials.append(materials[m])
        for g in self.groups:
            obj.vertex_groups.new(name=g)

        arm_data = bpy.data.armatures.new(self.name + "_rig")
        arm = bpy.data.objects.new(self.name + "_rig", arm_data)
        scene.collection.objects.link(arm)
        bpy.context.view_layer.objects.active = arm
        bpy.ops.object.mode_set(mode="EDIT")
        made = {}
        for name, (head, length, parent) in self.bones.items():
            eb = arm_data.edit_bones.new(name)
            eb.head = head
            eb.tail = head + Vector((0, 0, length))
            eb.roll = 0
            made[name] = eb
        for name, (_h, _l, parent) in self.bones.items():
            if parent:
                made[name].parent = made[parent]
                made[name].use_connect = False
        bpy.ops.object.mode_set(mode="OBJECT")
        for pb in arm.pose.bones:
            pb.rotation_mode = "XYZ"
        obj.parent = arm
        mod = obj.modifiers.new("Armature", "ARMATURE")
        mod.object = arm
        self.obj, self.arm = obj, arm
        return obj, arm


# ---------------------------------------------------------------- animation


def clip(arm, name, frames, channels):
    """Keyframe a looping clip. channels: {bone: fn(t) -> dict(rx, ry, rz [degrees], ly, lx, lz, s)}
    where t runs 0..1 over the clip. Keys every 2 frames; the last key equals the first, so it loops."""
    arm.animation_data_create()
    action = bpy.data.actions.new(name)
    action.use_fake_user = True
    arm.animation_data.action = action
    for f in range(0, frames + 1, 2):
        t = f / frames
        for bone, fn in channels.items():
            pb = arm.pose.bones[bone]
            v = fn(t)
            pb.rotation_euler = (
                math.radians(v.get("rx", 0)),
                math.radians(v.get("ry", 0)),
                math.radians(v.get("rz", 0)),
            )
            pb.location = (v.get("lx", 0), v.get("ly", 0), v.get("lz", 0))
            s = v.get("s", 1.0)
            sx = v.get("sx", s)
            pb.scale = (sx, v.get("sy", s), v.get("sz", sx))
            pb.keyframe_insert("rotation_euler", frame=f)
            pb.keyframe_insert("location", frame=f)
            pb.keyframe_insert("scale", frame=f)
    # Keep it in the file as an NLA strip so the exporter finds it.
    track = arm.animation_data.nla_tracks.new()
    track.name = name
    track.strips.new(name, 0, action)
    track.mute = True
    arm.animation_data.action = None
    return action


def wave(t, cycles=1, phase=0.0):
    return math.sin((t * cycles + phase) * TAU)


def pose(arm, action_name, t):
    """Show a clip at fraction t (for renders)."""
    action = bpy.data.actions[action_name]
    arm.animation_data.action = action
    if hasattr(arm.animation_data, "action_slot") and action.slots:
        arm.animation_data.action_slot = action.slots[0]
    start, end = action.frame_range
    bpy.context.scene.frame_set(int(start + (end - start) * t))


# ---------------------------------------------------------------- export


def export(path):
    bpy.ops.object.select_all(action="SELECT")
    for o in bpy.context.scene.objects:
        if o.animation_data:
            o.animation_data.action = None
    bpy.context.scene.frame_set(0)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=False,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_skins=True,
        export_def_bones=False,
        export_anim_slide_to_zero=True,
        export_force_sampling=True,
        export_optimize_animation_size=True,
        export_materials="EXPORT",
        export_normals=True,
        export_texcoords=False,
        export_extras=True,
    )


# ---------------------------------------------------------------- rendering

# The game's room camera: looking along -(1, 0.9, 1) at a narrow 28° vertical field of view from 19 m.
VIEW = Vector((1, 0.9, 1)).normalized()


def stage(scene, floor="#3a3a40", world="#15161c"):
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "Standard" if "Standard" in [
        e.identifier for e in scene.view_settings.bl_rna.properties["view_transform"].enum_items] else \
        scene.view_settings.view_transform
    w = bpy.data.worlds.new("w")
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs[0].default_value = (*hex_rgb(world), 1)
    w.node_tree.nodes["Background"].inputs[1].default_value = 1.0
    scene.world = w
    # Floor (in Blender Z-up).
    bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, 0))
    fl = bpy.context.object
    fl.data.materials.append(material("_floor", floor, rough=1))
    # Key: a cool moon from behind-left; fill: warm from the camera side.
    key = bpy.data.objects.new("key", bpy.data.lights.new("key", "SUN"))
    key.data.energy = 2.2
    key.data.color = hex_rgb("#c8d0e8")
    key.rotation_euler = (math.radians(50), 0, math.radians(200))
    scene.collection.objects.link(key)
    fill = bpy.data.objects.new("fill", bpy.data.lights.new("fill", "SUN"))
    fill.data.energy = 1.4
    fill.data.color = hex_rgb("#ffe2b8")
    fill.rotation_euler = (math.radians(55), 0, math.radians(-40))
    scene.collection.objects.link(fill)
    rim = bpy.data.objects.new("rim", bpy.data.lights.new("rim", "SUN"))
    rim.data.energy = 1.2
    rim.rotation_euler = (math.radians(70), 0, math.radians(120))
    scene.collection.objects.link(rim)


def camera(scene, target, direction, distance, fov=28, res=(640, 720)):
    cam = scene.camera
    if not cam:
        cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
        scene.collection.objects.link(cam)
        scene.camera = cam
    cam.data.sensor_fit = "VERTICAL"
    cam.data.angle = math.radians(fov)
    t = Vector(target)
    cam.location = t + Vector(direction).normalized() * distance
    cam.rotation_euler = (t - cam.location).to_track_quat("-Z", "Y").to_euler()
    scene.render.resolution_x, scene.render.resolution_y = res
    return cam


def game_dir(facing_deg):
    """The game camera's direction (three: (1, 0.9, 1)) in Blender coordinates (x, -z, y), relative to a
    character whose front has been turned by facing_deg about Z."""
    d = Vector((1, -1, 0.9)).normalized()
    return (Matrix.Rotation(math.radians(-facing_deg), 4, "Z") @ d.to_4d()).to_3d()


def render(scene, path):
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
