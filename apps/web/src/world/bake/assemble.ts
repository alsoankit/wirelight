import {
  BufferAttribute,
  BufferGeometry,
  Euler,
  type Material,
  Matrix4,
  Mesh,
  type Object3D,
  Quaternion,
  Vector3,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { bakeAgeing } from "../kit/bake";
import type { Extra, Placement } from "../kit/StaticRoom";
import type { KitPlacement } from "../kits/placement";

// Puts a room's static geometry together: kit pieces placed by the layout, merged into one geometry
// per material, plus the pieces made in code (extras), keeping only the triangles that face the
// camera. Shared by the game (kit/StaticRoom.tsx) and the lightmap exporter (tools/bake/export.mjs),
// so a baked lightmap lines up with exactly the triangles the game draws.

export type Assembled = {
  /** Kit material name, or `extra:<name>` for pieces made in code. */
  key: string;
  /** The material name (a region swatch, or the kit's own). */
  name: string;
  /** The kit's own material (kept when the region has no swatch for it). */
  original?: Material;
  /** World space, unindexed: what is drawn (camera-facing triangles only). */
  geometry: BufferGeometry;
};

// The kit is quantised (KHR_mesh_quantization: 16-bit positions, 8-bit normals, normalised), which
// can't hold world-space coordinates. Copy position and normal into plain float arrays, unindexed so
// every part merges the same way; other attributes (unused UVs) are dropped.
function floatCopy(source: BufferGeometry): BufferGeometry {
  const geometry = source.index ? source.toNonIndexed() : source;
  const out = new BufferGeometry();
  for (const name of ["position", "normal"]) {
    const attribute = geometry.getAttribute(name);
    if (!attribute) continue;
    const values = new Float32Array(attribute.count * 3);
    for (let i = 0; i < attribute.count; i++) {
      values[i * 3] = attribute.getX(i);
      values[i * 3 + 1] = attribute.getY(i);
      values[i * 3 + 2] = attribute.getZ(i);
    }
    out.setAttribute(name, new BufferAttribute(values, 3));
  }
  return out;
}

// Triangles facing away from the fixed camera are never seen (the backs of walls, statues, columns):
// drop them from what is drawn. A little slack keeps faces at grazing angles, for the parallax.
const BACKFACE_SLACK = -0.12;

function facingCamera(source: BufferGeometry, toCamera: Vector3): BufferGeometry {
  const position = source.getAttribute("position");
  const keep: number[] = [];
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  for (let t = 0; t < position.count / 3; t++) {
    a.fromBufferAttribute(position, t * 3);
    b.fromBufferAttribute(position, t * 3 + 1);
    c.fromBufferAttribute(position, t * 3 + 2);
    const n = b.sub(a).cross(c.sub(a)).normalize();
    if (n.dot(toCamera) >= BACKFACE_SLACK) keep.push(t);
  }
  const out = new BufferGeometry();
  for (const [name, attribute] of Object.entries(source.attributes)) {
    const size = attribute.itemSize;
    const values = new Float32Array(keep.length * 3 * size);
    keep.forEach((t, k) => {
      for (let v = 0; v < 3; v++) {
        for (let i = 0; i < size; i++) values[(k * 3 + v) * size + i] = attribute.getComponent(t * 3 + v, i);
      }
    });
    out.setAttribute(name, new BufferAttribute(values, size));
  }
  return out;
}

/**
 * The room's static geometry. `scenes`: each kit piece's loaded scene by name. `hasSwatch`: whether the
 * region styles a material (extras without one are dropped). Returns what is drawn, and the whole room
 * (every triangle, facing the camera or not) as one position-only geometry, for blocking light.
 */
export function assembleRoom(
  scenes: Map<string, Object3D | undefined>,
  placements: Placement[],
  extras: Extra[],
  toCamera: Vector3,
  hasSwatch: (name: string) => boolean,
): { parts: Assembled[]; occluder: BufferGeometry | null } {
  const byMaterial = new Map<string, { original: Material; parts: BufferGeometry[] }>();
  const placement = new Matrix4();
  const world = new Matrix4();
  for (const p of placements) {
    const scene = scenes.get(p.piece);
    if (!scene) continue;
    scene.updateMatrixWorld(true);
    const [rx, ry, rz] = p.rotation ?? [0, p.rotationY ?? 0, 0];
    placement.compose(
      new Vector3(...p.position),
      new Quaternion().setFromEuler(new Euler(rx, ry, rz)),
      new Vector3().setScalar(p.scale ?? 1),
    );
    scene.traverse((o) => {
      if (!(o instanceof Mesh) || Array.isArray(o.material)) return;
      const part = floatCopy(o.geometry as BufferGeometry);
      part.applyMatrix4(world.multiplyMatrices(placement, o.matrixWorld));
      const name = (o.material as Material).name;
      const entry = byMaterial.get(name) ?? { original: o.material as Material, parts: [] };
      entry.parts.push(part);
      byMaterial.set(name, entry);
    });
  }
  const result: Assembled[] = [];
  for (const [name, { original, parts }] of byMaterial) {
    const geometry = mergeGeometries(parts);
    if (!geometry) continue;
    bakeAgeing(geometry);
    result.push({ key: name, name, original, geometry });
  }
  // Extras sharing a material become one mesh (one draw call).
  for (const name of new Set(extras.map((e) => e.name))) {
    const same = extras.filter((e) => e.name === name).map((e) => e.geometry);
    const geometry = same.length === 1 ? same[0] : mergeGeometries(same);
    if (!hasSwatch(name) || !geometry) continue;
    // Pieces made in code age like the kit's (the floor brings its own ageing).
    if (!geometry.getAttribute("ageing")) bakeAgeing(geometry);
    result.push({ key: `extra:${name}`, name, geometry });
  }
  // Everything static blocks light, whichever way it faces.
  const occluder = mergeGeometries(
    result.map((m) => {
      const g = new BufferGeometry();
      const flat = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
      g.setAttribute("position", flat.getAttribute("position"));
      return g;
    }),
  );
  // Draw (and bake light into) only what faces the camera.
  const parts = result.map((m) => {
    const flat = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
    return { ...m, geometry: facingCamera(flat, toCamera) };
  });
  return { parts, occluder };
}

/**
 * Which layout this is, before anything is loaded: a hash of the placements, the pieces made in code
 * and the region. The bake manifest is looked up by it; the drawn geometry is then checked against
 * the bake's signature (lightmapUv.ts), so a changed kit piece falls back to the code bake.
 */
export function layoutKey(placements: Placement[], extras: Extra[], region: number): string {
  let h = 0x811c9dc5;
  const mix = (x: number) => {
    h = Math.imul(h ^ (x | 0), 16777619);
  };
  const text = JSON.stringify(placements);
  for (let i = 0; i < text.length; i++) mix(text.charCodeAt(i));
  for (const e of extras) {
    for (let i = 0; i < e.name.length; i++) mix(e.name.charCodeAt(i));
    const p = e.geometry.getAttribute("position");
    mix(p.count);
    for (let i = 0; i < p.count; i += 7) mix(Math.round(p.getX(i) * 1000) + Math.round(p.getZ(i) * 1000) * 7);
  }
  mix(region);
  return (h >>> 0).toString(16).padStart(8, "0");
}

/**
 * The textured kit pieces' layout key (as `layoutKey`, for `RoomLayout.kitPieces`). Their geometry is
 * assembled by world/kits/assembleKit.ts, in the game and in the exporter alike.
 */
export function kitLayoutKey(pieces: KitPlacement[], region: number): string {
  return layoutKey(pieces as unknown as Placement[], [], region + 100);
}
