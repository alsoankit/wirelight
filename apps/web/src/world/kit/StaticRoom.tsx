import { useGLTF } from "@react-three/drei";
import { useEffect, useMemo } from "react";
import type { BufferGeometry, Material, Vector3 } from "three";
import { assembleRoom, layoutKey } from "../bake/assemble";
import { applyLightmapUv, findBake, useLightmaps } from "../bake/lightmap";
import { TO_MOON } from "../moon";
import type { RegionId } from "../region";
import { bakeMoonlight } from "./bake";
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

// The merge (and, without a Blender bake, the moonlight bake) runs while the room renders and can
// take a few hundred milliseconds. A render that long is interrupted by the session's own updates
// (messages crossing, the clock), and React drops an interrupted first render's memos, so a room
// entered mid-play could rebuild forever and never appear. The work is kept here, by its inputs,
// until a render that uses it commits; the room that commits it disposes of it when it goes.
type Built = { inputs: readonly unknown[]; merged: Merged[] };
const built = new WeakMap<Placement[], Built>();

// Geometry made in code (the floor), already in world space, with the region material to use.
export type Extra = { name: string; geometry: BufferGeometry };

export function StaticRoom({
  placements,
  extras = [],
  toCamera,
  toMoon = TO_MOON,
  shadowsWithin,
  region = 1,
}: {
  region?: RegionId; // whose palette the pieces wear (kit/regionMaterials.ts)
  placements: Placement[];
  extras?: Extra[];
  toCamera: Vector3; // from the room toward the fixed camera
  toMoon?: Vector3; // from the room toward the moon (Region 1 rooms by default)
  shadowsWithin?: number; // metres from the origin; further out, no shadow rays (fog hides them)
}) {
  const names = useMemo(() => [...new Set(placements.map((p) => p.piece))], [placements]);
  const gltfs = useGLTF(names.map(pieceUrl));
  // drei hands back a new array each render; the scenes inside are cached, so key the work on them
  // (otherwise the merge and the bakes would run again on every render).
  const scenesKey = gltfs.map((g) => g.scene.uuid).join(",");

  // Baked light from Blender, when this layout has it (world/bake): suspends until its maps load.
  const bake = useMemo(() => findBake(layoutKey(placements, extras, region)), [placements, extras, region]);
  const maps = useLightmaps(bake);

  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on the cached scenes (scenesKey), not the array
  const merged = useMemo<Merged[]>(() => {
    const inputs = [scenesKey, extras, toCamera, toMoon, shadowsWithin, region, maps];
    const known = built.get(placements);
    if (known?.inputs.every((v, i) => v === inputs[i])) return known.merged;
    const scenes = new Map(names.map((n, i) => [n, gltfs[i]?.scene]));
    const { parts, occluder } = assembleRoom(
      scenes,
      placements,
      extras,
      toCamera,
      (n) => !!bakedRegionMaterial(n, region),
    );
    // Light: the Blender bake if it matches this geometry; otherwise moonlight baked here, once, into
    // the vertices (everything static blocks it; nothing renders shadows at runtime).
    const lightmapped = applyLightmapUv(
      maps,
      parts.map((m) => m.geometry),
    );
    if (!lightmapped && occluder)
      bakeMoonlight(
        parts.map((m) => m.geometry),
        occluder,
        toMoon,
        shadowsWithin,
      );
    const lit = lightmapped ? maps : null;
    const result = parts.map((m) => ({
      name: m.key,
      geometry: m.geometry,
      material: bakedRegionMaterial(m.name, region, lit) ?? (m.original as Material),
    }));
    built.set(placements, { inputs, merged: result });
    return result;
  }, [scenesKey, names, placements, extras, toCamera, toMoon, shadowsWithin, region, maps]);

  useEffect(() => {
    return () => {
      if (built.get(placements)?.merged === merged) built.delete(placements);
      for (const m of merged) m.geometry.dispose();
    };
  }, [merged, placements]);

  return (
    <>
      {merged.map((m) => (
        <mesh key={m.name} geometry={m.geometry} material={m.material} />
      ))}
    </>
  );
}
