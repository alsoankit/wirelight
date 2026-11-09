import { BufferAttribute, type BufferGeometry, LinearFilter, SRGBColorSpace, type Texture, TextureLoader } from "three";
import { float, mix, texture, uv } from "three/tsl";
import type { Extra, Placement } from "../kit/StaticRoom";
import type { KitPlacement } from "../kits/placement";
import { ruinHere } from "../ruin";
import { kitLayoutKey, layoutKey } from "./assemble";
import { geometrySignature, unwrapLightmap } from "./lightmapUv";
import { BAKES, type BakeEntry } from "./manifest";

// Baked light from Blender (tools/bake): for a layout that has a bake, three maps over the room's
// lightmap atlas: the light in ruin, the light restored (soft moon shadows, lamp pools, bounce) and
// contact occlusion. Materials add colour × light, blending the two maps with the ruin dial at each
// point, so the restoration wave sweeps the baked light too; the occlusion darkens the ambient fill.
// Rooms without a bake (or whose geometry changed since) keep the code bake (kit/bake.ts).
//
// The maps hold sRGB(E / RANGE): the GPU decodes sRGB for free, and the darks keep their precision.
export const RANGE = 4;
// Blender's contact map includes broad surface shading; keep only a light contact cue at runtime.
const AO_STRENGTH = 0.2;

export type Lightmaps = { id: string; ruin: Texture; lit: Texture; ao: Texture; entry: BakeEntry };

// Dev aid: ?bake=0 shows the code bake instead (before/after screenshots).
const off = typeof location !== "undefined" && new URLSearchParams(location.search).get("bake") === "0";

/** The bake for a layout key (bake/assemble.ts layoutKey or kitLayoutKey), if there is one. */
/** Whether a room's bake holds its lamps, so it needs no live ones (0101; older bakes hold only part). */
export function lampsBaked(
  placements: Placement[],
  extras: Extra[] | undefined,
  pieces: KitPlacement[] | undefined,
  region: number,
): boolean {
  const room = findBake(layoutKey(placements, extras ?? [], region));
  const kit = pieces?.length ? findBake(kitLayoutKey(pieces, region)) : undefined;
  return !!(room?.lamps || kit?.lamps);
}

export function findBake(key: string): BakeEntry | undefined {
  return off ? undefined : BAKES[key];
}

const loaded = new Map<string, { promise: Promise<void>; maps?: Lightmaps | null }>();
const KEEP = 3; // layouts' maps kept on the GPU (one room shows at a time; going back is instant)

function load(entry: BakeEntry): Promise<Lightmaps | null> {
  const loader = new TextureLoader();
  const one = (state: string) =>
    loader.loadAsync(`/bake/${entry.id}-${state}.webp?v=${entry.v}`).then((t) => {
      t.colorSpace = SRGBColorSpace;
      t.generateMipmaps = false;
      t.minFilter = LinearFilter;
      t.magFilter = LinearFilter;
      return t;
    });
  return Promise.all([one("ruin"), one("lit"), one("ao")]).then(
    ([ruin, lit, ao]) => ({ id: entry.id, ruin, lit, ao, entry }),
    () => null, // a missing map: the room keeps its code bake
  );
}

/**
 * The maps for a bake, for use during render: suspends (React Suspense) until they are loaded, then
 * returns them (null when there is no bake or it failed to load).
 */
export function useLightmaps(entry: BakeEntry | undefined): Lightmaps | null {
  if (!entry) return null;
  const known = loaded.get(entry.id);
  if (known) {
    if (known.maps === undefined) throw known.promise;
    // Most recently used last.
    loaded.delete(entry.id);
    loaded.set(entry.id, known);
    return known.maps;
  }
  const slot: { promise: Promise<void>; maps?: Lightmaps | null } = { promise: Promise.resolve() };
  slot.promise = load(entry).then((maps) => {
    slot.maps = maps;
  });
  loaded.set(entry.id, slot);
  while (loaded.size > KEEP) {
    const [oldest, old] = loaded.entries().next().value as [string, { maps?: Lightmaps | null }];
    loaded.delete(oldest);
    for (const t of old.maps ? [old.maps.ruin, old.maps.lit, old.maps.ao] : []) t.dispose();
  }
  throw slot.promise;
}

/**
 * Gives the room's drawn geometries their lightmap UVs (`uv1`), as the exporter made them. Returns
 * false (and changes nothing) when the geometry isn't what was baked: then don't use the maps.
 * The geometries must be unindexed, in world space, in the order the exporter assembled them.
 */
export function applyLightmapUv(maps: Lightmaps | null, geometries: BufferGeometry[]): boolean {
  if (!maps) return false;
  if (geometrySignature(geometries) !== maps.entry.signature) {
    console.warn(`[wirelight] bake ${maps.id} doesn't match the room any more: using the code bake`);
    return false;
  }
  const { uvs } = unwrapLightmap(geometries, maps.entry.size);
  geometries.forEach((g, i) => {
    g.setAttribute("uv1", new BufferAttribute(uvs[i] as Float32Array, 2));
  });
  console.info(`[wirelight] baked light: ${maps.id}`);
  return true;
}

/**
 * Shader nodes for a material on a lightmapped mesh: `light` is the baked light here (ruin and restored
 * blended by the ruin dial at this point): use `emissiveNode = albedo.mul(light)`; `ao` is occlusion
 * for `aoNode`.
 */
export function bakedLightNodes(maps: Lightmaps) {
  const at = uv(1);
  const light = mix(texture(maps.lit, at).rgb, texture(maps.ruin, at).rgb, ruinHere)
    .mul(RANGE)
    .mul(mix(float(1), float(0.62), ruinHere));
  const bakedAo = texture(maps.ao, at).r.max(float(0.25));
  const ao = mix(float(1), bakedAo, AO_STRENGTH);
  return { light, ao };
}
