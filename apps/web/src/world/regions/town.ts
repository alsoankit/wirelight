import type { BufferGeometry } from "three";
import { FLOORS, makeEarth, makeFlagstones } from "../kit/floor";
import type { Extra, Placement } from "../kit/StaticRoom";
import { addTo, box, extras, gable, onWall, rod, type V3, wallWithDoor } from "../kit/shapes";
import type { Glow, Wall } from "../room/layout";

// Region 3, the Lantern Town (world/art-briefs/region-3-lantern-town.md): a storybook town asleep
// under lanterns. Stand-ins until the region's own kit: the Ruins kit's walls recoloured as pastel
// plaster, and pieces made in code (timber framing, floorboards, lanterns on brackets and posts,
// house fronts with gable roofs round the square).
// Ruin: grey plaster and slate, lanterns dark, windows black. Restored: cream and peach plaster,
// terracotta and teal roofs, lanterns and windows warm (lit one after another as the wave passes).
// A left world (0052): the houses stand; nobody is home.

const QUARTER = Math.PI / 2;
const LANTERN = "#FFCB70";

type Bag = Record<string, BufferGeometry[]>;

function cobbles(seed: number): Extra[] {
  return [
    { name: "Cobble", geometry: makeFlagstones({ size: 8.4, seed, ...FLOORS[3] }) },
    { name: "Earth", geometry: makeEarth(8.4) },
  ];
}

// Inside a house: long floorboards laid in rows.
function boards(seed: number): Extra[] {
  return [
    {
      name: "Boards",
      geometry: makeFlagstones({
        size: 8.4,
        seed,
        course: [0.19, 0.21],
        slab: [1.6, 2.8],
        long: 0.1,
        chipped: 0.05,
        cracked: 0.02,
        sunk: 0.05,
        missing: 0.012,
        bevel: 0.012,
        gap: 0.012,
      }),
    },
    { name: "Earth", geometry: makeEarth(8.4) },
  ];
}

/** A lantern: iron frame and cap round warm glass. `at` is the lantern's centre. */
function lanternAt(bag: Bag, at: V3, glows: Glow[] | null, strength = 2.6) {
  const [x, y, z] = at;
  addTo(bag, "Lantern", box([0.15, 0.22, 0.15], [x, y, z]));
  for (const [dx, dz] of [
    [-0.085, -0.085],
    [0.085, -0.085],
    [-0.085, 0.085],
    [0.085, 0.085],
  ] as const) {
    addTo(bag, "Iron", box([0.025, 0.26, 0.025], [x + dx, y, z + dz]));
  }
  addTo(bag, "Iron", box([0.22, 0.03, 0.22], [x, y - 0.13, z]));
  addTo(bag, "Iron", rod([x, y + 0.13, z], [x, y + 0.25, z], 0.15, 4, 0.02));
  if (glows) glows.push({ position: [x, y, z], colour: LANTERN, strength });
}

/** A lantern on an iron bracket out from a wall. */
function wallLantern(bag: Bag, glows: Glow[], wall: Wall, along: number, y: number, strength?: number) {
  const out = 0.42;
  addTo(bag, "Iron", onWall(box([0.04, 0.04, out], [0, 0.42, out / 2]), wall, along, y, 0));
  addTo(bag, "Iron", onWall(rod([0, 0.1, 0.02], [0, 0.42, out * 0.7], 0.015, 4), wall, along, y, 0));
  addTo(bag, "Iron", onWall(box([0.02, 0.12, 0.02], [0, 0.34, out]), wall, along, y, 0));
  const p: V3 = wall === "back" ? [along, y + 0.16, -4 + out] : [-4 + out, y + 0.16, along];
  lanternAt(bag, p, glows, strength);
}

/** A lamp post in the street. */
function lampPost(bag: Bag, glows: Glow[], x: number, z: number) {
  addTo(bag, "Iron", rod([x, 0, z], [x, 2.25, z], 0.05, 8, 0.035));
  addTo(bag, "Iron", box([0.2, 0.12, 0.2], [x, 0.06, z]));
  addTo(bag, "Iron", box([0.3, 0.03, 0.03], [x, 2.25, z]));
  lanternAt(bag, [x, 2.42, z], glows, 2.4);
}

/** Timber framing on a wall between `from` and `to`: posts, a sill, a top beam and a brace or two. */
function timbers(bag: Bag, wall: Wall, from: number, to: number, top: number, braces = true) {
  const mid = (from + to) / 2;
  const length = to - from;
  addTo(bag, "Timber", onWall(box([length, 0.14, 0.06], [0, top - 0.07, 0.03]), wall, mid, 0));
  addTo(bag, "Timber", onWall(box([length, 0.12, 0.06], [0, 0.9, 0.03]), wall, mid, 0));
  for (let a = from; a <= to + 0.01; a += 2) {
    addTo(bag, "Timber", onWall(box([0.14, top, 0.07], [0, top / 2, 0.035]), wall, Math.min(a, to - 0.07), 0));
  }
  if (braces) {
    // A diagonal brace in each upper panel.
    for (let a = from; a + 2 <= to + 0.01; a += 2) {
      const h = top - 0.9;
      const len = Math.hypot(2, h);
      const angle = Math.atan2(h, 2) * ((Math.round(a) / 2) % 2 === 0 ? 1 : -1);
      addTo(bag, "Timber", onWall(box([len - 0.1, 0.1, 0.05], [0, 0.9 + h / 2, 0.03], [0, 0, angle]), wall, a + 1, 0));
    }
  }
}

// ---------------------------------------------------------------------------------------------------
// The Observatory and other computers: a small house interior (the Knight's lodging in the town).

export function townObservatoryPieces(secondDoor: boolean): Placement[] {
  const left: Placement[] = secondDoor
    ? [{ piece: "Wall_ArchRound", position: [-4, 0, 2], rotationY: QUARTER }]
    : [
        { piece: "Wall", position: [-4, 0, 1], rotationY: QUARTER },
        { piece: "Wall_Half", position: [-4, 0, 3], rotationY: QUARTER },
      ];
  return [
    { piece: "Wall", position: [-3, 0, -4] },
    { piece: "Wall", position: [-3, 2, -4] },
    { piece: "Wall_ArchRound_Broken", position: [0, 0, -4] },
    { piece: "Wall", position: [3, 0, -4] },
    { piece: "Wall", position: [-4, 0, -3], rotationY: QUARTER },
    { piece: "Window_Open", position: [-4, 2, -3], rotationY: QUARTER },
    { piece: "Wall", position: [-4, 0, -1], rotationY: QUARTER },
    { piece: "Wall_Broken", position: [-4, 2, -1], rotationY: QUARTER },
    ...left,
    { piece: "Column_Square", position: [-4, 0, -4] },
    { piece: "Pot2_Broken", position: [3.1, 0, -3.2], rotationY: 0.6 },
    { piece: "Pot1", position: [-3.3, 0, -2.0] },
    { piece: "Brick", position: [1.9, 0, 2.2], rotationY: 0.7 },
    { piece: "Brick", position: [1.75, 0, 2.55], rotationY: 2.0 }, // weighs down the Knight's letter
    { piece: "Grass", position: [3.0, 0, 1.4] },
  ];
}

export function townObservatory(secondDoor: boolean) {
  const bag: Bag = {};
  const glows: Glow[] = [];
  timbers(bag, "back", -4, -2, 4);
  timbers(bag, "back", 2, 4, 2, false);
  timbers(bag, "left", -4, 0, 2);
  if (!secondDoor) timbers(bag, "left", 0, 2, 2, false);
  wallLantern(bag, glows, "back", -2.7, 1.9);
  wallLantern(bag, glows, "left", -0.9, 1.9);
  // A fallen street sign (blank: names are drawn as on-screen text, never painted).
  addTo(bag, "Timber", box([0.9, 0.3, 0.04], [2.9, 0.06, -1.9], [-QUARTER, 0, 0.5]));
  addTo(bag, "Timber", box([0.06, 1.6, 0.06], [3.25, 0.05, -1.3], [QUARTER, 0, 0.3]));
  return { placements: townObservatoryPieces(secondDoor), extras: [...boards(1103), ...extras(bag)], glows };
}

export const TOWN_HOUSE_PIECES: Placement[] = [
  { piece: "Wall_ArchRound", position: [0, 0, -4] },
  { piece: "Wall", position: [-3, 0, -4] },
  { piece: "Wall", position: [-3, 2, -4] },
  { piece: "Wall", position: [3, 0, -4] },
  { piece: "Wall", position: [-4, 0, -3], rotationY: QUARTER },
  { piece: "Window_Open", position: [-4, 2, -3], rotationY: QUARTER },
  { piece: "Wall", position: [-4, 0, -1], rotationY: QUARTER },
  { piece: "Wall_Half", position: [-4, 0, 1], rotationY: QUARTER },
  { piece: "Wall_Double_Broken", position: [-4, 0, 3], rotationY: QUARTER },
  { piece: "Column_Square", position: [-4, 0, -4] },
  { piece: "Pot3_Broken", position: [2.6, 0, -3.2], rotationY: 2.2 },
  { piece: "Pot1", position: [-3.3, 0, -0.3] },
  { piece: "Grass", position: [3.1, 0, 3.0] },
];

export function townHouse() {
  const bag: Bag = {};
  const glows: Glow[] = [];
  timbers(bag, "back", -4, -2, 4);
  timbers(bag, "back", 2, 4, 2, false);
  timbers(bag, "left", -4, 0, 2);
  wallLantern(bag, glows, "back", 2.8, 1.9);
  wallLantern(bag, glows, "left", -2.0, 1.9, 2.2);
  return { placements: TOWN_HOUSE_PIECES, extras: [...boards(2207), ...extras(bag)], glows };
}

// ---------------------------------------------------------------------------------------------------
// The town square (a switch): every doorway is a house's front door; the other places are house
// fronts with a shuttered window. Gable roofs above, lamp posts in the square, cobbles underfoot.

export function townSquare(used: { wall: Wall; at: number }[]) {
  const bag: Bag = {};
  const glows: Glow[] = [];
  const front = 3.0;
  let k = 0;
  for (const wall of ["back", "left"] as const) {
    for (const at of [-3, -1, 1, 3]) {
      const door = used.some((s) => s.wall === wall && s.at === at);
      const peach = (k + (wall === "left" ? 1 : 0)) % 2 === 1;
      const teal = k % 3 === 1;
      k++;
      const plaster = peach ? "PlasterPeach" : "Plaster";
      // The house front, 2 m wide, with its door (a doorway the corridor runs through) or a window.
      const face = door
        ? wallWithDoor(1.98, front, 0.25, 1.8, 2.45, false)
        : box([1.98, front, 0.25], [0, front / 2, -0.125]);
      addTo(bag, plaster, onWall(face, wall, at, 0));
      // Corner posts and a beam at the eaves.
      for (const x of [-0.93, 0.93])
        addTo(bag, "Timber", onWall(box([0.12, front, 0.08], [x, front / 2, 0.04]), wall, at, 0));
      addTo(bag, "Timber", onWall(box([1.98, 0.12, 0.09], [0, front - 0.06, 0.045]), wall, at, 0));
      if (door) {
        addTo(bag, "Timber", onWall(box([2.0, 0.16, 0.12], [0, 2.53, 0.06]), wall, at, 0));
      } else {
        // A shuttered window: glows warm when the house wakes.
        addTo(bag, "Window", onWall(box([0.56, 0.7, 0.04], [0, 1.55, 0.02]), wall, at, 0));
        addTo(bag, "Timber", onWall(box([0.7, 0.07, 0.1], [0, 1.17, 0.06]), wall, at, 0));
        for (const side of [-1, 1])
          addTo(
            bag,
            "Timber",
            onWall(box([0.3, 0.74, 0.04], [side * 0.48, 1.55, 0.07], [0, side * 0.5, 0]), wall, at, 0),
          );
      }
      // The gable and its roof, running back from the front.
      const { wall: end, roofs } = gable(1.98, 0.85, 1.6);
      addTo(bag, plaster, onWall(end, wall, at, front));
      addTo(bag, teal ? "RoofTeal" : "Roof", ...roofs.map((r) => onWall(r, wall, at, front)));
      // A small round window in the gable.
      addTo(bag, "Window", onWall(box([0.22, 0.22, 0.04], [0, 0.32, 0.02]), wall, at, front));
    }
  }
  // The corner where the two rows of houses meet.
  addTo(bag, "Timber", box([0.3, front + 0.9, 0.3], [-4.1, (front + 0.9) / 2, -4.1]));
  lampPost(bag, glows, 3.3, -1.0);
  lampPost(bag, glows, 3.2, 3.2);
  return { extras: [...cobbles(3301), ...extras(bag)], glows };
}

export const TOWN_SQUARE_PIECES: Placement[] = [
  { piece: "Pot1", position: [2.4, 0, -3.4] },
  { piece: "Pot2_Broken", position: [-3.4, 0, 3.5], rotationY: 0.6 },
  { piece: "Grass", position: [2.2, 0, 1.0] },
  { piece: "Grass", position: [-3.0, 0, -3.2] },
];
