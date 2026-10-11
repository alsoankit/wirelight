import { type Color, type Material, Mesh, type Object3D } from "three";
import { color, float, mix, mx_noise_float, normalWorld, positionWorld, smoothstep } from "three/tsl";
import { MeshStandardNodeMaterial } from "three/webgpu";
import { ruin } from "../ruin";

// Restyles a kit piece in its region's palette (world/art-briefs/region-1-overgrown-halls.md).
// Every kit material with the same name shares one node material, whose colour blends from the
// ruined palette to the restored one with the ruin dial. Materials not listed keep their own look.
//
// The kit's flat colours read as clean tiles, so stone gets age in the shader: blotchy weathering,
// grime that gathers low on walls, and moss creeping over upward faces and the bottoms of walls.

type Swatch = {
  ruined: string;
  restored: string;
  roughness?: number;
  metalness?: number;
  glow?: number; // flames: emissive strength when restored (they gutter in ruin)
  aged?: boolean; // stone: weathering, grime and creeping moss
  verdigris?: boolean; // old brass: green-grey patina in patches
};

const MOSS_RUINED = "#4b584c";
const MOSS_RESTORED = "#4f7a3c";
const PATINA_RUINED = "#43564f";
const PATINA_RESTORED = "#5a7d68";

const REGION_1: Record<string, Swatch> = {
  Main: { ruined: "#6b7380", restored: "#a28a6c", roughness: 0.95, aged: true },
  Main2: { ruined: "#666d78", restored: "#957e62", roughness: 0.95, aged: true },
  Stone: { ruined: "#6d7480", restored: "#a8916f", roughness: 0.95, aged: true },
  Highlights: { ruined: "#747c88", restored: "#ae9473", roughness: 0.95, aged: true },
  Black: { ruined: "#16181d", restored: "#221a14", roughness: 1 },
  Leaf_Texture: { ruined: "#46524a", restored: "#5d8f48", roughness: 1 },
  Texture_Leaves: { ruined: "#3f4a42", restored: "#3E6B3A", roughness: 1 },
  Green: { ruined: "#4a554b", restored: "#6FA85A", roughness: 1 },
  Bark: { ruined: "#3d3833", restored: "#5c4330", roughness: 1 },
  Dirt: { ruined: "#2f2c29", restored: "#4a3a2a", roughness: 1 },
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
  // Flames are kept modest so restored rooms glow warmly without glare (0051).
  Light: { ruined: "#3a3530", restored: "#FFC46B", glow: 2.2 },
  Fire: { ruined: "#3a3028", restored: "#FFB35A", glow: 2.6 },
};

const cache = new Map<string, Material>();

function nodeMaterial(swatch: Swatch): Material {
  const m = new MeshStandardNodeMaterial();
  const restoredness = float(1).sub(ruin);
  let tint = mix(color(swatch.restored), color(swatch.ruined), ruin);
  if (swatch.aged) {
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
    const moss = patches.mul(upward.add(low).clamp(0, 1)).mul(0.85);
    tint = mix(tint, mix(color(MOSS_RESTORED), color(MOSS_RUINED), ruin), moss);
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
    // A low ember in ruin, a bright flame when restored.
    m.emissiveNode = color(swatch.restored).mul(restoredness.mul(swatch.glow).add(0.15));
  }
  return m;
}

function materialFor(original: Material): Material {
  return REGION_1[original.name] ? regionMaterial(original.name) : original;
}

// A region material by kit name, for our own meshes (stand-ins, props) to match the kit.
export function regionMaterial(name: string): Material {
  const swatch = REGION_1[name];
  if (!swatch) throw new Error(`No Region 1 swatch called ${name}`);
  let shared = cache.get(name);
  if (!shared) {
    shared = nodeMaterial(swatch);
    shared.name = name;
    cache.set(name, shared);
  }
  return shared;
}

export function restyle(root: Object3D): Object3D {
  root.traverse((child) => {
    if (!(child instanceof Mesh)) return;
    child.material = Array.isArray(child.material) ? child.material.map(materialFor) : materialFor(child.material);
    child.castShadow = true;
    child.receiveShadow = true;
  });
  return root;
}

// For lights and fog, which follow the same dial on the CPU.
export function blend(out: Color, ruined: Color, restored: Color, ruinLevel: number): Color {
  return out.lerpColors(restored, ruined, ruinLevel);
}
