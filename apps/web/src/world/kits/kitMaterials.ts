import { Color, type Material, type MeshStandardMaterial, type Texture } from "three";
import { attribute, color, dot, float, mix, normalWorld, smoothstep, texture, vec3 } from "three/tsl";
import { MeshStandardNodeMaterial } from "three/webgpu";
import { bakedLightNodes, type Lightmaps } from "../bake/lightmap";
import { regionMaterial } from "../kit/regionMaterials";
import { TO_MOON } from "../moon";
import { LOOKS, type RegionId } from "../region";
import { ruinHere } from "../ruin";
import { THIN_MATERIAL } from "./assembleKit";
import { KITS, type MaterialMaps } from "./catalog";

// The textured kits' materials (KitRoom): the kit's own texture × its vertex colour, on the ruin dial
// at each point (so the restoration wave sweeps them like the rest of the room).
// - Ruined: desaturated, a little darker, cooled toward the region's ruined light; stone and wood
//   gather the region's moss, soot or dust (baked `ageing`, as the Ruins pieces).
// - Restored: the texture's own colour, gently warmed (or × the region's `kitRestored`, region.ts).
// - Glow pieces (`KitPlacement.glow`): lit from inside only when restored, steady (no flicker); a
//   faint ember in ruin. Emission atlases (the Cathedral's windows) light where the atlas says;
//   glass and flames light whole; anything else (a lantern on a trim sheet) lights where its texture
//   is bright.
// - Light from outside: the moon's cold light on faces that look toward it (no shadows: the Ruins
//   pieces get baked shadows, kit pieces only the facing), as the Ruins' baked moon is added.
// One material per (kit material, region, glow, detail) is shared by every room.

/** Kits with no textures of their own, restyled with a region swatch instead (kit/regionMaterials.ts). */
const SWATCHES: Record<string, Record<string, string>> = {
  "region-2/turrets": { Light: "Brass", Dark: "Copper" },
};

/** Kits whose pieces never age (living plants). */
const UNAGED_KITS = new Set(["region-1/nature"]);

const GLOW_WARM = "#FFC46B";
/** How strongly glow pieces light when restored, and what is left in ruin. */
const GLOW_STRENGTH = 1.8;
const GLOW_EMBER = 0.03;
/** The moon on kit pieces, relative to the Ruins' baked moon (unshadowed, so kept lower). */
const MOON_SHARE = 0.45;

// One Texture per file, whichever piece's .glb brought it (each .glb parses its own copy; only the
// first is ever drawn, so the GPU holds each file once).
const textures = new Map<string, Texture>();
function shared(url: string | undefined, found: Texture | null | undefined): Texture | null {
  if (!found) return null;
  if (!url) return found;
  const known = textures.get(url);
  if (known) return known;
  textures.set(url, found);
  return found;
}

export type KitMaterialOptions = {
  region: RegionId;
  glow: boolean;
  /** Normal and roughness maps (Medium and up; Low and Simple draw the colour only). */
  detail: boolean;
  /** The geometry carries `color` (merged pieces); skinned pieces use the material's colour. */
  vertexColour: boolean;
  /** The geometry carries the baked `ageing` attribute (merged pieces). */
  ageing: boolean;
  /** The room's Blender bake, when the geometry carries its `uv1` (bake/lightmap.ts): replaces the moon term. */
  lightmaps?: Lightmaps | null;
};

const cache = new Map<string, Material>();

/** Whether this material ages (stone, wood, metal): not plants, glass, cloth cards or lamps. */
export function ages(kit: string, name: string): boolean {
  return !UNAGED_KITS.has(kit) && !THIN_MATERIAL.test(name) && !SWATCHES[kit]?.[name];
}

export function kitMaterial(kit: string, original: Material, options: KitMaterialOptions): Material {
  const { region, glow, detail, vertexColour } = options;
  const swatch = SWATCHES[kit]?.[original.name];
  if (swatch) return regionMaterial(swatch, region);
  const aged = options.ageing && !glow && ages(kit, original.name);
  const key = `${kit}|${original.name}|${region}|${glow}|${detail}|${vertexColour}|${aged}|${options.lightmaps?.lit.uuid ?? ""}`;
  const known = cache.get(key);
  if (known) return known;

  const source = original as MeshStandardMaterial;
  const maps: MaterialMaps =
    (KITS as Record<string, { materials: Record<string, MaterialMaps> }>)[kit]?.materials[original.name] ?? {};
  const map = shared(maps.baseColor, source.map);
  const look = LOOKS[region];
  const m = new MeshStandardNodeMaterial();
  m.name = `kit:${original.name}`;
  m.side = source.side;

  // Albedo: texture × (vertex colour × material colour, baked into `color` when merged).
  let base = map ? texture(map).rgb : vec3(1, 1, 1);
  base = vertexColour ? base.mul(attribute("color", "vec3")) : base.mul(color(source.color ?? new Color(1, 1, 1)));
  const lum = dot(base, vec3(0.2126, 0.7152, 0.0722));

  // Ruined: grey, darker and cooled toward the region's ruined light (its hue, not its brightness).
  const sky = new Color(look.sky.ruined);
  const skyLum = 0.2126 * sky.r + 0.7152 * sky.g + 0.0722 * sky.b;
  const hue = new Color(sky.r / skyLum, sky.g / skyLum, sky.b / skyLum).lerp(new Color(1, 1, 1), 0.3);
  const ruined = mix(base, vec3(lum, lum, lum).mul(color(hue)), look.kitRuinGrey ?? 0.72).mul(0.8);
  const warmth = look.kitRestored ? new Color(look.kitRestored) : new Color(1.06, 1.0, 0.9);
  let restored = base.mul(vec3(warmth.r, warmth.g, warmth.b));
  const stone = look.kitStone;
  if (stone && stone.material === original.name) {
    // The region's stone colour at the texture's own brightness (its chroma replaced, its courses,
    // joints and wear kept), lifted a little: the Cathedral's trim sheet is red brick and grey
    // ashlar, which read as one orange-brown under warm light; the brief's stone is sandstone.
    const c = new Color(stone.colour);
    const cl = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    const toned = vec3(lum, lum, lum)
      .pow(vec3(stone.gamma ?? 1, stone.gamma ?? 1, stone.gamma ?? 1))
      .mul(vec3(c.r / cl, c.g / cl, c.b / cl));
    // Floors (faces that look up) keep more of their own grey, so the floor and walls part.
    const amount = mix(
      float(stone.amount),
      float(stone.floorAmount ?? stone.amount),
      smoothstep(0.6, 0.9, normalWorld.y),
    );
    restored = mix(restored, toned, amount);
  }
  let tint = mix(restored, ruined, ruinHere);

  if (aged) {
    const ageing = attribute("ageing", "vec2");
    tint = tint.mul(mix(float(1), ageing.x, 0.7));
    const moss = mix(color(look.moss.restored), color(look.moss.ruined), ruinHere).mul(lum.mul(0.8).add(0.75));
    tint = mix(tint, moss, ageing.y.mul(look.moss.amount * 0.6));
  }
  m.colorNode = tint;
  if (source.alphaTest > 0 && map) {
    // Cut-out cards (leaves, ivy): the texture's alpha decides what is drawn.
    m.opacityNode = texture(map).a;
    m.alphaTest = source.alphaTest;
  } else if (source.transparent) {
    // Glass: faint and dull in ruin; a glowing window fills in as it lights.
    const clear = Math.max(source.opacity, 0.3);
    m.transparent = true;
    m.depthWrite = false;
    m.opacityNode = glow ? mix(float(0.9), float(clear), ruinHere) : float(clear);
  }
  m.metalness = 0; // no environment to reflect: metal would read black

  if (detail && source.roughnessMap) {
    m.roughnessMap = shared(maps.metallicRoughness, source.roughnessMap);
    m.roughness = 1;
  } else {
    m.roughness = THIN_MATERIAL.test(original.name) && /glass/i.test(original.name) ? 0.35 : 0.85;
  }
  if (detail && source.normalMap) {
    m.normalMap = shared(maps.normal, source.normalMap);
    m.normalScale.copy(source.normalScale);
  }

  // Light from outside, on faces toward the moon.
  const facing = dot(normalWorld, vec3(TO_MOON.x, TO_MOON.y, TO_MOON.z)).max(0);
  const moonColour = mix(color(look.moon.restored), color(look.moon.ruined), ruinHere);
  const moonStrength = mix(float(look.moon.strengthRestored), float(look.moon.strengthRuined), ruinHere);
  let emissive = tint.mul(moonColour).mul(facing).mul(moonStrength).mul(MOON_SHARE);
  if (options.lightmaps) {
    // Baked in Blender: soft moon shadows, lamp pools and bounce, ruined and restored.
    const { light, ao } = bakedLightNodes(options.lightmaps);
    emissive = tint.mul(light);
    m.aoNode = ao;
  }

  if (glow) {
    const lit = float(1)
      .sub(ruinHere)
      .mul(look.kitGlow ?? GLOW_STRENGTH)
      .add(GLOW_EMBER);
    const emissiveMap = shared(maps.emissive, source.emissiveMap);
    const warmColour = new Color(GLOW_WARM);
    const warm = vec3(warmColour.r, warmColour.g, warmColour.b);
    const light = emissiveMap
      ? texture(emissiveMap).rgb
      : /glass|window|candle|flame|fire|light/i.test(original.name)
        ? warm
        : warm.mul(smoothstep(0.25, 0.7, lum));
    emissive = emissive.add(light.mul(lit));
  }
  m.emissiveNode = emissive;
  cache.set(key, m);
  return m;
}
