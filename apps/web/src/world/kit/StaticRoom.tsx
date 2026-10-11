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

export function StaticRoom({ placements, extras = [] }: { placements: Placement[]; extras?: Extra[] }) {
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
    for (const extra of extras) {
      const material = bakedRegionMaterial(extra.name);
      if (material) result.push({ name: extra.name, geometry: extra.geometry, material });
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
    if (occluder)
      bakeMoonlight(
        result.map((m) => m.geometry),
        occluder,
        TO_MOON,
      );
    return result;
  }, [scenesKey, names, placements, extras]);

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
