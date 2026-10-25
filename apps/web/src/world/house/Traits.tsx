import { Html } from "@react-three/drei";
import { fill, town } from "@wirelight/content";
import { useMemo } from "react";
import type { BufferGeometry } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { regionMaterial } from "../kit/regionMaterials";
import { addTo, ball, box, gearGeometry, ring, rod, type V3 } from "../kit/shapes";
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

/**
 * The Sorting Works' version (region-2 brief, 0052): what the sorters left in a workshop bay is
 * machinery and its parts, never furniture: a crate of spare gears, a floor press, pipe on trestles, a
 * copper boiler; by the door a toolbox, a coil of pipe, a stack of blank ledgers or a fallen gear.
 */
function worksLeftBehind(bag: Bag, kind: number) {
  const [cx, cz] = [2.85, -1.5];
  if (kind === 0) {
    // A crate of spare gears, one fallen out beside it.
    addTo(bag, "Walnut", box([0.75, 0.5, 0.6], [cx, 0.25, cz], [0, 0.25, 0]));
    for (const [dx, r, a] of [
      [-0.15, 0.3, 0.2],
      [0.12, 0.22, -0.3],
    ] as const)
      addTo(
        bag,
        "Brass",
        gearGeometry(r, Math.round(r * 30), 0.05, r > 0.25 ? 5 : 0)
          .rotateZ(a)
          .rotateY(0.25 + 1.3)
          .translate(cx + dx * 0.3, 0.48, cz + dx),
      );
    addTo(
      bag,
      "Brass",
      gearGeometry(0.26, 8, 0.05, 4)
        .rotateX(-Math.PI / 2)
        .translate(cx - 0.75, 0.03, cz + 0.55),
    );
  } else if (kind === 1) {
    // A floor press: an iron bed and frame, its screw, a brass handwheel; blank tiles on the bed.
    addTo(bag, "Iron", box([0.8, 0.5, 0.6], [cx, 0.25, cz]));
    for (const dz of [-0.24, 0.24]) addTo(bag, "Iron", box([0.1, 1.1, 0.1], [cx, 1.0, cz + dz]));
    addTo(bag, "Iron", box([0.16, 0.14, 0.62], [cx, 1.55, cz]));
    addTo(bag, "DarkMetal", rod([cx, 0.75, cz], [cx, 1.8, cz], 0.03, 8));
    addTo(bag, "Iron", box([0.22, 0.08, 0.22], [cx, 0.8, cz]));
    addTo(bag, "Brass", ring([cx, 1.8, cz], 0.26, 0.022, "y", 20));
    addTo(bag, "Brass", box([0.52, 0.025, 0.025], [cx, 1.8, cz]), box([0.025, 0.025, 0.52], [cx, 1.8, cz]));
    for (const dz of [-0.12, 0.02, 0.16]) addTo(bag, "Brass", box([0.12, 0.02, 0.09], [cx + 0.25, 0.51, cz + dz]));
  } else if (kind === 2) {
    // Lengths of copper pipe across two iron trestles, a spare handwheel on the floor.
    for (const dz of [-0.6, 0.6]) {
      addTo(bag, "Iron", box([0.6, 0.06, 0.06], [cx, 0.62, cz + dz]));
      for (const dx of [-0.25, 0.25])
        addTo(bag, "Iron", box([0.05, 0.64, 0.05], [cx + dx, 0.31, cz + dz], [0, 0, dx > 0 ? -0.25 : 0.25]));
    }
    for (const dx of [-0.16, 0, 0.16])
      addTo(bag, "Copper", rod([cx + dx, 0.71, cz - 0.95], [cx + dx, 0.71, cz + 0.95], 0.05, 10));
    addTo(bag, "Brass", ring([cx - 0.7, 0.03, cz + 0.8], 0.15, 0.02, "y", 16));
  } else {
    // A copper boiler on iron feet, brass bands round it and a gauge on its side.
    for (const [dx, dz] of [
      [-0.22, -0.22],
      [0.22, -0.22],
      [-0.22, 0.22],
      [0.22, 0.22],
    ] as const)
      addTo(bag, "Iron", box([0.07, 0.2, 0.07], [cx + dx, 0.1, cz + dz]));
    addTo(bag, "Copper", rod([cx, 0.2, cz], [cx, 1.3, cz], 0.36, 16));
    addTo(bag, "Copper", ball([cx, 1.3, cz], 0.36, 16));
    for (const y of [0.35, 0.8, 1.22]) addTo(bag, "Brass", ring([cx, y, cz], 0.365, 0.02, "y", 20));
    addTo(bag, "Brass", ring([cx + 0.38, 0.95, cz + 0.08], 0.09, 0.015, "x", 14));
    addTo(bag, "Enamel", rod([cx + 0.36, 0.95, cz + 0.08], [cx + 0.39, 0.95, cz + 0.08], 0.08, 14));
  }
}

function worksByTheDoor(bag: Bag, kind: number) {
  const [x, z] = [1.65, -3.4];
  if (kind === 0) {
    // An iron toolbox with a brass handle.
    addTo(bag, "Iron", box([0.6, 0.3, 0.3], [x, 0.15, z], [0, 0.2, 0]));
    addTo(bag, "Brass", box([0.36, 0.03, 0.03], [x, 0.38, z], [0, 0.2, 0]));
    for (const d of [-0.17, 0.17])
      addTo(bag, "Brass", box([0.03, 0.09, 0.03], [x + d * Math.cos(0.2), 0.33, z - d * Math.sin(0.2)]));
  } else if (kind === 1) {
    // A coil of copper pipe, lying where it was dropped.
    for (let k = 0; k < 3; k++) addTo(bag, "Copper", ring([x, 0.04 + k * 0.07, z], 0.32 - k * 0.015, 0.035, "y", 20));
  } else if (kind === 2) {
    // A stack of blank ledgers.
    for (let i = 0; i < 4; i++)
      addTo(
        bag,
        i % 2 ? "Walnut" : "Parchment",
        box([0.5 - i * 0.05, 0.1, 0.36], [x, 0.05 + i * 0.1, z], [0, i * 0.3, 0]),
      );
  } else {
    // A great gear leaning on the wall, fallen from a train.
    addTo(bag, "Brass", gearGeometry(0.45, 14, 0.06, 5).rotateX(-0.18).translate(x, 0.45, -3.82));
  }
}

/**
 * The Lantern Town's version (region-3 brief, 0052): what the townsfolk left is the town's own work,
 * never a home's furniture: the post's sack and spilled letters, the lamplighter's ladder and spare
 * lantern frames, crates and a sack, or a fallen shutter and broken roof tiles; by the door a ladder
 * against the wall, ledgers, an empty lantern frame or a bundle of letters.
 */
function lettersAt(bag: Bag, x: number, z: number, n: number, seed: number) {
  for (let i = 0; i < n; i++) {
    const a = seed * 1.7 + i * 2.39;
    const r = 0.18 + ((i * 37 + seed * 11) % 7) * 0.06;
    addTo(
      bag,
      "Parchment",
      box([0.22, 0.008, 0.13], [x + Math.cos(a) * r, 0.006 + i * 0.002, z + Math.sin(a) * r], [0, a * 1.3, 0]),
    );
  }
}

/** A wooden ladder: two rails and rungs, from `foot` to `top`. */
function ladder(bag: Bag, foot: V3, top: V3, width = 0.42) {
  const [fx, fy, fz] = foot;
  const [tx, ty, tz] = top;
  const along: V3 = [tx - fx, ty - fy, tz - fz];
  const length = Math.hypot(...along);
  // Sideways: horizontal, across the ladder.
  const side: V3 = [-along[2], 0, along[0]];
  const sl = Math.hypot(...side) || 1;
  const w: V3 = [(side[0] / sl) * (width / 2), 0, (side[2] / sl) * (width / 2)];
  for (const k of [-1, 1])
    addTo(bag, "Timber", rod([fx + k * w[0], fy, fz + k * w[2]], [tx + k * w[0], ty, tz + k * w[2]], 0.025, 6));
  const rungs = Math.floor(length / 0.3);
  for (let i = 1; i < rungs; i++) {
    const t = i / rungs;
    const c: V3 = [fx + along[0] * t, fy + along[1] * t, fz + along[2] * t];
    addTo(bag, "Timber", rod([c[0] - w[0], c[1], c[2] - w[2]], [c[0] + w[0], c[1], c[2] + w[2]], 0.017, 5));
  }
}

/** An empty lantern frame (its glass long gone), standing or on its side. */
function lanternFrame(bag: Bag, at: V3, onSide = false) {
  const [x, y, z] = at;
  const h = 0.3;
  const w = 0.2;
  const parts: BufferGeometry[] = [];
  for (const [dx, dz] of [
    [-w / 2, -w / 2],
    [w / 2, -w / 2],
    [-w / 2, w / 2],
    [w / 2, w / 2],
  ] as const)
    parts.push(box([0.025, h, 0.025], [dx, h / 2, dz]));
  parts.push(box([w + 0.05, 0.03, w + 0.05], [0, 0.015, 0]), box([w + 0.03, 0.025, w + 0.03], [0, h, 0]));
  parts.push(rod([0, h, 0], [0, h + 0.13, 0], 0.15, 4, 0.02));
  for (const g of parts) {
    if (onSide) g.rotateZ(Math.PI / 2).translate(0.03, w / 2 + 0.02, 0);
    g.rotateY(0.5).translate(x, y, z);
  }
  addTo(bag, "Iron", ...parts);
}

function townLeftBehind(bag: Bag, kind: number) {
  const [cx, cz] = [2.85, -1.5];
  if (kind === 0) {
    // The post's sack, slumped, its letters spilled across the boards.
    addTo(bag, "Cloth", rod([cx, 0, cz], [cx, 0.42, cz], 0.26, 10, 0.16));
    addTo(bag, "Cloth", rod([cx, 0.42, cz], [cx + 0.05, 0.55, cz - 0.03], 0.09, 8, 0.05));
    lettersAt(bag, cx - 0.55, cz + 0.35, 7, 3);
  } else if (kind === 1) {
    // The lamplighter's things: a ladder laid along the floor, two spare lantern frames.
    ladder(bag, [cx + 0.2, 0.03, cz - 1.1], [cx - 0.1, 0.03, cz + 1.1]);
    lanternFrame(bag, [cx - 0.75, 0, cz - 0.4]);
    lanternFrame(bag, [cx - 0.55, 0, cz + 0.45], true);
  } else if (kind === 2) {
    // Crates and a sack, stacked.
    addTo(bag, "Timber", box([0.6, 0.6, 0.6], [cx, 0.3, cz - 0.3], [0, 0.3, 0]));
    addTo(bag, "Timber", box([0.5, 0.5, 0.5], [cx + 0.1, 0.85, cz - 0.25], [0, -0.2, 0]));
    addTo(bag, "Timber", box([0.55, 0.45, 0.55], [cx - 0.3, 0.225, cz + 0.6], [0, 0.6, 0]));
    addTo(bag, "Cloth", rod([cx + 0.4, 0, cz + 0.7], [cx + 0.4, 0.5, cz + 0.7], 0.22, 8, 0.12));
  } else {
    // A shutter fallen from its window, and broken roof tiles.
    for (let i = 0; i < 4; i++)
      addTo(bag, "Timber", box([0.15, 0.04, 1.1], [cx - 0.24 + i * 0.16, 0.03, cz], [0, 0.35, 0]));
    addTo(bag, "Timber", box([0.66, 0.05, 0.07], [cx, 0.07, cz - 0.3], [0, 0.35, 0]));
    addTo(bag, "Timber", box([0.66, 0.05, 0.07], [cx + 0.0, 0.07, cz + 0.3], [0, 0.35, 0]));
    for (const [dx, dz, a] of [
      [-0.8, 0.6, 0.4],
      [-0.6, 0.85, 1.9],
      [-0.95, 0.2, 2.8],
    ] as const)
      addTo(
        bag,
        "Roof",
        rod([cx + dx, 0.04, cz + dz], [cx + dx + Math.cos(a) * 0.3, 0.04, cz + dz + Math.sin(a) * 0.3], 0.06, 6),
      );
  }
}

function townByTheDoor(bag: Bag, kind: number) {
  const [x, z] = [1.65, -3.4];
  if (kind === 0) ladder(bag, [x + 0.05, 0, z + 0.45], [x - 0.05, 2.3, -3.86]);
  else if (kind === 1) {
    // A stack of ledgers.
    for (let i = 0; i < 4; i++)
      addTo(
        bag,
        i % 2 ? "Cloth" : "Parchment",
        box([0.5 - i * 0.05, 0.1, 0.36], [x, 0.05 + i * 0.1, z], [0, i * 0.3, 0]),
      );
  } else if (kind === 2) lanternFrame(bag, [x, 0, z + 0.1]);
  else {
    // A bundle of letters, tied, and a few loose.
    for (let i = 0; i < 5; i++)
      addTo(bag, "Parchment", box([0.24, 0.025, 0.15], [x, 0.015 + i * 0.027, z], [0, i * 0.08, 0]));
    addTo(bag, "Cloth", box([0.03, 0.15, 0.17], [x, 0.07, z]));
    lettersAt(bag, x - 0.3, z + 0.35, 3, 5);
  }
}

/**
 * The Cathedral's version (region-4 brief, 0052): what the builders left in a chapel is the work of
 * the cathedral, never a home's furniture: a mason's half-dressed block with mallet and chisels, a
 * bell fallen from its frame, a rack of rolled charts (the crossings' maps), or broken window tracery
 * with its lead; by the door a box of unlit candles, a censer on its chain, a stack of hymnals, or
 * a fallen pinnacle stone. Stone, bronze and parchment only: no glowing glass on the floor.
 */
function cathedralLeftBehind(bag: Bag, kind: number) {
  const [cx, cz] = [2.85, -1.5];
  if (kind === 0) {
    // A block of sandstone, half dressed, on two timbers; a mallet and two chisels; chips round it.
    for (const dz of [-0.35, 0.35]) addTo(bag, "DarkWood", box([0.9, 0.12, 0.14], [cx, 0.06, cz + dz], [0, 0.2, 0]));
    addTo(bag, "Sandstone", box([0.8, 0.55, 0.65], [cx, 0.4, cz], [0, 0.2, 0]));
    addTo(bag, "Highlights", box([0.5, 0.18, 0.4], [cx - 0.05, 0.76, cz + 0.05], [0, 0.35, 0]));
    addTo(bag, "DarkWood", rod([cx - 0.75, 0.05, cz + 0.55], [cx - 0.45, 0.05, cz + 0.85], 0.025, 6));
    addTo(bag, "DarkWood", box([0.14, 0.12, 0.2], [cx - 0.78, 0.06, cz + 0.5], [0, -0.8, 0]));
    for (const [dx, dz, a] of [
      [-0.6, 0.15, 0.4],
      [-0.55, 0.3, 0.9],
    ] as const)
      addTo(
        bag,
        "Iron",
        rod([cx + dx, 0.015, cz + dz], [cx + dx + Math.cos(a) * 0.22, 0.015, cz + dz + Math.sin(a) * 0.22], 0.012, 5),
      );
    for (let i = 0; i < 6; i++) {
      const a = i * 1.9;
      addTo(
        bag,
        "Sandstone",
        box([0.07, 0.04, 0.06], [cx + Math.cos(a) * 0.62, 0.02, cz + Math.sin(a) * 0.5], [0, a, 0]),
      );
    }
  } else if (kind === 1) {
    // A bell fallen from its frame, lying on its side; the broken timber yoke beside it.
    const bell = rod([0, 0, 0], [0, 0.7, 0], 0.42, 18, 0.2);
    addTo(
      bag,
      "Bronze",
      bell
        .rotateZ(Math.PI / 2 - 0.12)
        .rotateY(0.6)
        .translate(cx + 0.1, 0.4, cz),
    );
    addTo(
      bag,
      "Bronze",
      ring([0, 0, 0], 0.43, 0.03, "y", 20)
        .rotateZ(Math.PI / 2 - 0.12)
        .rotateY(0.6)
        .translate(cx - 0.18, 0.42, cz - 0.2),
    );
    addTo(bag, "DarkWood", box([0.18, 0.18, 1.3], [cx - 0.7, 0.09, cz + 0.4], [0, 0.4, 0]));
    addTo(bag, "DarkWood", box([0.14, 0.14, 0.6], [cx - 0.5, 0.07, cz - 0.7], [0, -0.9, 0]));
  } else if (kind === 2) {
    // A rack of rolled charts (the crossings' maps), one unrolled on the floor under two stones.
    for (const dx of [-0.35, 0.35]) addTo(bag, "DarkWood", box([0.06, 1.1, 0.5], [cx + dx, 0.55, cz - 0.6]));
    for (const y of [0.35, 0.7, 1.05]) addTo(bag, "DarkWood", box([0.76, 0.04, 0.5], [cx, y, cz - 0.6]));
    for (const [y, n] of [
      [0.42, 4],
      [0.77, 3],
    ] as const)
      for (let i = 0; i < n; i++)
        addTo(
          bag,
          "Parchment",
          rod([cx - 0.28 + i * 0.16, y, cz - 0.82], [cx - 0.28 + i * 0.16, y, cz - 0.38], 0.05, 8),
        );
    addTo(bag, "Parchment", box([0.7, 0.008, 0.5], [cx - 0.35, 0.006, cz + 0.55], [0, 0.25, 0]));
    for (const [dx, dz] of [
      [-0.65, 0.4],
      [-0.05, 0.7],
    ] as const)
      addTo(bag, "Sandstone", box([0.12, 0.08, 0.1], [cx + dx, 0.05, cz + dz], [0, dx * 3, 0]));
  } else {
    // Broken window tracery fallen in from a window, its lead came twisted beside it.
    const arc = (r: number, a0: number, a1: number, at: V3, turn: number) => {
      const out: BufferGeometry[] = [];
      for (let k = 0; k < 6; k++) {
        const t0 = a0 + ((a1 - a0) * k) / 6;
        const t1 = a0 + ((a1 - a0) * (k + 1)) / 6;
        out.push(rod([Math.cos(t0) * r, 0.05, Math.sin(t0) * r], [Math.cos(t1) * r, 0.05, Math.sin(t1) * r], 0.05, 6));
      }
      for (const g of out) g.rotateY(turn).translate(...at);
      return out;
    };
    addTo(bag, "Highlights", ...arc(0.45, 0, Math.PI, [cx, 0, cz], 0.4));
    addTo(bag, "Highlights", ...arc(0.3, 0.3, Math.PI * 0.9, [cx - 0.5, 0, cz + 0.6], 1.9));
    addTo(bag, "Highlights", box([0.12, 0.1, 0.7], [cx + 0.3, 0.05, cz + 0.5], [0, 0.7, 0]));
    for (let i = 0; i < 4; i++)
      addTo(bag, "Lead", box([0.5, 0.015, 0.015], [cx - 0.6, 0.01, cz - 0.3 - i * 0.12], [0, i * 0.4, 0]));
  }
}

function cathedralByTheDoor(bag: Bag, kind: number) {
  const [x, z] = [1.65, -3.4];
  if (kind === 0) {
    // A box of unlit candles.
    addTo(bag, "DarkWood", box([0.55, 0.2, 0.35], [x, 0.1, z], [0, 0.2, 0]));
    for (let i = 0; i < 6; i++)
      addTo(
        bag,
        "Candle",
        rod(
          [x - 0.2 + (i % 3) * 0.2, 0.2, z - 0.08 + Math.floor(i / 3) * 0.16],
          [x - 0.2 + (i % 3) * 0.2, 0.24, z - 0.08 + Math.floor(i / 3) * 0.16],
          0.035,
          8,
        ),
      );
  } else if (kind === 1) {
    // A censer on its chain, lying where it was set down.
    addTo(bag, "Bronze", ball([x, 0.12, z + 0.1], 0.12, 12));
    addTo(bag, "Bronze", rod([x, 0.2, z + 0.1], [x, 0.3, z + 0.1], 0.06, 10, 0.02));
    for (let i = 0; i < 6; i++)
      addTo(bag, "Iron", ball([x - 0.1 - i * 0.07, 0.015, z + 0.15 + Math.sin(i) * 0.05], 0.02, 5));
  } else if (kind === 2) {
    // A stack of hymnals.
    for (let i = 0; i < 4; i++)
      addTo(
        bag,
        i % 2 ? "DarkWood" : "Parchment",
        box([0.4 - i * 0.04, 0.09, 0.3], [x, 0.045 + i * 0.09, z], [0, i * 0.3, 0]),
      );
  } else {
    // A pinnacle stone fallen from the parapet.
    addTo(bag, "Sandstone", box([0.35, 0.35, 0.35], [x, 0.175, z], [0, 0.5, 0]));
    addTo(bag, "Highlights", rod([x, 0.35, z], [x, 0.85, z], 0.2, 4, 0.01).rotateY(0.5));
  }
}

export function HouseTraits({ device, region }: { device: string; region: RegionId }) {
  const h = hash(device);
  const rug = RUGS[h % RUGS.length] as string;
  const parts = useMemo(() => {
    const bag: Bag = {};
    if (region === 2) {
      worksLeftBehind(bag, (h >>> 4) % 4);
      worksByTheDoor(bag, (h >>> 12) % 4);
    } else if (region === 3) {
      townLeftBehind(bag, (h >>> 4) % 4);
      townByTheDoor(bag, (h >>> 12) % 4);
    } else if (region === 4) {
      cathedralLeftBehind(bag, (h >>> 4) % 4);
      cathedralByTheDoor(bag, (h >>> 12) % 4);
    } else {
      leftBehind(bag, WOOD[region], (h >>> 4) % 4);
      byTheDoor(bag, WOOD[region], (h >>> 12) % 4);
    }
    return Object.entries(bag).flatMap(([name, list]) => {
      const geometry = list.length === 1 ? list[0] : mergeGeometries(list);
      return geometry ? [{ name, geometry }] : [];
    });
  }, [h, region]);
  // The rug, turned a little differently in each house. Not in the Sorting Works: its rooms are
  // machinery, told apart by what machines were left behind (owner, 2026-10-25; 0083). Not in the
  // Lantern Town either: nobody lives in its houses now (0052; 0084), nor the Cathedral's chapels (0086).
  const turn = (((h >>> 8) % 7) - 3) * 0.06;
  return (
    <>
      {region === 1 && (
        <>
          <mesh position={[0.4, 0.06, 1.3]} rotation={[-Math.PI / 2, 0, turn]}>
            <planeGeometry args={[2.2, 1.4]} />
            <meshStandardMaterial color={rug} roughness={1} />
          </mesh>
          <mesh position={[0.4, 0.062, 1.3]} rotation={[-Math.PI / 2, 0, turn]}>
            <ringGeometry args={[0.5, 0.56, 24]} />
            <meshStandardMaterial color="#b9a888" roughness={1} transparent opacity={0.35} />
          </mesh>
        </>
      )}
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
