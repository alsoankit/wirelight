import {
  BufferAttribute,
  type BufferGeometry,
  Color,
  Euler,
  BufferGeometry as Geometry,
  type Material,
  Matrix4,
  Mesh,
  type Object3D,
  Quaternion,
  SkinnedMesh,
  Vector3,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { KitPlacement } from "./placement";

// A room's textured kit pieces, merged into one geometry per material (glowing pieces apart from the
// rest): world space, unindexed, with position, normal, the kit's own `uv` and a `color` (the piece's
// vertex colours × its material's colour: the props' trim sheets are tinted per vertex, books and
// chairs get their colour that way). Triangles facing away from the fixed camera are dropped, except on
// thin, two-sided surfaces (leaves, cloth, glass), whose back is the side the camera may see.
//
// The game (KitRoom) and the bake exporter (tools/bake/export.mjs) both build from this, so a lightmap
// baked from the same pieces lines up. Thin surfaces aren't culled; skinned pieces (the chest) are left
// out here and drawn on their own (KitRoom).

/** Materials that are thin, two-sided cards: never culled by facing. */
export const THIN_MATERIAL = /leaves|leaf|grass|flower|fern|clover|vine|banner|cloth|glass|page|mushroom/i;

/** Whether a loaded piece is skinned (drawn on its own, never merged). */
export function isSkinned(scene: Object3D): boolean {
  let skinned = false;
  scene.traverse((o) => {
    if (o instanceof SkinnedMesh) skinned = true;
  });
  return skinned;
}

export type KitPart = {
  /** Material name, `|glow` for glowing pieces. */
  key: string;
  /** The kit the material's textures come from (its first piece). */
  kit: string;
  name: string;
  glow: boolean;
  /** The kit's own material (textures, colour), from the first piece that used it. */
  original: Material;
  /** World space, unindexed: what is drawn. */
  geometry: BufferGeometry;
};

// The kit is quantised (KHR_mesh_quantization: 16-bit positions and UVs, 8-bit normals, normalised),
// which can't hold world-space coordinates: copy into plain float arrays, unindexed.
function floatCopy(source: BufferGeometry, tint: Color): BufferGeometry {
  const geometry = source.index ? source.toNonIndexed() : source;
  const out = new Geometry();
  const count = geometry.getAttribute("position").count;
  for (const name of ["position", "normal"]) {
    const attribute = geometry.getAttribute(name);
    if (!attribute) continue;
    const values = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      values[i * 3] = attribute.getX(i);
      values[i * 3 + 1] = attribute.getY(i);
      values[i * 3 + 2] = attribute.getZ(i);
    }
    out.setAttribute(name, new BufferAttribute(values, 3));
  }
  if (!out.getAttribute("normal")) out.computeVertexNormals();
  const uv = geometry.getAttribute("uv");
  const uvs = new Float32Array(count * 2);
  if (uv) for (let i = 0; i < count; i++) [uvs[i * 2], uvs[i * 2 + 1]] = [uv.getX(i), uv.getY(i)];
  out.setAttribute("uv", new BufferAttribute(uvs, 2));
  const vertexColour = geometry.getAttribute("color");
  const colours = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    colours[i * 3] = tint.r * (vertexColour ? vertexColour.getX(i) : 1);
    colours[i * 3 + 1] = tint.g * (vertexColour ? vertexColour.getY(i) : 1);
    colours[i * 3 + 2] = tint.b * (vertexColour ? vertexColour.getZ(i) : 1);
  }
  out.setAttribute("color", new BufferAttribute(colours, 3));
  return out;
}

// A little slack keeps faces at grazing angles, for the parallax (as StaticRoom).
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
  const out = new Geometry();
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

/** A placement's transform, with the kit's scale factor (`kitScale`) times its own. */
export function placementMatrix(p: KitPlacement, kitScale: number, out = new Matrix4()): Matrix4 {
  const [rx, ry, rz] = p.rotation ?? [0, p.rotationY ?? 0, 0];
  return out.compose(
    new Vector3(...p.position),
    new Quaternion().setFromEuler(new Euler(rx, ry, rz)),
    new Vector3().setScalar(kitScale * (p.scale ?? 1)),
  );
}

const WHITE = new Color(1, 1, 1);

/**
 * Merges the static pieces. `scenes`: each piece's loaded scene by its URL; `urlOf` and `scaleOf`
 * read the catalogue. Skinned pieces are skipped (see isSkinned).
 */
export function assembleKit(
  scenes: Map<string, Object3D | undefined>,
  pieces: KitPlacement[],
  urlOf: (p: KitPlacement) => string | undefined,
  scaleOf: (p: KitPlacement) => number,
  toCamera: Vector3,
): KitPart[] {
  const byKey = new Map<string, Omit<KitPart, "geometry"> & { parts: BufferGeometry[] }>();
  const placement = new Matrix4();
  const world = new Matrix4();
  for (const p of pieces) {
    const url = urlOf(p);
    const scene = url ? scenes.get(url) : undefined;
    if (!scene || isSkinned(scene)) continue;
    scene.updateMatrixWorld(true);
    placementMatrix(p, scaleOf(p), placement);
    scene.traverse((o) => {
      if (!(o instanceof Mesh) || Array.isArray(o.material)) return;
      const material = o.material as Material & { color?: Color };
      const tint = (material.color ?? WHITE).clone();
      if (p.tint) tint.multiply(new Color(p.tint));
      const part = floatCopy(o.geometry as BufferGeometry, tint);
      part.applyMatrix4(world.multiplyMatrices(placement, o.matrixWorld));
      const name = material.name;
      const glow = !!p.glow;
      const key = glow ? `${name}|glow` : name;
      const entry = byKey.get(key) ?? { key, kit: p.kit, name, glow, original: material, parts: [] };
      entry.parts.push(part);
      byKey.set(key, entry);
    });
  }
  const out: KitPart[] = [];
  for (const { parts, ...entry } of byKey.values()) {
    const geometry = mergeGeometries(parts);
    for (const part of parts) part.dispose();
    if (!geometry) continue;
    const drawn = THIN_MATERIAL.test(entry.name) ? geometry : facingCamera(geometry, toCamera);
    // A material whose every face looks away from the camera leaves nothing to draw or bake (an
    // empty glTF primitive is invalid: Blender refuses the whole layout).
    if (drawn.getAttribute("position").count === 0) continue;
    out.push({ ...entry, geometry: drawn });
  }
  return out;
}
