import { Html } from "@react-three/drei";
import { fill, town } from "@wirelight/content";
import { useMemo } from "react";
import type { BufferGeometry } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { regionMaterial } from "../kit/regionMaterials";
import { addTo, ball, box, rod } from "../kit/shapes";
import type { RegionId } from "../region";

// What makes one house's room its own (playtest, Region 4 #24: vesper, lumen, wren and halo looked
// identical): a name plaque by its door, a rug in its own colour, and one of a few sets of things
// its owner left behind, chosen from its name so the same house always looks the same. Made in
// code, in the region's own wood; muted colours only (cyan, amber and violet mean something).

const RUGS = ["#6a3a33", "#3e5848", "#4a4462", "#73653a", "#3c5262", "#6b4a5a", "#5a5a40"];
const WOOD: Record<RegionId, string> = { 1: "Wood", 2: "Walnut", 3: "Timber", 4: "DarkWood" };

/** A small, stable number from a name. */
function hash(name: string): number {
  let h = 2166136261;
  for (const c of name) h = Math.imul(h ^ (c.codePointAt(0) ?? 0), 16777619);
  // Mix the bits so names that differ by a letter or two land far apart.
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}

type Bag = Record<string, BufferGeometry[]>;

/**
 * One of four sets of left-behind things, on the right-hand side of the room: clear of the door, the
 * keeper, the boards (ledger front left, routes front right) and the region's own pots.
 */
function leftBehind(bag: Bag, wood: string, kind: number) {
  const [cx, cz] = [2.85, -1.5];
  if (kind === 0) {
    // A table with a jug on it, and a stool.
    for (const [dx, dz] of [
      [-0.5, -0.4],
      [0.5, -0.4],
      [-0.5, 0.4],
      [0.5, 0.4],
    ] as const)
      addTo(bag, wood, box([0.08, 0.72, 0.08], [cx + dx, 0.36, cz + dz]));
    addTo(bag, wood, box([1.2, 0.07, 1.0], [cx, 0.75, cz]));
    addTo(bag, wood, rod([cx - 1.0, 0, cz + 0.7], [cx - 1.0, 0.45, cz + 0.7], 0.2, 8));
    addTo(bag, "Pot_Main", rod([cx - 0.15, 0.79, cz + 0.1], [cx - 0.15, 1.0, cz + 0.1], 0.07, 8, 0.05));
  } else if (kind === 1) {
    // A cupboard, jars on top.
    addTo(bag, wood, box([0.6, 1.3, 1.1], [cx + 0.3, 0.65, cz]));
    addTo(bag, wood, box([0.04, 1.1, 0.02], [cx, 0.65, cz]));
    for (const [dz, h] of [
      [-0.35, 0.22],
      [-0.05, 0.16],
      [0.3, 0.26],
    ] as const)
      addTo(bag, "Pot_Main", rod([cx + 0.3, 1.3, cz + dz], [cx + 0.3, 1.3 + h, cz + dz], 0.08, 8, 0.06));
  } else if (kind === 2) {
    // Crates and a sack, stacked.
    addTo(bag, wood, box([0.6, 0.6, 0.6], [cx, 0.3, cz - 0.3], [0, 0.3, 0]));
    addTo(bag, wood, box([0.5, 0.5, 0.5], [cx + 0.1, 0.85, cz - 0.25], [0, -0.2, 0]));
    addTo(bag, wood, box([0.55, 0.45, 0.55], [cx - 0.3, 0.225, cz + 0.6], [0, 0.6, 0]));
    addTo(bag, "Cloth", rod([cx + 0.4, 0, cz + 0.7], [cx + 0.4, 0.5, cz + 0.7], 0.22, 8, 0.12));
  } else {
    // A low bench with a folded blanket, and a bucket.
    addTo(bag, wood, box([0.45, 0.08, 1.6], [cx, 0.45, cz]));
    for (const dz of [-0.65, 0.65]) addTo(bag, wood, box([0.4, 0.45, 0.08], [cx, 0.22, cz + dz]));
    addTo(bag, "Cloth", box([0.4, 0.1, 0.5], [cx, 0.54, cz + 0.3]));
    addTo(bag, wood, rod([cx - 0.7, 0, cz + 0.9], [cx - 0.7, 0.35, cz + 0.9], 0.16, 10, 0.19));
  }
}

/** A second, smaller thing by the back wall, right of the door: so two houses rarely match. */
function byTheDoor(bag: Bag, wood: string, kind: number) {
  const [x, z] = [1.65, -3.4];
  if (kind === 0) addTo(bag, wood, rod([x, 0, z], [x, 0.8, z], 0.3, 12, 0.27));
  else if (kind === 1) {
    addTo(bag, "Pot_Main", rod([x, 0, z], [x, 0.45, z], 0.18, 10, 0.24));
    addTo(bag, "Texture_Leaves", ball([x, 0.75, z], 0.32, 10));
  } else if (kind === 2) {
    for (let i = 0; i < 4; i++)
      addTo(
        bag,
        i % 2 ? "Cloth" : "Parchment",
        box([0.5 - i * 0.05, 0.1, 0.36], [x, 0.05 + i * 0.1, z], [0, i * 0.3, 0]),
      );
  } else addTo(bag, "Cloth", box([0.6, 1.1, 0.03], [x, 1.85, -3.86]));
}

export function HouseTraits({ device, region }: { device: string; region: RegionId }) {
  const h = hash(device);
  const rug = RUGS[h % RUGS.length] as string;
  const parts = useMemo(() => {
    const bag: Bag = {};
    leftBehind(bag, WOOD[region], (h >>> 4) % 4);
    byTheDoor(bag, WOOD[region], (h >>> 12) % 4);
    return Object.entries(bag).flatMap(([name, list]) => {
      const geometry = list.length === 1 ? list[0] : mergeGeometries(list);
      return geometry ? [{ name, geometry }] : [];
    });
  }, [h, region]);
  // The rug, turned a little differently in each house.
  const turn = (((h >>> 8) % 7) - 3) * 0.06;
  return (
    <>
      <mesh position={[0.4, 0.06, 1.3]} rotation={[-Math.PI / 2, 0, turn]}>
        <planeGeometry args={[2.2, 1.4]} />
        <meshStandardMaterial color={rug} roughness={1} />
      </mesh>
      <mesh position={[0.4, 0.062, 1.3]} rotation={[-Math.PI / 2, 0, turn]}>
        <ringGeometry args={[0.5, 0.56, 24]} />
        <meshStandardMaterial color="#b9a888" roughness={1} transparent opacity={0.35} />
      </mesh>
      {parts.map((p) => (
        <mesh key={p.name} geometry={p.geometry} material={regionMaterial(p.name, region)} />
      ))}
      {/* Its name by the door. */}
      <Html center position={[-1.55, 2.35, -3.85]} zIndexRange={[5, 0]}>
        <span className="house-plaque">{fill(town.plaque, { name: device })}</span>
      </Html>
    </>
  );
}
