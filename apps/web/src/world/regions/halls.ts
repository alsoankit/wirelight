import { makeEarth, makeFlagstones } from "../kit/floor";
import type { Extra, Placement } from "../kit/StaticRoom";
import type { KitPlacement } from "../kits/placement";
import { MOON_POSITION, MOON_TARGET } from "../moon";
import type { Beams } from "../room/layout";

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
// the desk, the Glass, the keeper) as the game camera sees it.

const QUARTER = Math.PI / 2;

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

/** How far up a dead tree its branches begin, in metres at the kit's scale (the crown above is the "roots"). */
const CROWN_STARTS: Record<string, number> = { DeadTree_1: 2.1, DeadTree_3: 3.0 };

/**
 * Roots breaking up through the floor: a dead tree sunk almost whole, leaning, so only its crown of
 * gnarled branches shows, reading as the roots of something vast outside pushing in under the wall.
 * `at` is where it breaks the floor; it leans toward `heading` (radians about Y, 0 = +x); `tilt` from
 * upright (larger: lower and longer along the floor). The dead trees are ~6k triangles: one per room.
 */
function rootCrown(
  piece: "DeadTree_1" | "DeadTree_3",
  at: [number, number],
  heading: number,
  tilt: number,
  scale = 1,
): KitPlacement {
  const sunk = (CROWN_STARTS[piece] ?? 2) * scale;
  const out = sunk * Math.sin(tilt);
  const base: [number, number, number] = [
    at[0] - Math.cos(heading) * out,
    -sunk * Math.cos(tilt),
    at[1] + Math.sin(heading) * out,
  ];
  return { kit: "region-1/nature", piece, position: base, rotation: [0, heading, -tilt], scale };
}

// ---------------------------------------------------------------------------------------------------
// The Observatory (the player's own machine, every Region 1 room)
// ---------------------------------------------------------------------------------------------------
//
// The doorway is a round arch in the back wall at x = 0, leading to the corridor (−z); on Floor 2 a
// second arch in the left wall at z = 2. Broken stone, a fallen column, rubble, grass in the cracks, a
// dead tree outside the collapsed corner, and the Knight's cloak on its peg.

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
    { piece: "Brick", position: [1.75, 0, 2.55], rotationY: 2.0 }, // weighs down the Knight's letter
    // A dead tree outside, behind the collapsed corner: its trunk hidden by the wall, its branches
    // reaching over the broken top against the moon.
    { piece: "DeadTree_3", position: [3.0, 0, -5.4], rotationY: 0.8, scale: 1.5 },
  ];
}

// An old statue of the weavers' beasts, broken: a stag that has toppled onto its side. (A standing
// fox statue behind the keeper read as the keeper itself, a cat on a plinth: playtest.)
function statues(): Placement[] {
  return [
    { piece: "Bricks", position: [-3.1, 0, -2.6], rotationY: 0.9, scale: 0.8 },
    { piece: "Statue_Stag", position: [-1.0, 0.72, 2.75], rotation: [0, -0.35, Math.PI / 2], scale: 0.45 },
    { piece: "Bricks", position: [-1.9, 0, 2.2], rotationY: 1.4, scale: 0.7 },
  ];
}

// The Knight's traces (0052): his cloak, left on its peg.
function knight(): Placement[] {
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
    ...(secondDoor ? [] : knight()),
  ];
}

const OBSERVATORY_FLOOR: Extra[] = [
  { name: "Floor", geometry: makeFlagstones({ size: 8.4, seed: 1103 }) },
  { name: "Earth", geometry: makeEarth(8.4) },
];

// Moss and roots reclaiming the hall (layer 2 and 4): roots breaking up under the left wall, growth
// pouring in where the corner collapsed, ferns and clover where the moonlight pools on the floor, a
// bracket fungus on the fallen column, mushrooms in the damp under the rubble. Low along the walls
// and in the corners, so the boards, the desk, the Glass, the keeper and the plates stay clear.
// With two doors, the strip from the second (sealed) arch across the floor stays bare: 2.B's great
// channel and its wall of roots run there (room/BossPiece.tsx).
function observatoryGrowth(secondDoor: boolean): KitPlacement[] {
  const out: KitPlacement[] = [
    // Roots of something vast outside, breaking up through the floor and crawling along the left
    // wall's foot under the barred window (below the runes).
    rootCrown("DeadTree_1", [-3.85, -3.3], -1.2, 1.25, 1.25),
    // The back-left corner: a fern in the damp, mushrooms under the fallen bricks.
    nature("Fern_1", [-3.45, 0, -3.4], 0.6, 0.8),
    nature("Mushroom_Common", [-2.75, 0, -2.3], 0.9, 1.3),
    nature("Grass_Wispy_Tall", [-2.2, 0, -3.7], 0.3, 0.8),
    // Along the back wall either side of the arch (low: the cable comes in through it).
    nature("Grass_Wispy_Short", [1.25, 0, -3.65], 1.2),
    nature("Clover_1", [-0.95, 0, -3.72], 2.0, 0.8),
    // The collapsed corner: a mossy boulder of fallen masonry, a big plant and tall grass coming in.
    nature("Rock_Medium_3", [3.55, -0.12, -3.35], 2.6, 0.42),
    nature("Plant_1_Big", [3.65, 0, -2.75], 0.4, 0.9),
    nature("Grass_Wispy_Tall", [2.55, 0, -3.65], 1.7),
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
  ];
  if (!secondDoor) {
    // Under the Knight's cloak, and where the left wall has crumbled at the front.
    out.push(nature("Grass_Wispy_Short", [-3.6, 0, 1.75], 0.4, 0.8));
    out.push(nature("Rock_Medium_2", [-3.55, -0.08, 2.6], 1.9, 0.33));
  }
  return out;
}

// Where the moon gets in: the barred window, the gap above the crumbled left wall, and the collapsed
// top of the back wall's right end. Only the window's light pools on the floor (the wide gap's pool
// would spill over the floor's edge; the corner's lands outside).
const OBSERVATORY_MOON = moonlight([
  { from: [-4, 3.1, -3], width: 1.3, depth: 0.9 },
  { from: [-4, 2.4, 1.8], width: 2.6, depth: 1.2, pool: false },
  { from: [3, 2.4, -4], width: 1.6, depth: 1.0 },
]);

export function hallsObservatory(secondDoor: boolean): {
  placements: Placement[];
  extras: Extra[];
  kitPieces: KitPlacement[];
  beams: Beams;
} {
  return {
    placements: hallsObservatoryPieces(secondDoor),
    extras: OBSERVATORY_FLOOR,
    kitPieces: observatoryGrowth(secondDoor),
    beams: OBSERVATORY_MOON,
  };
}

// ---------------------------------------------------------------------------------------------------
// Another computer's room (lantern; quill's is sealed)
// ---------------------------------------------------------------------------------------------------
//
// A smaller ruin of the same weavers, one arch in the back wall where the corridor comes in.

export const HALLS_HOUSE_PIECES: Placement[] = [
  // Back wall: the arch the corridor comes through, plain walls either side.
  { piece: "Wall_ArchRound_Overgrown", position: [0, 0, -4] },
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
  // What's left: the old lamp-post the room is named for, toppled pots, rubble, grass.
  { piece: "Torch", position: [-2.4, 0, -3.5] },
  { piece: "Pot2_Broken", position: [-3.1, 0, 0.6], rotationY: 0.6 },
  { piece: "Pot1", position: [-3.3, 0, -0.3] },
  { piece: "Pot3_Broken", position: [2.6, 0, -3.2], rotationY: 2.2 },
  { piece: "Bricks", position: [2.9, 0, 1.9], rotationY: 0.9 },
  { piece: "Brick", position: [-1.6, 0, 2.6], rotationY: 0.4 },
  { piece: "DeadTree_1", position: [-5.6, 0, -1.8], rotationY: 1.9, scale: 1.3 },
  // What makes it someone's room and not the Observatory (agent C, playtest): an old shelf of the
  // machine's own, a chest, candle stubs by the lamp-post. (The bush at the broken corner is now the
  // Stylized Nature growth below.)
  { piece: "Bookcase_Empty", position: [-3.55, 0, -1.0], rotationY: QUARTER },
  { piece: "Candles_2", position: [-1.7, 0, -3.4], rotationY: 0.5 },
  { piece: "Chest", position: [-2.9, 0, 1.6], rotationY: 1.2 },
];

const HOUSE_FLOOR: Extra[] = [
  { name: "Floor", geometry: makeFlagstones({ size: 8.4, seed: 2207 }) },
  { name: "Earth", geometry: makeEarth(8.4) },
];

// The house's overgrowth: roots breaking in under the crumbled front of the left wall (where the moon
// falls on them), growth through the broken back corner, clover where the open window's light lands.
// Clear of the lamp-post, the shelf, the chest, the left-behind things on the right (house/Traits.tsx:
// around x 2.85, z −1.5), the rug in the middle and the keeper.
const HOUSE_GROWTH: KitPlacement[] = [
  rootCrown("DeadTree_1", [-3.85, 2.75], -0.35, 1.2, 1.1),
  nature("Fern_1", [-3.4, 0, -3.35], 0.4, 0.75),
  nature("Mushroom_Common", [-3.35, 0, -1.95], 2.4, 1.2),
  nature("Grass_Wispy_Tall", [1.7, 0, -3.65], 0.6, 0.85),
  nature("Clover_1", [-0.95, 0, -3.7], 1.1, 0.7),
  // The broken back corner: a big leafy plant and tall grass pushing in.
  nature("Plant_1_Big", [3.6, 0, -3.15], 2.0, 0.85),
  nature("Grass_Wispy_Tall", [3.2, 0, -2.55], 0.9, 0.8),
  nature("Rock_Medium_2", [3.55, -0.1, -2.15], 0.7, 0.3),
  // The open window's light on the floor.
  nature("Clover_2", [-1.75, 0, -0.85], 2.2, 0.5),
  nature("Grass_Wispy_Short", [-2.15, 0, -0.35], 0.8, 0.7),
  // The front edges: low tufts.
  nature("Grass_Common_Short", [3.2, 0, 3.0], 0.3),
  nature("Clover_1", [3.5, 0, 1.4], 2.6, 0.6),
  nature("Flower_3_Single", [-2.2, 0, 3.55], 0.5, 0.65),
];

// Moonlight through the open window, over the crumbled front of the left wall, and over the broken
// back corner (that one lands outside).
const HOUSE_MOON = moonlight([
  { from: [-4, 3.1, -3], width: 1.1, depth: 0.8 },
  { from: [-4, 1.9, 1.6], width: 1.8, depth: 1.0, pool: false },
  { from: [3, 2.2, -4], width: 1.4, depth: 0.9 },
]);

export function hallsHouse(): {
  placements: Placement[];
  extras: Extra[];
  kitPieces: KitPlacement[];
  beams: Beams;
} {
  return { placements: HALLS_HOUSE_PIECES, extras: HOUSE_FLOOR, kitPieces: HOUSE_GROWTH, beams: HOUSE_MOON };
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
  { piece: "Crate", position: [2.6, 0, -3.3], rotationY: 0.4 },
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
