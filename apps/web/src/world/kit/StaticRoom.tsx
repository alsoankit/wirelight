import { useGLTF } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import { BufferAttribute, BufferGeometry, Euler, type Material, Matrix4, Mesh, Quaternion, Vector3 } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { TO_MOON } from "../moon";
import { bakeAgeing, bakeMoonlight } from "./bake";
import { pieceUrl } from "./Piece";
import { bakedRegionMaterial } from "./regionMaterials";

// A room's static kit pieces, merged into one mesh per material: a few hundred placements become
// about twenty draw calls. Stone ageing and moonlight are baked into the merged vertices once
// (bake.ts); nothing renders shadows at runtime. Only things that never move belong here.

export type Placement = {
  piece: string;
  position: [number, number, number];
  rotation?: [number, number, number]; // radians; use rotationY for the common case
  rotationY?: number;
  scale?: number;
};

type Merged = { name: string; geometry: BufferGeometry; material: Material };

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

// Geometry made in code (the floor), already in world space, with the region material to use.
export type Extra = { name: string; geometry: BufferGeometry };

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

export function StaticRoom({
  placements,
  extras = [],
  toCamera,
  toMoon = TO_MOON,
}: {
  placements: Placement[];
  extras?: Extra[];
  toCamera: Vector3; // from the room toward the fixed camera
  toMoon?: Vector3; // from the room toward the moon (Region 1 rooms by default)
}) {
  const names = useMemo(() => [...new Set(placements.map((p) => p.piece))], [placements]);
  const gltfs = useGLTF(names.map(pieceUrl));
  // drei hands back a new array each render; the scenes inside are cached, so key the work on them
  // (otherwise the merge and the bakes would run again on every render).
  const scenesKey = gltfs.map((g) => g.scene.uuid).join(",");

  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the cached scenes (scenesKey), not the array
  const merged = useMemo<Merged[]>(() => {
    const scenes = new Map(names.map((n, i) => [n, gltfs[i]?.scene]));
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
    const result: Merged[] = [];
    for (const [name, { original, parts }] of byMaterial) {
      const geometry = mergeGeometries(parts);
      if (!geometry) continue;
      bakeAgeing(geometry);
      result.push({ name, geometry, material: bakedRegionMaterial(name) ?? original });
    }
    // Extras sharing a material become one mesh (one draw call).
    for (const name of new Set(extras.map((e) => e.name))) {
      const material = bakedRegionMaterial(name);
      const same = extras.filter((e) => e.name === name).map((e) => e.geometry);
      const geometry = same.length === 1 ? same[0] : mergeGeometries(same);
      if (material && geometry) result.push({ name: `extra:${name}`, geometry, material });
    }
    // Moonlight, baked once: everything static blocks it; nothing renders shadows at runtime.
    const occluder = mergeGeometries(
      result.map((m) => {
        const g = new BufferGeometry();
        const flat = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
        g.setAttribute("position", flat.getAttribute("position"));
        return g;
      }),
    );
    // Draw (and bake light into) only what faces the camera; the full room still blocks the moon.
    const visible = result.map((m) => {
      const flat = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
      return { ...m, geometry: facingCamera(flat, toCamera) };
    });
    if (occluder)
      bakeMoonlight(
        visible.map((m) => m.geometry),
        occluder,
        toMoon,
      );
    return visible;
  }, [scenesKey, names, placements, extras, toCamera, toMoon]);

  useEffect(() => {
    return () => {
      for (const m of merged) m.geometry.dispose();
    };
  }, [merged]);

  return (
    <>
      {merged.map((m) => (
        <mesh key={m.name} geometry={m.geometry} material={m.material} />
      ))}
    </>
  );
}
