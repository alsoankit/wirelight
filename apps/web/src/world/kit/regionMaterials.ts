import { type Color, type Material, Mesh, type Object3D } from "three";
import {
  attribute,
  color,
  float,
  mix,
  mx_noise_float,
  normalWorld,
  positionLocal,
  positionWorld,
  sin,
  smoothstep,
  time,
  vec3,
} from "three/tsl";
import { MeshStandardNodeMaterial } from "three/webgpu";
import { LOOKS, type RegionId } from "../region";
import { ruinHere as ruin } from "../ruin";
import { BREEZE, gust, windDirection } from "../wind";

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
  verdigris?: boolean; // old brass: green-grey patina in patches
  sway?: number; // plants: how far the top bends in a full gust, in metres per metre of height
};

const PATINA_RUINED = "#43564f";
const PATINA_RESTORED = "#5a7d68";

const REGION_1: Record<string, Swatch> = {
  Floor: { ruined: "#666d78", restored: "#988168", roughness: 0.95, aged: true },
  Main: { ruined: "#6b7380", restored: "#a28a6c", roughness: 0.95, aged: true },
  Main2: { ruined: "#666d78", restored: "#957e62", roughness: 0.95, aged: true },
  Stone: { ruined: "#6d7480", restored: "#a8916f", roughness: 0.95, aged: true },
  Highlights: { ruined: "#747c88", restored: "#ae9473", roughness: 0.95, aged: true },
  Black: { ruined: "#16181d", restored: "#221a14", roughness: 1 },
  Leaf_Texture: { ruined: "#46524a", restored: "#5d8f48", roughness: 1 },
  Texture_Leaves: { ruined: "#3f4a42", restored: "#3E6B3A", roughness: 1, sway: 0.06 },
  Green: { ruined: "#4a554b", restored: "#6FA85A", roughness: 1, sway: 0.14 },
  Bark: { ruined: "#3d3833", restored: "#5c4330", roughness: 1 },
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
  Flag: { ruined: "#41454f", restored: "#7a342e", roughness: 0.9 },
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
  Floor: { ruined: "#50555d", restored: "#6a7079", roughness: 0.8, aged: true },
  Main: { ruined: "#6a6c71", restored: "#857263", roughness: 0.95, aged: true },
  Main2: { ruined: "#65676c", restored: "#7c6a5c", roughness: 0.95, aged: true },
  Stone: { ruined: "#6c6e73", restored: "#8a7766", roughness: 0.95, aged: true },
  Highlights: { ruined: "#717378", restored: "#917d6b", roughness: 0.95, aged: true },
  Leaf_Texture: { ruined: "#65676c", restored: "#7c6a5c", roughness: 0.95, aged: true },
  Green: { ruined: "#65676c", restored: "#7c6a5c", roughness: 0.95, aged: true },
  Earth: { ruined: "#1d1f22", restored: "#2a2420", roughness: 1, aged: true },
  // Metals stay mostly diffuse: there's no environment map to reflect, so full metal reads black.
  Metal: { ruined: "#5f6253", restored: "#B86A3C", roughness: 0.45, metalness: 0.4 },
  Metal_Light: { ruined: "#666a5b", restored: "#c98454", roughness: 0.45, metalness: 0.4 },
  Brass: { ruined: "#62644f", restored: "#D4A548", roughness: 0.4, metalness: 0.45 },
  Copper: { ruined: "#5a5c4e", restored: "#B86A3C", roughness: 0.45, metalness: 0.4, verdigris: true },
  DarkMetal: { ruined: "#34363a", restored: "#3e3530", roughness: 0.55, metalness: 0.35 },
  Wood: { ruined: "#55504A", restored: "#6B4226", roughness: 0.7 },
  DarkWood: { ruined: "#45413c", restored: "#4e301c", roughness: 0.7 },
  Walnut: { ruined: "#55504A", restored: "#6B4226", roughness: 0.65 },
  Enamel: { ruined: "#7c7a72", restored: "#e6dcc4", roughness: 0.3 },
  LampGlass: { ruined: "#3a3934", restored: "#F5A04A", glow: 1.5, ember: 0.04 },
};

// Region 3, the Lantern Town: pastel plaster houses with terracotta and teal roofs, mossy cobbles,
// lanterns. Brief: grey plaster and slate in ruin, lanterns unlit.
const REGION_3: Record<string, Swatch> = {
  Floor: { ruined: "#55594F", restored: "#6F8F5E", roughness: 0.95, aged: true },
  Cobble: { ruined: "#6a6c68", restored: "#857d6c", roughness: 0.95, aged: true },
  Boards: { ruined: "#68635c", restored: "#8a6646", roughness: 0.85 },
  Main: { ruined: "#7A7670", restored: "#d8c9a8", roughness: 0.95, aged: true },
  Main2: { ruined: "#726e69", restored: "#cdbd9c", roughness: 0.95, aged: true },
  Stone: { ruined: "#77736d", restored: "#d4c4a2", roughness: 0.95, aged: true },
  Highlights: { ruined: "#7d7973", restored: "#d6a98e", roughness: 0.95, aged: true },
  Plaster: { ruined: "#86827b", restored: "#E6D6B6", roughness: 0.95, aged: true },
  PlasterPeach: { ruined: "#7f7a74", restored: "#D9A88E", roughness: 0.95, aged: true },
  Roof: { ruined: "#4C4E55", restored: "#B4644A", roughness: 0.85 },
  RoofTeal: { ruined: "#474950", restored: "#3d7a78", roughness: 0.85 },
  Timber: { ruined: "#3e3b38", restored: "#5a3d28", roughness: 0.85 },
  Iron: { ruined: "#24272c", restored: "#2a2826", roughness: 0.55, metalness: 0.75 },
  Lantern: { ruined: "#34332f", restored: "#FFCB70", glow: 1.7, ember: 0.03 },
  Window: { ruined: "#23252c", restored: "#E8A85A", glow: 0.5, ember: 0.02 },
};

// Region 4, the Cathedral of Crossings: sandstone vaults, polished brass, stained glass in jewel
// tones (kept away from cyan). Brief: cold grey stone, dark brass and dull dark glass in ruin.
const REGION_4: Record<string, Swatch> = {
  Floor: { ruined: "#585a61", restored: "#a08868", roughness: 0.85, aged: true },
  Main: { ruined: "#62646b", restored: "#bb9f7a", roughness: 0.95, aged: true },
  Main2: { ruined: "#5d5f66", restored: "#b09570", roughness: 0.95, aged: true },
  Stone: { ruined: "#65676e", restored: "#bea37c", roughness: 0.95, aged: true },
  Highlights: { ruined: "#696b72", restored: "#c4aa84", roughness: 0.95, aged: true },
  Sandstone: { ruined: "#62646b", restored: "#bb9f7a", roughness: 0.95, aged: true },
  Leaf_Texture: { ruined: "#505259", restored: "#b69a74", roughness: 0.95, aged: true },
  Green: { ruined: "#505259", restored: "#b69a74", roughness: 0.95, aged: true },
  Earth: { ruined: "#1f2128", restored: "#2e261e", roughness: 1, aged: true },
  Brass: { ruined: "#5E4A2A", restored: "#C99B4A", roughness: 0.35, metalness: 0.8 },
  Metal: { ruined: "#5E4A2A", restored: "#C99B4A", roughness: 0.4, metalness: 0.8 },
  GlassRuby: { ruined: "#2a2024", restored: "#A3263A", glow: 1.0, ember: 0.05 },
  GlassSapphire: { ruined: "#1e2230", restored: "#2C5DA8", glow: 1.1, ember: 0.05 },
  GlassGold: { ruined: "#2e2a20", restored: "#E0B040", glow: 0.6, ember: 0.05 },
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
function nodeMaterial(swatch: Swatch, region: RegionId, baked = false): Material {
  const look = LOOKS[region];
  const m = new MeshStandardNodeMaterial();
  const restoredness = float(1).sub(ruin);
  const mossColour = mix(color(look.moss.restored), color(look.moss.ruined), ruin);
  let tint = mix(color(swatch.restored), color(swatch.ruined), ruin);
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
  if (swatch.verdigris) {
    // Centuries of damp: patina gathers in patches across old brass.
    const patina = smoothstep(0.05, 0.4, mx_noise_float(positionWorld.mul(2.6).add(7.3))).mul(0.7);
    tint = mix(tint, mix(color(PATINA_RESTORED), color(PATINA_RUINED), ruin), patina);
  }
  if (swatch.sway) {
    // Plants lean with the wind, more toward their tops, with a slow ripple of their own.
    const height = positionLocal.y.clamp(0, 2);
    const ripple = sin(time.mul(2.1).add(positionLocal.x.mul(3)).add(positionLocal.z.mul(2)))
      .mul(0.4)
      .add(0.6);
    const lean = gust.add(BREEZE).mul(swatch.sway).mul(height).mul(ripple);
    m.positionNode = positionLocal.add(vec3(windDirection.x, 0, windDirection.z).mul(lean));
  }
  m.colorNode = tint;
  m.roughness = swatch.roughness ?? 0.9;
  m.metalness = swatch.metalness ?? 0;
  if (swatch.glow) {
    // Out (a faint ember at most) in ruin, lit when restored: steady, never flickering.
    m.emissiveNode = color(swatch.restored).mul(restoredness.mul(swatch.glow).add(swatch.ember ?? 0.15));
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
export function bakedRegionMaterial(name: string, region: RegionId = 1): Material | undefined {
  const swatch = swatchFor(name, region);
  if (!swatch) return undefined;
  const key = `${region}:${name}`;
  let shared = bakedCache.get(key);
  if (!shared) {
    shared = nodeMaterial(swatch, region, true);
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
