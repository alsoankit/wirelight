import type { BufferGeometry } from "three";
import { type CorridorDressing, corridorFloor } from "../corridor/frame";
import { makeEarth, makeFlagstones } from "../kit/floor";
import type { Extra, Placement } from "../kit/StaticRoom";
import { extras } from "../kit/shapes";
import { carvedPiece } from "../kits/carvedKit";
import type { KitPlacement } from "../kits/placement";
import { MOON_POSITION, MOON_TARGET } from "../moon";
import type { RuneMark } from "../observatory/Runes";
import type { Beams, Glow } from "../room/layout";
import type { StatuePlace } from "../room/standing";
import { hedge } from "./hedge";
import { type RootRun, rootRuns } from "./roots";

// Region 1, the Overgrown Halls (world/art-briefs/region-1-overgrown-halls.md): the first, oldest
// halls of the Deep Network, gentle ruins reclaimed by moss and roots. The shell is Quaternius's
// Ultimate Modular Ruins (`Placement`, restyled in the shader); the overgrowth is the Stylized Nature
// kit (`kitPieces`, region-1/nature: ferns, bushes, mossy rocks, mushrooms, roots), grey and dry in
// ruin, green when restored (kits/kitMaterials.ts).
// A left world (0052): only what the Forgetting left. Broken stone, rubble, roots and moss pushing in
// through the cracks; the light is the moon, the keeper's lantern and the runes. No candles.
//
// Rooms are 8 × 8 m around the origin, seen from the front right (only the back wall at z = −4 and
// the left wall at x = −4 are built). Nothing may stand in front of a gameplay object (plates, boards,
// the desk, the planning table, the keeper) as the game camera sees it.

const QUARTER = Math.PI / 2;

/** A clipped bush, in the hedges' green, not the region's stone. */
const TOPIARY = { tint: { restored: "#3f6a39", ruined: "#464e47" }, moss: 0, detail: 0.5 };

/** Moonlight through the gaps: cold shafts, strongest in ruin, with a soft pool where each meets the floor. */
function moonlight(list: Beams["list"]): Beams {
  return {
    list,
    direction: [
      MOON_TARGET[0] - MOON_POSITION[0],
      MOON_TARGET[1] - MOON_POSITION[1],
      MOON_TARGET[2] - MOON_POSITION[2],
    ],
    colour: "#A3AEC6",
    ruined: 0.3,
    restored: 0.07,
    pools: true,
  };
}

/** A Stylized Nature piece (scaled to the Ruins grid by the catalogue's factor). */
function nature(
  piece: string,
  position: [number, number, number],
  rotationY = 0,
  scale = 1,
  rotation?: [number, number, number],
): KitPlacement {
  return { kit: "region-1/nature", piece, position, rotationY, scale, ...(rotation ? { rotation } : {}) };
}

// ---------------------------------------------------------------------------------------------------
// The Observatory (the player's own machine, every Region 1 room)
// ---------------------------------------------------------------------------------------------------
//
// The doorway is a round arch in the back wall at x = 0, leading to the corridor (−z); on Floor 2 a
// second arch in the left wall at z = 2. Broken stone, a fallen column, rubble, grass in the cracks,
// and an old cloak on its peg.

// Back wall: the overgrown arch is broken at the top; the right end has collapsed to a holed stub.
function backWall(): Placement[] {
  return [
    { piece: "Wall_ArchRound_Overgrown_Broken", position: [0, 0, -4] },
    { piece: "Wall_Overgrown", position: [-3, 0, -4] },
    { piece: "Wall_Broken", position: [-3, 2, -4] },
    { piece: "Wall_Hole", position: [3, 0, -4] },
  ];
}

// Left wall: full height at the back, broken in the middle, a low stub at the front. With a second
// door (Floor 2), its front half is an arch instead (centred at z = 2, clear of the runes).
function leftWall(secondDoor: boolean): Placement[] {
  const back: Placement[] = [
    { piece: "Wall", position: [-4, 0, -3], rotationY: QUARTER },
    { piece: "Window_Bars_Overgrown", position: [-4, 2, -3], rotationY: QUARTER },
    { piece: "Wall_Overgrown", position: [-4, 0, -1], rotationY: QUARTER },
    { piece: "Wall_Broken", position: [-4, 2, -1], rotationY: QUARTER },
  ];
  if (secondDoor) return [...back, { piece: "Wall_ArchRound_Overgrown", position: [-4, 0, 2], rotationY: QUARTER }];
  return [
    ...back,
    { piece: "Wall", position: [-4, 0, 1], rotationY: QUARTER },
    { piece: "Wall_Double_Broken", position: [-4, 0, 3], rotationY: QUARTER },
  ];
}

function pillars(): Placement[] {
  return [
    { piece: "Column_Round", position: [-4, 0, -4] },
    { piece: "Column_Round_Short", position: [4, 0, -4] }, // a broken pillar where the wall fell
    // …and the rest of it, fallen across the floor.
    { piece: "Column_Round_Short", position: [3.1, 0.24, -2.0], rotation: [0, 0.9, QUARTER] },
  ];
}

// Fallen stone and what grows in through the cracks.
function rubble(): Placement[] {
  return [
    { piece: "Bricks", position: [3.0, 0, -3.1], rotationY: 0.4 },
    { piece: "Bricks", position: [-3.2, 0, 3.4], rotationY: 2.1 },
    { piece: "Brick", position: [1.9, 0, 2.2], rotationY: 0.7 },
    { piece: "Brick", position: [-2.6, 0, -0.2], rotationY: 0.3 },
    { piece: "Brick", position: [1.75, 0, 2.55], rotationY: 2.0 }, // weighs down the old letter
  ];
}

// An old statue of the builders' beasts, broken: a stag that has toppled onto its side. (A standing
// fox statue behind the keeper read as the keeper itself, a cat on a plinth: playtest.)
function statues(): Placement[] {
  return [
    { piece: "Bricks", position: [-3.1, 0, -2.6], rotationY: 0.9, scale: 0.8 },
    { piece: "Statue_Stag", position: [-1.0, 0.72, 2.75], rotation: [0, -0.35, Math.PI / 2], scale: 0.45 },
    { piece: "Bricks", position: [-1.9, 0, 2.2], rotationY: 1.4, scale: 0.7 },
  ];
}

// An old cloak, left on its peg (0052).
function cloak(): Placement[] {
  return [{ piece: "Flag_Wall", position: [-3.95, 0.45, 1.3], rotationY: QUARTER }];
}

/** The Observatory's Ruins pieces: with two doors the cloak's wall is an arch, so it isn't there. */
export function hallsObservatoryPieces(secondDoor: boolean): Placement[] {
  return [
    ...backWall(),
    ...leftWall(secondDoor),
    ...pillars(),
    ...rubble(),
    ...statues(),
    ...(secondDoor ? [] : cloak()),
  ];
}

const OBSERVATORY_FLOOR: Extra[] = [
  { name: "Floor", geometry: makeFlagstones({ size: 8.4, seed: 1103 }) },
  { name: "Earth", geometry: makeEarth(8.4) },
];

// The roots (regions/roots.ts), the region's signature: one great root pours in through the barred
// window and down the left wall (clear of its runes) into the back-left corner, a thinner strand
// runs along the wall's foot, two more hang over the broken tops of the walls (high, behind
// nothing), one crawls out of the hole low in the back wall's right end, and with one door one comes
// over the crumbled front of the left wall. None crosses the cable's path, the boards or the keeper.
function observatoryRoots(secondDoor: boolean): BufferGeometry[] {
  const runs: RootRun[] = [
    // The great root: in through the barred window, down the wall, spreading over the corner.
    {
      path: [
        [-4.3, 2.8, -3.05],
        [-3.8, 2.62, -3.1],
        [-3.76, 1.7, -3.2],
        [-3.76, 0.8, -3.3],
        [-3.68, 0.24, -3.42],
        [-3.35, 0.1, -3.58],
        [-2.8, 0.08, -3.72],
        [-2.2, 0.06, -3.78],
      ],
      radius: 0.2,
      strands: 3,
      rootlets: 4,
      seed: 11,
    },
    // A thinner strand from the window, along the left wall's foot toward the front (below the runes).
    {
      path: [
        [-4.25, 2.6, -2.95],
        [-3.86, 2.5, -2.98],
        [-3.87, 1.3, -3.02],
        [-3.84, 0.2, -2.95],
        [-3.8, 0.08, -2.4],
        [-3.74, 0.06, -1.75],
      ],
      radius: 0.09,
      strands: 2,
      rootlets: 2,
      seed: 12,
    },
    // Out of the hole low in the back wall's right end, along the wall's foot.
    {
      path: [
        [3.0, 0.75, -4.45],
        [2.92, 0.52, -3.88],
        [2.72, 0.14, -3.6],
        [2.3, 0.07, -3.45],
        [1.9, 0.05, -3.55],
      ],
      radius: 0.13,
      strands: 2,
      rootlets: 2,
      seed: 13,
    },
    // Over the broken top of the back wall's left end, down the face (behind the boards, high).
    {
      path: [
        [-2.55, 3.35, -4.45],
        [-2.48, 3.25, -3.86],
        [-2.42, 2.8, -3.82],
        [-2.38, 2.3, -3.84],
        [-2.4, 1.95, -3.86],
      ],
      radius: 0.1,
      strands: 2,
      seed: 15,
    },
    // Over the broken top of the left wall's middle, then trained round the top of the builders'
    // emblem (0091) and down its far side, clear of the rune below it.
    {
      path: [
        [-4.45, 3.3, -1.2],
        [-3.86, 3.2, -1.25],
        [-3.84, 2.85, -1.32],
        [-3.87, 2.72, -1.72],
        [-3.87, 2.76, -2.22],
        [-3.87, 2.6, -2.66],
        [-3.87, 2.1, -2.74],
        [-3.87, 1.55, -2.7],
      ],
      radius: 0.075,
      strands: 2,
      rootlets: 2,
      seed: 16,
    },
  ];
  if (!secondDoor)
    runs.push({
      // Over the crumbled front of the left wall, onto the floor where the moon falls.
      path: [
        [-4.4, 0.65, 2.7],
        [-3.85, 0.5, 2.76],
        [-3.55, 0.12, 2.92],
        [-3.0, 0.07, 3.2],
        [-2.4, 0.05, 3.65],
      ],
      radius: 0.15,
      strands: 3,
      rootlets: 3,
      seed: 14,
    });
  return rootRuns(runs);
}

// Moss and growth reclaiming the hall (layers 2 and 4): ferns, mushrooms and a bracket fungus where
// the great root comes down, growth pouring in where the corner collapsed, clover where the
// moonlight pools, loose chips of stone by the rubble. Low along the walls and in the corners, so the boards, the desk, the planning table,
// the keeper and the plates stay clear.
// With two doors, the strip from the second (sealed) arch across the floor stays bare: 2.B's great
// channel and its wall of roots run there (room/BossPiece.tsx).
function observatoryGrowth(secondDoor: boolean): KitPlacement[] {
  const out: KitPlacement[] = [
    // The back-left corner, where the great root comes down: a fern in the damp, a bracket fungus on
    // the root, mushrooms and drifted leaves.
    nature("Fern_1", [-3.4, 0, -3.3], 0.6, 0.75),
    nature("Mushroom_Laetiporus", [-3.15, 0, -3.3], 0.5, 0.42),
    nature("Mushroom_Common", [-2.75, 0, -2.3], 0.9, 1.3),
    nature("Grass_Wispy_Tall", [-2.05, 0, -3.7], 0.3, 0.8),
    // Along the back wall either side of the arch (low: the cable comes in through it).
    nature("Grass_Wispy_Short", [1.25, 0, -3.65], 1.2),
    nature("Clover_1", [-0.95, 0, -3.72], 2.0, 0.8),
    // The collapsed corner: a mossy boulder of fallen masonry, a big plant and tall grass coming in.
    carvedPiece("rock-moss-b", [3.5, -0.12, -3.3], { turn: 2.6, scale: 0.8 }),
    nature("Plant_1_Big", [3.65, 0, -2.75], 0.4, 0.9),
    nature("Grass_Wispy_Tall", [2.55, 0, -3.75], 1.7),
    nature("Grass_Common_Short", [3.35, 0, -2.35], 0.2),
    // Mushrooms in the damp under the fallen column.
    nature("Mushroom_Common", [3.45, 0, -1.45], 2.2, 1.1),
    // Where the barred window's moonlight lands: clover between the stones.
    nature("Clover_2", [-1.75, 0, -0.75], 1.4, 0.5),
    nature("Clover_1", [-2.2, 0, -0.3], 0.3, 0.6),
    // The left wall's foot.
    nature("Grass_Common_Tall", [-3.6, 0, -0.35], 0.5, 0.8),
    // Where the moon falls through the broken left wall: a fern, clover and one wildflower.
    nature("Fern_1", [-2.5, 0, 3.45], 2.2, 0.75),
    nature("Clover_1", [-1.55, 0, 3.6], 0.4, 0.7),
    nature("Flower_3_Single", [-2.95, 0, 3.0], 1.0, 0.7),
    // Grass grown up around the toppled stag.
    nature("Grass_Wispy_Short", [-0.45, 0, 2.4], 0.3, 0.7),
    // The front edges: low tufts and loose stones only.
    nature("Grass_Wispy_Short", [2.75, 0, 1.15], 0.9, 0.9),
    nature("Clover_1", [3.55, 0, 2.55], 2.6, 0.6),
    nature("Pebble_Square_1", [2.2, 0, 2.0], 0.6),
    nature("Pebble_Square_3", [3.25, 0, -2.75], 1.9),
    nature("Pebble_Round_1", [-2.6, 0, -0.05], 0.8),
  ];
  // A fallen block by the rubble at the front of the left wall.
  out.push(carvedPiece("rock-moss-a", [-3.45, -0.08, 3.05], { turn: 1.1, scale: 0.62 }));
  if (!secondDoor) {
    // Under the old cloak.
    out.push(nature("Grass_Wispy_Short", [-3.6, 0, 1.75], 0.4, 0.8));
  }
  return out;
}

// An old tower stands by the outer gate (0088): the gate beyond its collapsed corner, a rune
// stone of the first builders beyond the broken left wall. Both far outside, behind nothing.
const OBSERVATORY_VIEW: StatuePlace[] = [
  { slug: "stone-gate", position: [5.6, 0, -5.7], turn: -0.6, scale: 0.72 },
  { slug: "temple-arch-broken", position: [-6.4, 0, -6.1], turn: 0.3, scale: 0.82 },
  { slug: "rune-monolith", position: [-6.3, 0, -2.2], turn: 0.8, scale: 0.9 },
];

// Where the moon gets in: the barred window, the gap above the crumbled left wall, and the collapsed
// top of the back wall's right end. Only the window's light pools on the floor (the wide gap's pool
// would spill over the floor's edge; the corner's lands outside).
const OBSERVATORY_MOON = moonlight([
  { from: [-4, 3.1, -3], width: 1.3, depth: 0.9 },
  { from: [-4, 2.4, 1.8], width: 2.6, depth: 1.2, pool: false },
  { from: [3, 2.4, -4], width: 1.6, depth: 1.0 },
]);

type HallsRoom = {
  placements: Placement[];
  extras: Extra[];
  kitPieces: KitPlacement[];
  statues?: StatuePlace[];
  beams: Beams;
  runes?: RuneMark[];
  glows?: Glow[];
};

/** Built once per door count (the roots are made in code), so the room's layout keeps its identity. */
const OBSERVATORIES = new Map<boolean, HallsRoom>();

export function hallsObservatory(secondDoor: boolean): HallsRoom {
  let room = OBSERVATORIES.get(secondDoor);
  if (!room) {
    room = {
      placements: hallsObservatoryPieces(secondDoor),
      extras: [...OBSERVATORY_FLOOR, ...extras({ Root: observatoryRoots(secondDoor) })],
      kitPieces: observatoryGrowth(secondDoor),
      statues: OBSERVATORY_VIEW,
      beams: OBSERVATORY_MOON,
    };
    OBSERVATORIES.set(secondDoor, room);
  }
  return room;
}

// ---------------------------------------------------------------------------------------------------
// Another computer's room (lantern; quill's is sealed)
// ---------------------------------------------------------------------------------------------------
//
// A walled garden court of the same builders (0088), one arch in the back wall where the corridor
// comes in: clipped hedges gone shaggy, a topiary in the far corner, a lion's head on the wall where a
// fountain ran, and the next court's ruined arch beyond the fallen corner.

export const HALLS_HOUSE_PIECES: Placement[] = [
  // Back wall: whole now (0111: the door is on the near edge), plain walls either side.
  { piece: "Wall_Overgrown", position: [0, 0, -4] },
  { piece: "Wall", position: [-3, 0, -4] },
  { piece: "Wall_Overgrown", position: [-3, 2, -4] },
  { piece: "Wall_Broken", position: [3, 0, -4] },
  // Left wall: an open window, the rest broken down toward the front.
  { piece: "Wall_Overgrown", position: [-4, 0, -3], rotationY: QUARTER },
  { piece: "Window_Open", position: [-4, 2, -3], rotationY: QUARTER },
  { piece: "Wall", position: [-4, 0, -1], rotationY: QUARTER },
  { piece: "Wall_Half", position: [-4, 0, 1], rotationY: QUARTER },
  { piece: "Wall_Double_Broken", position: [-4, 0, 3], rotationY: QUARTER },
  { piece: "Column_Square", position: [-4, 0, -4] },
  { piece: "Column_Round_Short", position: [4, 0, -4] },
  // What's left (0052: only what the Forgetting left; no lamp, candles, bookcase or whole pots):
  // broken pots, rubble, grass.
  { piece: "Pot2_Broken", position: [-3.1, 0, 0.6], rotationY: 0.6 },
  { piece: "Pot3_Broken", position: [2.6, 0, -3.2], rotationY: 2.2 },
  { piece: "Bricks", position: [2.9, 0, 1.9], rotationY: 0.9 },
  { piece: "Brick", position: [-1.6, 0, 2.6], rotationY: 0.4 },
];

const HOUSE_FLOOR: Extra[] = [
  { name: "Floor", geometry: makeFlagstones({ size: 8.4, seed: 2207 }) },
  { name: "Earth", geometry: makeEarth(8.4) },
];

// The house's roots (regions/roots.ts): one pours in through the open window and down the left wall
// into the back-left corner (stopping short of the lamp-post), one comes over the crumbled front of
// the left wall where the moon falls on it (left of the ledger board), and one hangs over the broken
// top of the back wall's left end.
function houseRoots(): BufferGeometry[] {
  return rootRuns([
    {
      path: [
        [-4.3, 2.75, -2.9],
        [-3.8, 2.56, -2.95],
        [-3.77, 1.6, -3.1],
        [-3.75, 0.6, -3.25],
        [-3.62, 0.15, -3.45],
        [-3.3, 0.08, -3.62],
        [-2.95, 0.06, -3.78],
      ],
      radius: 0.18,
      strands: 3,
      rootlets: 3,
      seed: 21,
    },
    {
      path: [
        [-4.4, 0.8, 3.05],
        [-3.84, 0.58, 3.0],
        [-3.58, 0.14, 3.05],
        [-3.15, 0.07, 3.3],
        [-2.65, 0.05, 3.75],
      ],
      radius: 0.15,
      strands: 3,
      rootlets: 3,
      seed: 22,
    },
    {
      path: [
        [-2.35, 3.45, -4.45],
        [-2.28, 3.32, -3.86],
        [-2.22, 2.85, -3.82],
        [-2.2, 2.4, -3.84],
      ],
      radius: 0.09,
      strands: 2,
      seed: 25,
    },
  ]);
}

// The house's overgrowth: a fern and a bracket fungus where the window's root comes down, growth through the broken back corner, clover where the open window's light lands, leaves
// and a wildflower by the root at the front. Clear of the lamp-post, the shelf, the chest, the
// left-behind things on the right (house/Traits.tsx: around x 2.85, z −1.5), the rug in the middle
// and the keeper.
const HOUSE_GROWTH: KitPlacement[] = [
  nature("Fern_1", [-3.4, 0, -3.25], 0.4, 0.7),
  nature("Mushroom_Laetiporus", [-3.05, 0, -3.4], 0.4, 0.4),
  nature("Mushroom_Common", [-3.35, 0, -1.95], 2.4, 1.2),
  nature("Grass_Wispy_Tall", [1.7, 0, -3.65], 0.6, 0.85),
  nature("Clover_1", [-0.95, 0, -3.7], 1.1, 0.7),
  // The broken back corner: a big leafy plant and tall grass pushing in.
  nature("Grass_Wispy_Tall", [2.75, 0, -2.75], 0.9, 0.8),
  carvedPiece("rock-moss-c", [3.6, -0.06, -2.2], { turn: 0.7, scale: 0.5 }),
  // The open window's light on the floor.
  nature("Clover_2", [-1.75, 0, -0.85], 2.2, 0.5),
  nature("Grass_Wispy_Short", [-2.15, 0, -0.35], 0.8, 0.7),
  // The front edges: low tufts, one wildflower by the root, chips of stone by the rubble.
  nature("Grass_Common_Short", [3.2, 0, 3.0], 0.3),
  nature("Clover_1", [3.5, 0, 1.4], 2.6, 0.6),
  nature("Flower_3_Single", [-2.2, 0, 3.55], 0.5, 0.65),
  nature("Pebble_Square_1", [2.35, 0, 2.3], 1.1),
  nature("Pebble_Round_3", [-1.25, 0, 2.85], 0.4),
];

// Moonlight through the open window, over the crumbled front of the left wall, and over the broken
// back corner (that one lands outside).
const HOUSE_MOON = moonlight([
  { from: [-4, 3.1, -3], width: 1.1, depth: 0.8 },
  { from: [-4, 1.9, 1.6], width: 1.8, depth: 1.0, pool: false },
  { from: [3, 2.2, -4], width: 1.4, depth: 0.9 },
]);

// The house's light (0052): two runes carved into its walls, relit as the room is restored; in ruin
// only the moon through the window and the keeper's lantern.
const HOUSE_RUNES: RuneMark[] = [
  { wall: "back", along: -2.7, y: 2.0 },
  { wall: "left", along: -1.6, y: 1.1, size: 0.15 },
];

// The court's hedges along the walls' feet, clear of the arch, the runes' light and the boards.
function houseHedges(): BufferGeometry[] {
  return [
    hedge([1.5, 0, -3.5], [3.1, 0, -3.5], 0.95, 0.62, 3),
    hedge([-3.5, 0, -2.95], [-3.5, 0, -1.95], 0.85, 0.6, 7),
  ];
}

const HOUSE_VIEW: StatuePlace[] = [
  { slug: "topiary", position: [3.5, 0, -3.45], scale: 0.85, ...TOPIARY },
  { slug: "lion-head", position: [-3.74, 0.85, -0.1], turn: QUARTER, scale: 1.7 },
  { slug: "temple-arch", position: [6.6, 0, -7.2], turn: 0.5, scale: 0.9 },
  { slug: "steps-mossy", position: [-6.1, 0, -5.7], turn: -0.4, scale: 0.8 },
  { slug: "wall-bosigran", position: [-5.2, 0, 1.6], turn: QUARTER, scale: 1.15 },
];

const HOUSE: HallsRoom = {
  placements: HALLS_HOUSE_PIECES,
  extras: [...HOUSE_FLOOR, ...extras({ Root: houseRoots(), Hedge: houseHedges() })],
  kitPieces: HOUSE_GROWTH,
  statues: HOUSE_VIEW,
  beams: HOUSE_MOON,
  runes: HOUSE_RUNES,
  glows: [
    { position: [-2.7, 2.0, -3.5], colour: "#FFD08A", strength: 2.0 },
    { position: [-3.5, 1.2, -1.6], colour: "#FFD08A", strength: 1.8 },
  ],
};

export function hallsHouse(): HallsRoom {
  return HOUSE;
}

// ---------------------------------------------------------------------------------------------------
// A hall (a switch or router's room; no Region 1 room has one, but it is every region's fallback)
// ---------------------------------------------------------------------------------------------------

export const HALLS_HALL_DRESSING: Placement[] = [
  { piece: "Column_Square", position: [-4, 0, -4] },
  { piece: "Column_Round_Short", position: [4, 0, -4] },
  { piece: "Bricks", position: [2.9, 0, 2.6], rotationY: 0.8 },
  { piece: "Brick", position: [0.9, 0, 3.1], rotationY: 0.3 },
  { piece: "Barrel", position: [3.2, 0, -2.9] },
  { piece: "Grass", position: [-3.4, 0, 2.2] },
  { piece: "Grass", position: [2.2, 0, 1.0] },
];

const HALL_FLOOR: Extra[] = [
  { name: "Floor", geometry: makeFlagstones({ size: 8.4, seed: 3301 }) },
  { name: "Earth", geometry: makeEarth(8.4) },
];

/** A hall's dressing around its walls (the walls with their door gaps come from hall/layout.ts). */
export function hallsHall(): { placements: Placement[]; extras: Extra[]; kitPieces: KitPlacement[] } {
  return { placements: HALLS_HALL_DRESSING, extras: HALL_FLOOR, kitPieces: [] };
}

// ---------------------------------------------------------------------------------------------------
// A corridor (0081): a garden walk along the old wall (region-1 brief, 0088). The wall in mossy stone
// with a hole the moon comes through, roots crawling along its foot, hedges gone shaggy, growth in
// the damp; the rune-line down the middle stays clear. Room coordinates: the back wall on z = −4, the tunnel along x from −5 to 5.

/** Where the corridor wall's hole is (the cycle's fourth piece, laid from the left end). */
function holeAt(half: number): number {
  return -half + 1 + 2 * 3;
}

/** Carved runes on the corridor's back wall, clear of the plates, the hole and the roots; each lights its glow. */
function corridorRunes(half: number): RuneMark[] {
  return half > 5
    ? [
        { wall: "back", along: -2.3, y: 1.4 },
        { wall: "back", along: 2.4, y: 1.0, size: 0.16 },
      ]
    : [
        { wall: "back", along: -1.7, y: 1.45 },
        { wall: "back", along: 3.5, y: 1.05, size: 0.16 },
      ];
}

/**
 * The tunnel's roots (regions/roots.ts): one pours over the low wall at the near end and crawls along
 * the foot; one comes out through the hole; roots break out of the wall face high up and arch
 * forward overhead, their tips hanging (from the camera they lie over the wall, never over the
 * rune-line). The long tunnel (1.B) has roots from both ends and more overhead. Clear of the plates
 * (x = ±(half − 0.9), high on the wall) and of 2.2's secret door (x 0–1.2 at the wall's foot).
 */
function corridorRoots(half: number): BufferGeometry[] {
  const near = -half + 1.6;
  const hole = holeAt(half);
  const runs: RootRun[] = [
    // Over the low wall at the near end, down the face and along the foot.
    {
      path: [
        [near - 0.3, 2.35, -4.5],
        [near - 0.2, 2.12, -3.95],
        [near - 0.1, 1.8, -3.8],
        [near, 1.0, -3.78],
        [near + 0.15, 0.24, -3.76],
        [near + 0.5, 0.09, -3.58],
        [near + 1.2, 0.07, -3.46],
        [near + 1.9, 0.05, -3.52],
      ],
      radius: 0.2,
      strands: 3,
      rootlets: 4,
      seed: 31,
    },
    // Out through the hole the moon comes in by.
    {
      path: [
        [hole + 0.3, 1.0, -4.5],
        [hole + 0.35, 0.8, -3.88],
        [hole + 0.5, 0.15, -3.7],
        [hole + 0.9, 0.07, -3.5],
        [hole + 1.5, 0.05, -3.45],
      ],
      radius: 0.12,
      strands: 2,
      rootlets: 2,
      seed: 32,
    },
  ];
  if (half > 5)
    // The long tunnel (1.B): roots from the far end too.
    runs.push({
      path: [
        [half - 1.6, 1.75, -4.5],
        [half - 1.65, 1.6, -3.8],
        [half - 1.7, 0.5, -3.78],
        [half - 1.9, 0.09, -3.6],
        [half - 2.6, 0.07, -3.5],
        [half - 3.3, 0.05, -3.6],
      ],
      radius: 0.17,
      strands: 3,
      rootlets: 3,
      seed: 33,
    });
  // Overhead: roots coming over the broken top of the wall where it dips (the notches in its jagged
  // top) and hanging down its face. From the camera they lie over the wall, never over the rune-line.
  const notches = half > 5 ? [-5.7, -3.7, 0.3, 3.8] : [-2.7, -0.7];
  notches.forEach((x, i) => {
    // The notch's height: the Wall_Broken piece's top dips to about 2.4 m 0.7 m left of its centre,
    // 2.65 m 0.8 m right of it.
    const local = x - (-half + 1 + 2 * Math.round((x + half - 1) / 2));
    const top = local < 0 ? 2.4 : 2.62;
    const drop = 1.0 + ((i * 3) % 4) * 0.15;
    runs.push({
      path: [
        [x - 0.02, top + 0.3, -4.55],
        [x, top + 0.1, -4.08],
        [x + 0.03, top - 0.1, -3.85],
        [x + 0.08, top - drop * 0.6, -3.84],
        [x + 0.1, top - drop, -3.86],
      ],
      radius: 0.1,
      strands: 2,
      seed: 40 + i,
    });
  });
  return rootRuns(runs);
}

export function hallsCorridor(half = 5): CorridorDressing {
  const runes = corridorRunes(half);
  // The back wall in 2 m pieces along the whole length, a hole the moon comes through, broken tops.
  const cycle = ["Wall_Overgrown", "Wall", "Wall_Overgrown", "Wall_Hole", "Wall_Overgrown", "Wall"];
  const walls: Placement[] = [];
  for (let x = -half + 1, k = 0; x < half; x += 2, k++) {
    walls.push({ piece: cycle[k % cycle.length] as string, position: [x, 0, -4] });
    if (k % 3 !== 0) walls.push({ piece: "Wall_Broken", position: [x, 2, -4] });
  }
  const growth: KitPlacement[] = [
    // The damp along the back wall's foot, where the roots come in.
    nature("Fern_1", [-half + 0.7, 0, -3.5], 0.9, 0.75),
    nature("Mushroom_Common", [-1.2, 0, -3.65], 0.4, 1.1),
    nature("Grass_Wispy_Tall", [1.6, 0, -3.7], 1.1, 0.8),
    nature("Clover_1", [2.4, 0, -3.6], 2.2, 0.7),
    nature("Clover_2", [3.2, 0, -2.9], 0.5, 0.55),
    nature("Fern_1", [half - 1.7, 0, -3.55], 2.0, 0.7),
    nature("Rock_Medium_2", [half - 0.65, -0.08, -3.45], 1.3, 0.32),
    // The front edge: low tufts only, so the rune-line and the messages stay in view.
    nature("Grass_Wispy_Short", [-1.8, 0, -0.75], 0.3, 0.8),
    nature("Grass_Common_Short", [1.1, 0, -0.7], 1.7, 0.8),
  ];
  if (half > 5) {
    // The long tunnel (1.B): more growth in the damp between, a bracket fungus on the far root, and
    // moss behind the far end of the cable where its loose end glints.
    growth.push(nature("Mushroom_Common", [-half + 3.2, 0, -3.6], 2.1, 0.9));
    growth.push(nature("Grass_Wispy_Tall", [-half + 4.1, 0, -3.65], 0.2, 0.75));
    growth.push(nature("Clover_1", [half - 4.2, 0, -3.55], 1.4, 0.65));
    growth.push(nature("Mushroom_Laetiporus", [half - 2.3, 0, -3.3], 2.6, 0.4));
    growth.push(nature("Clover_2", [half - 1.5, 0, -2.75], 1.9, 0.5));
  }
  return {
    placements: [
      ...walls,
      { piece: "Bricks", position: [half - 1.6, 0, -0.9], rotationY: 0.7, scale: 0.8 },
      { piece: "Brick", position: [-half + 1.9, 0, -0.8], rotationY: 2.2 },
    ],
    extras: [
      ...corridorFloor(1, "Floor", 5101, half),
      ...extras({
        Root: corridorRoots(half),
        Hedge: [hedge([-half + 1.6, 0, -3.55], [-half + 3.3, 0, -3.55], 0.8, 0.55, 11)],
      }),
    ],
    kitPieces: growth,
    runes,
    // Each rune's warm light, a little out from the wall.
    glows: runes.map((r, i) => ({
      position: [r.along, r.y + 0.1, -3.5] as [number, number, number],
      colour: "#FFD08A",
      strength: i === 0 ? 1.4 : 1.2,
    })),
    beams: moonlight([{ from: [holeAt(half), 1.6, -4], width: 1.1, depth: 0.8 }]),
  };
}
