import { type Color, type Material, Mesh, type Object3D } from "three";
import {
  attribute,
  color,
  float,
  mix,
  mx_noise_float,
  normalWorld,
  positionWorld,
  smoothstep,
  step,
  vec3,
} from "three/tsl";
import { MeshStandardNodeMaterial } from "three/webgpu";
import { bakedLightNodes, type Lightmaps } from "../bake/lightmap";
import { LOOKS, type RegionId } from "../region";
import { ruinHere as ruin } from "../ruin";
import { TOWN_SWATCHES } from "../town/palette";

// Restyles a kit piece in its region's palette (world/art-briefs/region-*.md). Every kit material with
// the same name shares one node material per region, whose colour blends from the ruined palette to
// the restored one with the ruin dial. Materials not listed keep their own look.
//
// The kit's flat colours read as clean tiles, so stone gets age in the shader: blotchy weathering,
// grime that gathers low on walls, and moss (soot in the Works, dust in the Cathedral) creeping over
// upward faces and the bottoms of walls.
//
// Region 1's kit (Quaternius Ultimate Modular Ruins) stands in for every region until each has its
// own: Regions 2–4 recolour it and add pieces made in code (regions/*), named by the swatches below.

type Swatch = {
  ruined: string;
  restored: string;
  roughness?: number;
  metalness?: number;
  glow?: number; // lamps and glass: emissive strength when restored (out in ruin)
  ember?: number; // how much of the glow stays in ruin (default 0.15)
  aged?: boolean; // stone: weathering, grime and creeping moss
  leafy?: boolean; // clipped hedges: dark gaps and lit leaf-tips, painted in the shader
  verdigris?: boolean; // old brass: green-grey patina in patches
  patchy?: string; // moss and ivy: broken into patches, the stone (this swatch) showing between them
  coursed?: [number, number]; // stone laid in courses on walls: [course height, block length] in metres
};

const PATINA_RUINED = "#43564f";
const PATINA_RESTORED = "#5a7d68";

const REGION_1: Record<string, Swatch> = {
  // Ruined stone is the brief's cool grey-blue #5B6370: grey first, a little blue (not navy).
  Floor: { ruined: "#5d636c", restored: "#988168", roughness: 0.95, aged: true },
  Main: { ruined: "#636973", restored: "#a28a6c", roughness: 0.95, aged: true },
  Main2: { ruined: "#5e646d", restored: "#957e62", roughness: 0.95, aged: true },
  Stone: { ruined: "#656a73", restored: "#a8916f", roughness: 0.95, aged: true },
  Highlights: { ruined: "#6b7078", restored: "#ae9473", roughness: 0.95, aged: true },
  Black: { ruined: "#16181d", restored: "#221a14", roughness: 1 },
  // Moss on the walls comes in patches, never whole flat-green bricks (playtest).
  // Clipped hedges in the garden courts (regions/hedge.ts): dry grey-green in ruin, deep green restored.
  Hedge: { ruined: "#464e47", restored: "#3f6a39", roughness: 1, leafy: true },
  Leaf_Texture: { ruined: "#4a524b", restored: "#4f7a40", roughness: 1, patchy: "Highlights" },
  Texture_Leaves: { ruined: "#3f4a42", restored: "#3E6B3A", roughness: 1 },
  Green: { ruined: "#4d564d", restored: "#5f8f4c", roughness: 1, patchy: "Highlights" },
  Bark: { ruined: "#3d3833", restored: "#5c4330", roughness: 1 },
  // The roots pushing in through the walls (regions/roots.ts): dry and grey in ruin (brief), a living
  // brown restored, moss gathering on their tops and where they lie on the floor.
  Root: { ruined: "#6b675f", restored: "#7a5a3e", roughness: 1, aged: true },
  Dirt: { ruined: "#2f2c29", restored: "#4a3a2a", roughness: 1 },
  Earth: { ruined: "#2a2926", restored: "#3a3024", roughness: 1, aged: true },
  Cloth: { ruined: "#2b2f38", restored: "#3a332e", roughness: 1 },
  Metal: { ruined: "#5c4a3d", restored: "#C8743E", roughness: 0.45, metalness: 0.7 },
  Metal_Light: { ruined: "#6b5a4c", restored: "#d99560", roughness: 0.45, metalness: 0.7 },
  DarkMetal: { ruined: "#2f2a26", restored: "#5a3f28", roughness: 0.5, metalness: 0.6 },
  Brass: { ruined: "#5e5038", restored: "#C99B4A", roughness: 0.4, metalness: 0.8 },
  Iron: { ruined: "#24272c", restored: "#2e2b29", roughness: 0.55, metalness: 0.75 },
  AgedBrass: { ruined: "#6a5a3e", restored: "#a8823f", roughness: 0.55, metalness: 0.7, verdigris: true },
  Wood: { ruined: "#4a4540", restored: "#6e4a2f", roughness: 0.85 },
  DarkWood: { ruined: "#33302d", restored: "#46301f", roughness: 0.85 },
  Pot_Main: { ruined: "#524d48", restored: "#94583a", roughness: 0.9 },
  Pot_Detail: { ruined: "#403c39", restored: "#5e432e", roughness: 0.9 },
  // The old cloak: faded cloth (a saturated red read as a slab on the wall).
  Flag: { ruined: "#3f4249", restored: "#4f3d35", roughness: 0.95 },
  Candle: { ruined: "#97938a", restored: "#c9bea6", roughness: 0.7 },
  Parchment: { ruined: "#8d887b", restored: "#cbbd9c", roughness: 0.95 },
  // Flames are kept modest so restored rooms glow warmly without glare (0051).
  Light: { ruined: "#3a3530", restored: "#FFC46B", glow: 2.2 },
  Fire: { ruined: "#3a3028", restored: "#FFB35A", glow: 2.6 },
};

// Region 2, the Sorting Works: a clockwork workshop. Brass and copper, walnut, slate floors; warm
// brick walls; no greenery (the kit's moss reads as plain wall here). Brief: tarnished brown-green
// metal and grey wood in ruin.
const REGION_2: Record<string, Swatch> = {
  // Slate floors stay slate when restored (brief #4A5058, lifted a little for balance); the warmth is
  // in the brass, copper, walnut and lamps, not the whole room.
  Floor: { ruined: "#474c54", restored: "#59606a", roughness: 0.8, aged: true },
  Main: { ruined: "#6a6c71", restored: "#7b746d", roughness: 0.95, aged: true },
  Main2: { ruined: "#65676c", restored: "#746c65", roughness: 0.95, aged: true },
  Stone: { ruined: "#6c6e73", restored: "#7f776f", roughness: 0.95, aged: true },
  Highlights: { ruined: "#717378", restored: "#857c73", roughness: 0.95, aged: true },
  Leaf_Texture: { ruined: "#65676c", restored: "#746c65", roughness: 0.95, aged: true },
  Green: { ruined: "#65676c", restored: "#746c65", roughness: 0.95, aged: true },
  Earth: { ruined: "#1d1f22", restored: "#2a2420", roughness: 1, aged: true },
  // Metals stay mostly diffuse: there's no environment map to reflect, so full metal reads black.
  Metal: { ruined: "#5f6253", restored: "#B86A3C", roughness: 0.45, metalness: 0.4 },
  Metal_Light: { ruined: "#666a5b", restored: "#c98454", roughness: 0.45, metalness: 0.4 },
  Brass: { ruined: "#62644f", restored: "#D4A548", roughness: 0.4, metalness: 0.45 },
  Copper: { ruined: "#5a5c4e", restored: "#B86A3C", roughness: 0.45, metalness: 0.4, verdigris: true },
  DarkMetal: { ruined: "#34363a", restored: "#3e3530", roughness: 0.55, metalness: 0.35 },
  // Riveted iron plating, frames and gear discs: dark grey in both states (the brass on it carries
  // the warmth).
  Iron: { ruined: "#3f4247", restored: "#4d4a48", roughness: 0.6, metalness: 0.3 },
  Wood: { ruined: "#55504A", restored: "#6B4226", roughness: 0.7 },
  DarkWood: { ruined: "#45413c", restored: "#4e301c", roughness: 0.7 },
  Walnut: { ruined: "#55504A", restored: "#6B4226", roughness: 0.65 },
  Enamel: { ruined: "#7c7a72", restored: "#e6dcc4", roughness: 0.3 },
  LampGlass: { ruined: "#3a3934", restored: "#F5A04A", glow: 1.5, ember: 0.04 },
};

// Region 3, the Lantern Town: its swatches live with the town (town/palette.ts, agent D).
const REGION_3: Record<string, Swatch> = TOWN_SWATCHES;

// Region 4, the Cathedral of Crossings: sandstone vaults, polished brass, stained glass in jewel
// tones (kept away from cyan). Brief: cold grey stone, dark brass and dull dark glass in ruin.
const REGION_4: Record<string, Swatch> = {
  Floor: { ruined: "#55575E", restored: "#a8957a", roughness: 0.85, aged: true },
  Main: { ruined: "#5c5e64", restored: "#C2A57E", roughness: 0.95, aged: true },
  Main2: { ruined: "#585a60", restored: "#b89c78", roughness: 0.95, aged: true },
  Stone: { ruined: "#5e6066", restored: "#c6aa84", roughness: 0.95, aged: true },
  Highlights: { ruined: "#64666c", restored: "#cdb38e", roughness: 0.95, aged: true },
  Sandstone: { ruined: "#5c5e64", restored: "#C2A57E", roughness: 0.95, aged: true },
  // Code-made walls beside the kit's (the crossing halls' doorway bays): laid in the same courses as
  // the kit's trim sheet, as dark as its stone reads, so a doorway bay is wall, not a flat panel.
  // Ruined, it read a quarter of the kit brick's brightness beside it (measured in the moonlit
  // pictures, 2026-11-11): lifted to read just under the brick, as it does restored.
  Ashlar: { ruined: "#73757c", restored: "#8f7b60", roughness: 0.95, aged: true, coursed: [0.2, 0.42] },
  Leaf_Texture: { ruined: "#505259", restored: "#b69a74", roughness: 0.95, aged: true },
  Green: { ruined: "#505259", restored: "#b69a74", roughness: 0.95, aged: true },
  Earth: { ruined: "#1f2128", restored: "#2e261e", roughness: 1, aged: true },
  Brass: { ruined: "#5E4A2A", restored: "#C99B4A", roughness: 0.35, metalness: 0.8 },
  Metal: { ruined: "#5E4A2A", restored: "#C99B4A", roughness: 0.4, metalness: 0.8 },
  GlassRuby: { ruined: "#2a2024", restored: "#A3263A", glow: 1.0, ember: 0.05 },
  GlassSapphire: { ruined: "#1e2230", restored: "#2C5DA8", glow: 1.1, ember: 0.05 },
  GlassGold: { ruined: "#2e2a20", restored: "#E0B040", glow: 0.6, ember: 0.05 },
  // Old bell metal (the chapels' fallen bell and censer): mostly matte, so it reads without reflections.
  Bronze: { ruined: "#4d463b", restored: "#9a7646", roughness: 0.55, metalness: 0.15, verdigris: true },
  Lead: { ruined: "#1a1b1e", restored: "#2a2622", roughness: 0.6, metalness: 0.5 },
  Void: { ruined: "#030304", restored: "#030304", roughness: 1 },
};

const OVERRIDES: Record<RegionId, Record<string, Swatch>> = { 1: {}, 2: REGION_2, 3: REGION_3, 4: REGION_4 };

// Every name exists in every region (Region 1's values unless the region overrides them), so code-made
// pieces can name a region's materials anywhere.
const ALL_NAMES = new Set([
  ...Object.keys(REGION_1),
  ...Object.keys(REGION_2),
  ...Object.keys(REGION_3),
  ...Object.keys(REGION_4),
]);
function swatchFor(name: string, region: RegionId): Swatch | undefined {
  if (!ALL_NAMES.has(name)) return undefined;
  return OVERRIDES[region][name] ?? REGION_1[name] ?? REGION_2[name] ?? REGION_3[name] ?? REGION_4[name];
}

const cache = new Map<string, Material>();
const bakedCache = new Map<string, Material>();

// `baked`: the geometry carries an `ageing` attribute (bake.ts), so stone reads it instead of
// computing noise per pixel. Used for merged static rooms; standalone meshes use the live version.
// `lightmaps`: the room has light baked in Blender (world/bake): it replaces the vertex moonlight and
// darkens the ambient fill with contact occlusion.
function nodeMaterial(swatch: Swatch, region: RegionId, baked = false, lightmaps: Lightmaps | null = null): Material {
  const look = LOOKS[region];
  const m = new MeshStandardNodeMaterial();
  const restoredness = float(1).sub(ruin);
  const mossColour = mix(color(look.moss.restored), color(look.moss.ruined), ruin);
  let tint = mix(color(swatch.restored), color(swatch.ruined), ruin).mul(mix(float(1), float(0.72), ruin));
  if (swatch.aged && baked) {
    const ageing = attribute("ageing", "vec2");
    tint = tint.mul(ageing.x);
    tint = mix(tint, mossColour, ageing.y.mul(look.moss.amount));
  } else if (swatch.aged) {
    // Large blotches and fine speckle break up the flat colour.
    const blotch = mx_noise_float(positionWorld.mul(0.9));
    const speckle = mx_noise_float(positionWorld.mul(7.0));
    tint = tint.mul(blotch.mul(0.18).add(speckle.mul(0.06)).add(0.92));
    // Grime gathers in the bottom metre of every wall.
    tint = tint.mul(mix(float(0.7), float(1), smoothstep(0.0, 1.3, positionWorld.y)));
    // Moss creeps over faces that look up, and up from the floor, in patches.
    const patches = smoothstep(0.1, 0.45, mx_noise_float(positionWorld.mul(0.55).add(3.1)));
    const upward = smoothstep(0.55, 0.9, normalWorld.y);
    const low = float(1).sub(smoothstep(0.2, 1.4, positionWorld.y));
    const moss = patches.mul(upward.add(low).clamp(0, 1)).mul(0.85 * look.moss.amount);
    tint = mix(tint, mossColour, moss);
  }
  if (swatch.coursed) {
    // Courses and staggered joints on a wall's face (its plane read from the normal: a back wall
    // along x, a left wall along z), each block a shade of its own; mortar lines darker.
    const [h, w] = swatch.coursed;
    const sideways = step(normalWorld.z.abs(), normalWorld.x.abs());
    const along = mix(positionWorld.x, positionWorld.z, sideways);
    const row = positionWorld.y.div(h);
    const col = along.div(w).add(row.floor().mul(0.5));
    const joint = smoothstep(0.0, 0.06, row.fract())
      .mul(smoothstep(1.0, 0.94, row.fract()))
      .mul(smoothstep(0.0, 0.03, col.fract()))
      .mul(smoothstep(1.0, 0.97, col.fract()));
    const shade = mx_noise_float(vec3(col.floor().mul(1.7), row.floor().mul(2.3), 0.5))
      .mul(0.16)
      .add(0.97);
    tint = tint.mul(mix(float(0.55), shade, joint));
  }
  if (swatch.patchy) {
    // Moss and ivy in patches: soft-edged clumps with the stone showing between, and a fine mottle
    // inside each clump, so no face reads as one flat green.
    const stone = swatchFor(swatch.patchy, region);
    const stoneTint = stone ? mix(color(stone.restored), color(stone.ruined), ruin).mul(0.82) : tint.mul(0.6);
    const clump = smoothstep(-0.05, 0.3, mx_noise_float(positionWorld.mul(2.3).add(5.7)));
    const mottle = mx_noise_float(positionWorld.mul(9.0)).mul(0.22).add(0.86);
    tint = mix(stoneTint, tint.mul(mottle), clump);
  }
  if (swatch.leafy) {
    // Clipped leaves: dark gaps where the hedge is deep, a scatter of paler tips on top of them.
    const gaps = smoothstep(-0.35, 0.25, mx_noise_float(positionWorld.mul(17)));
    const tips = smoothstep(0.32, 0.62, mx_noise_float(positionWorld.mul(38).add(3.1)));
    tint = tint.mul(mix(float(0.42), float(1.05), gaps)).mul(tips.mul(0.5).add(1));
  }
  if (swatch.verdigris) {
    // Centuries of damp: patina gathers in patches across old brass.
    const patina = smoothstep(0.05, 0.4, mx_noise_float(positionWorld.mul(2.6).add(7.3))).mul(0.7);
    tint = mix(tint, mix(color(PATINA_RESTORED), color(PATINA_RUINED), ruin), patina);
  }
  m.colorNode = tint;
  m.roughness = swatch.roughness ?? 0.9;
  m.metalness = swatch.metalness ?? 0;
  if (swatch.glow) {
    // Out (a faint ember at most) in ruin, lit when restored: steady, never flickering.
    m.emissiveNode = color(swatch.restored).mul(restoredness.mul(swatch.glow).add(swatch.ember ?? 0.15));
  } else if (lightmaps) {
    // Baked in Blender: the moon's soft shadows, lamp pools and bounce, ruined and restored (world/bake).
    const { light, ao } = bakedLightNodes(lightmaps);
    m.emissiveNode = tint.mul(light);
    m.aoNode = ao;
  } else if (baked) {
    // Baked light from outside (bake.ts): cold and strong in ruin, softer when restored. Added as light.
    const moonColour = mix(color(look.moon.restored), color(look.moon.ruined), ruin);
    const strength = mix(float(look.moon.strengthRestored), float(look.moon.strengthRuined), ruin);
    m.emissiveNode = tint.mul(moonColour).mul(attribute("moon", "float")).mul(strength);
  }
  return m;
}

function materialFor(original: Material, region: RegionId): Material {
  return swatchFor(original.name, region) ? regionMaterial(original.name, region) : original;
}

// A region material by name, for our own meshes (stand-ins, props) to match the kit.
export function regionMaterial(name: string, region: RegionId = 1): Material {
  const swatch = swatchFor(name, region);
  if (!swatch) throw new Error(`No swatch called ${name}`);
  const key = `${region}:${name}`;
  let shared = cache.get(key);
  if (!shared) {
    shared = nodeMaterial(swatch, region);
    shared.name = name;
    cache.set(key, shared);
  }
  return shared;
}

// The same, for a merged static room whose geometry carries the baked `ageing` and `moon` attributes.
// With `lightmaps`, the room's own copy reads them instead (one set per baked layout).
export function bakedRegionMaterial(
  name: string,
  region: RegionId = 1,
  lightmaps: Lightmaps | null = null,
): Material | undefined {
  const swatch = swatchFor(name, region);
  if (!swatch) return undefined;
  const key = lightmaps ? `${region}:${name}:${lightmaps.id}` : `${region}:${name}`;
  let shared = bakedCache.get(key);
  if (!shared) {
    shared = nodeMaterial(swatch, region, true, lightmaps);
    shared.name = name;
    bakedCache.set(key, shared);
  }
  return shared;
}

/** A region material of its own (not shared), for meshes that move their vertices (gears). */
export function ownRegionMaterial(name: string, region: RegionId = 1): MeshStandardNodeMaterial {
  const swatch = swatchFor(name, region);
  if (!swatch) throw new Error(`No swatch called ${name}`);
  return nodeMaterial(swatch, region) as MeshStandardNodeMaterial;
}

/** A swatch's colours and glow, for the lightmap exporter (tools/bake): what the light bounces off. */
export function swatchColours(
  name: string,
  region: RegionId = 1,
): { ruined: string; restored: string; glow?: number; ember?: number } | undefined {
  const s = swatchFor(name, region);
  return s && { ruined: s.ruined, restored: s.restored, glow: s.glow, ember: s.ember };
}

/** Whether a swatch needs the baked `ageing` attribute. */
export function isAged(name: string, region: RegionId = 1): boolean {
  return !!swatchFor(name, region)?.aged;
}

export function restyle(root: Object3D, region: RegionId = 1): Object3D {
  root.traverse((child) => {
    if (!(child instanceof Mesh)) return;
    child.material = Array.isArray(child.material)
      ? child.material.map((m) => materialFor(m, region))
      : materialFor(child.material, region);
  });
  return root;
}

// For lights and fog, which follow the same dial on the CPU.
export function blend(out: Color, ruined: Color, restored: Color, ruinLevel: number): Color {
  return out.lerpColors(restored, ruined, ruinLevel);
}
