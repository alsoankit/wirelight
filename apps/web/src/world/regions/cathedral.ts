import { type BufferGeometry, ExtrudeGeometry } from "three";
import { FLOORS, makeEarth, makeFlagstones } from "../kit/floor";
import type { Extra, Placement } from "../kit/StaticRoom";
import {
  addTo,
  ball,
  box,
  doorFrame,
  extras,
  lancetShape,
  onWall,
  placed,
  prep,
  rod,
  type V3,
  wallWithDoor,
} from "../kit/shapes";
import type { Beams, Glow, Wall } from "../room/layout";

// Region 4, the Cathedral of Crossings (world/art-briefs/region-4-cathedral-of-crossings.md): vaulted
// sandstone, tall pointed arches, stained glass in jewel tones (kept away from cyan), polished brass.
// Stand-ins until the region's own kit: the Ruins kit's gothic arches and walls recoloured, and pieces
// made in code (lancet windows with leaded glass, pointed doorways with moulded frames, string
// courses, a broken winged statue). Ruin: cold grey stone, dark glass, grey-blue shafts. Restored:
// warm sandstone, the windows lit, golden and coloured light falling across the floor.
// A left world (0052): no candles burning; the light is the glass.

const QUARTER = Math.PI / 2;
const GOLD = "#F2CF8A";

type Bag = Record<string, BufferGeometry[]>;

// Coloured light falls in from the back left, down across the floor.
const SHAFT: V3 = [0.55, -0.85, 0.55];
// Jewel-tinted shafts (ruby, sapphire, gold; kept away from cyan), strong enough to colour the floor.
const SHAFT_TINTS = [GOLD, "#E0707E", "#7E9CE6"];

function floor(seed: number): Extra[] {
  return [
    { name: "Floor", geometry: makeFlagstones({ size: 8.4, seed, ...FLOORS[4] }) },
    { name: "Earth", geometry: makeEarth(8.4) },
  ];
}

/**
 * A tall lancet window on a wall: a moulded sandstone frame, leaded glass in three bands (ruby low,
 * sapphire, a gold head), its light, and a shaft of coloured light falling into the room.
 */
function stainedWindow(
  bag: Bag,
  glows: Glow[],
  beams: Beams["list"],
  wall: Wall,
  along: number,
  sill = 1.5,
  width = 0.8,
  height = 2.2,
) {
  const head = height - 0.95; // where the gold head begins
  addTo(bag, "GlassRuby", onWall(box([width, 0.6, 0.02], [0, 0.3, 0]), wall, along, sill, 0.03));
  addTo(
    bag,
    "GlassSapphire",
    onWall(box([width, head - 0.6, 0.02], [0, 0.6 + (head - 0.6) / 2, 0]), wall, along, sill, 0.03),
  );
  const top = prep(new ExtrudeGeometry(lancetShape(width, height - head), { depth: 0.02, bevelEnabled: false }));
  addTo(bag, "GlassGold", onWall(top.translate(0, head, 0), wall, along, sill, 0.02));
  // Lead: a mullion and the bars between the bands.
  addTo(bag, "Lead", onWall(box([0.035, height - 0.25, 0.03], [0, (height - 0.25) / 2, 0]), wall, along, sill, 0.05));
  for (const y of [0.6, head, 0.3, (0.6 + head) / 2])
    addTo(bag, "Lead", onWall(box([width, 0.03, 0.03], [0, y, 0]), wall, along, sill, 0.05));
  addTo(bag, "Stone", onWall(doorFrame(width, height, 0.12, 0.12, true), wall, along, sill, 0));
  addTo(bag, "Stone", onWall(box([width + 0.4, 0.1, 0.22], [0, -0.05, 0.08]), wall, along, sill, 0));
  const inside = (out: number, y: number): V3 => (wall === "back" ? [along, y, -4 + out] : [-4 + out, y, along]);
  glows.push({ position: inside(0.9, sill + height * 0.55), colour: GOLD, strength: 2.0 });
  // Each window's shaft takes a tint from its glass: gold, rose, pale sapphire in turn.
  const tint = SHAFT_TINTS[beams.length % SHAFT_TINTS.length];
  beams.push({ from: inside(0.15, sill + height * 0.5), width: width * 0.9, depth: 0.5, colour: tint });
}

/** A string course (a moulded band) along a wall at height y. */
function course(bag: Bag, wall: Wall, from: number, to: number, y: number, depth = 0.12) {
  addTo(bag, "Highlights", onWall(box([to - from, 0.14, depth], [0, 0, depth / 2]), wall, (from + to) / 2, y, 0));
}

/**
 * A winged statue of the stone warden's kin (region-4 brief): a tall robed figure on a plinth, its
 * hood bowed, two great wings folded behind it rising above its head, and a faint light in its eyes
 * (the glass material: an ember in ruin, warm gold restored). Never a doll: no face, no arms.
 */
function wardenStatue(bag: Bag, at: V3, turn: number) {
  const [x, y, z] = at;
  const r = (g: BufferGeometry) => g.rotateY(turn).translate(x, y, z);
  addTo(bag, "Stone", r(box([0.8, 0.5, 0.7], [0, 0.25, 0])));
  addTo(bag, "Highlights", r(box([0.9, 0.08, 0.8], [0, 0.52, 0])));
  // The robe, falling in a long taper, and the bowed, hooded head.
  addTo(bag, "Stone", r(rod([0, 0.56, 0], [0, 1.75, 0], 0.3, 10, 0.17)));
  addTo(bag, "Stone", r(placed(ball([0, 0, 0], 1, 10), [0, 1.9, 0.04], [0.25, 0, 0], [0.16, 0.2, 0.17])));
  // The wings: long folded feathers of stone, tips rising above the head, spreading a little.
  for (const side of [-1, 1]) {
    addTo(
      bag,
      "Stone",
      r(placed(ball([0, 0, 0], 1, 10), [side * 0.24, 1.55, -0.2], [0.1, side * 0.3, side * -0.18], [0.07, 0.95, 0.3])),
    );
    addTo(
      bag,
      "Highlights",
      r(placed(ball([0, 0, 0], 1, 8), [side * 0.32, 1.25, -0.24], [0.08, side * 0.35, side * -0.3], [0.05, 0.6, 0.22])),
    );
  }
  // A faint light in its eyes.
  for (const side of [-1, 1]) addTo(bag, "GlassGold", r(ball([side * 0.055, 1.88, 0.18], 0.018, 6)));
}

// ---------------------------------------------------------------------------------------------------
// The Observatory: a side chapel of the Cathedral.

export function cathedralObservatoryPieces(secondDoor: boolean): Placement[] {
  const left: Placement[] = secondDoor
    ? [{ piece: "Wall_ArchGothic", position: [-4, 0, 2], rotationY: QUARTER }]
    : [
        { piece: "Wall", position: [-4, 0, 1], rotationY: QUARTER },
        { piece: "Wall_Double_Broken", position: [-4, 0, 3], rotationY: QUARTER },
      ];
  return [
    { piece: "Wall", position: [-3, 0, -4] },
    { piece: "Wall", position: [-3, 2, -4] },
    { piece: "Wall_ArchGothic", position: [0, 0, -4] },
    { piece: "Wall", position: [3, 0, -4] },
    { piece: "Wall_Broken", position: [3, 2, -4] },
    { piece: "Wall", position: [-4, 0, -3], rotationY: QUARTER },
    { piece: "Wall", position: [-4, 2, -3], rotationY: QUARTER },
    { piece: "Wall", position: [-4, 0, -1], rotationY: QUARTER },
    { piece: "Wall_Broken", position: [-4, 2, -1], rotationY: QUARTER },
    ...left,
    { piece: "Column_Round", position: [-4, 0, -4] },
    { piece: "Column_Round_Short", position: [4, 0, -4] },
    { piece: "Bricks", position: [-3.2, 0, 3.4], rotationY: 2.1 },
    { piece: "Brick", position: [1.9, 0, 2.2], rotationY: 0.7 },
    { piece: "Brick", position: [1.75, 0, 2.55], rotationY: 2.0 }, // weighs down the Knight's letter
  ];
}

export function cathedralObservatory(secondDoor: boolean) {
  const bag: Bag = {};
  const glows: Glow[] = [];
  const list: Beams["list"] = [];
  stainedWindow(bag, glows, list, "back", -3.0, 1.4);
  stainedWindow(bag, glows, list, "left", -2.0, 1.4);
  course(bag, "back", -3.95, -2.0, 1.0);
  course(bag, "left", -3.95, secondDoor ? -0.05 : 2.0, 1.0);
  wardenStatue(bag, [3.0, 0, -2.9], -0.5);
  return {
    placements: cathedralObservatoryPieces(secondDoor),
    extras: [...floor(1103), ...extras(bag)],
    glows,
    beams: { list, direction: SHAFT, colour: GOLD, ruined: 0.1, restored: 0.7, pools: true },
  };
}

// ---------------------------------------------------------------------------------------------------
// Another computer's room: a small chapel-like study.

export const CATHEDRAL_HOUSE_PIECES: Placement[] = [
  { piece: "Wall_ArchGothic", position: [0, 0, -4] },
  { piece: "Wall", position: [-3, 0, -4] },
  { piece: "Wall", position: [-3, 2, -4] },
  { piece: "Wall", position: [3, 0, -4] },
  { piece: "Wall", position: [-4, 0, -3], rotationY: QUARTER },
  { piece: "Wall", position: [-4, 2, -3], rotationY: QUARTER },
  { piece: "Wall", position: [-4, 0, -1], rotationY: QUARTER },
  { piece: "Wall_Broken", position: [-4, 2, -1], rotationY: QUARTER },
  { piece: "Wall_Half", position: [-4, 0, 1], rotationY: QUARTER },
  { piece: "Wall_Double_Broken", position: [-4, 0, 3], rotationY: QUARTER },
  { piece: "Column_Round", position: [-4, 0, -4] },
  { piece: "Column_Round_Short", position: [4, 0, -4] },
  { piece: "Bricks", position: [2.9, 0, 1.9], rotationY: 0.9 },
  { piece: "Brick", position: [-1.6, 0, 2.6], rotationY: 0.4 },
];

export function cathedralHouse() {
  const bag: Bag = {};
  const glows: Glow[] = [];
  const list: Beams["list"] = [];
  stainedWindow(bag, glows, list, "left", -2.0, 1.4);
  course(bag, "back", -3.95, -2.0, 1.0);
  course(bag, "left", -3.95, 0.5, 1.0);
  return {
    placements: CATHEDRAL_HOUSE_PIECES,
    extras: [...floor(2207), ...extras(bag)],
    glows,
    beams: { list, direction: SHAFT, colour: GOLD, ruined: 0.1, restored: 0.7, pools: true },
  };
}

// ---------------------------------------------------------------------------------------------------
// A crossing hall (a router): a great pointed door for every town it joins, tall windows between.

export const CATHEDRAL_HALL_PIECES: Placement[] = [
  { piece: "Column_Round", position: [-4, 0, -4] },
  { piece: "Column_Round_Short", position: [4, 0, -4] },
  { piece: "Column_Round_Short", position: [-4, 0, 4] },
  { piece: "Bricks", position: [2.9, 0, 2.6], rotationY: 0.8 },
];

export function cathedralHall(used: { wall: Wall; at: number }[]) {
  const bag: Bag = {};
  const glows: Glow[] = [];
  const list: Beams["list"] = [];
  const height = 4.2;
  let windows = 0;
  for (const wall of ["back", "left"] as const) {
    for (const at of [-3, -1, 1, 3]) {
      const door = used.some((s) => s.wall === wall && s.at === at);
      if (door) {
        addTo(bag, "Sandstone", onWall(wallWithDoor(2, height, 0.35, 1.8, 2.9, true), wall, at, 0));
        addTo(bag, "Stone", onWall(doorFrame(1.8, 2.9, 0.16, 0.14, true), wall, at, 0));
        // The dark beyond the doorway, in the arch's own shape.
        const dark = prep(new ExtrudeGeometry(lancetShape(1.8, 2.9), { depth: 0.02, bevelEnabled: false }));
        addTo(bag, "Void", onWall(dark, wall, at, 0, -0.3));
      } else {
        addTo(bag, "Sandstone", onWall(box([2, height, 0.35], [0, height / 2, -0.175]), wall, at, 0));
        if (windows < 2 && at !== 3) {
          stainedWindow(bag, glows, list, wall, at, 1.3, 0.8, 2.3);
          windows++;
        } else {
          // A blind arch: the frame of a window that was never glazed.
          addTo(bag, "Stone", onWall(doorFrame(0.8, 2.1, 0.1, 0.08, true), wall, at, 1.3));
        }
      }
    }
    course(bag, wall, -4, 4, height - 0.07, 0.2);
  }
  return {
    extras: [...floor(3301), ...extras(bag)],
    glows,
    beams: { list, direction: SHAFT, colour: GOLD, ruined: 0.1, restored: 0.7, pools: true },
  };
}
