import { makeEarth, makeFlagstones } from "../kit/floor";
import type { Placement } from "../kit/StaticRoom";
import type { RegionId } from "../region";
import { cathedralObservatory, cathedralObservatoryPieces } from "../regions/cathedral";
import { townObservatory, townObservatoryPieces } from "../regions/town";
import { worksObservatory, worksObservatoryPieces } from "../regions/works";
import type { RoomLayout } from "../room/layout";

// B0 mock layout of the Observatory (the player's computer room, Region 1), built from the Ruins kit.
// Mock data only: in B1 rooms come from packages/rooms and their layout files.
//
// The room is 8 × 8 m, centred on the origin. The camera looks from the front right, so only the
// back wall (z = −4) and the left wall (x = −4) are built: a cutaway, as in art-direction.md.
// The doorway is a round arch in the back wall at x = 0, leading to the corridor (−z).
//
// A left world (0052): only what the Forgetting left. Broken stone, a fallen column, rubble, grass
// in the cracks, a dead tree outside the collapsed corner, and the Knight's cloak on its peg.
// The floor isn't kit tiles: it's made in code (kit/floor.ts) and passed to the static room.
// No furniture, no candles: the light is the moon, the keeper's lantern and the runes (Runes.tsx).

const QUARTER = Math.PI / 2;

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
function ruin(): Placement[] {
  return [
    { piece: "Bricks", position: [3.0, 0, -3.1], rotationY: 0.4 },
    { piece: "Bricks", position: [-3.2, 0, 3.4], rotationY: 2.1 },
    { piece: "Brick", position: [1.9, 0, 2.2], rotationY: 0.7 },
    { piece: "Brick", position: [-2.6, 0, -0.2], rotationY: 0.3 },
    { piece: "Brick", position: [1.75, 0, 2.55], rotationY: 2.0 }, // weighs down the Knight's letter
    { piece: "Grass", position: [-3.6, 0, -0.4] },
    { piece: "Grass", position: [1.3, 0, -3.6] },
    { piece: "Grass", position: [-3.0, 0, -2.7] },
    { piece: "Grass", position: [2.7, 0, 1.6] },
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

function placements(secondDoor: boolean): Placement[] {
  // The Knight's cloak hangs where the second arch would be; with two doors it isn't there.
  return [
    ...backWall(),
    ...leftWall(secondDoor),
    ...pillars(),
    ...ruin(),
    ...statues(),
    ...(secondDoor ? [] : knight()),
  ];
}

/** Every piece the Observatory can use, in every region (for preloading). */
export const OBSERVATORY: Placement[] = [
  ...placements(false),
  ...placements(true),
  ...worksObservatoryPieces(false),
  ...worksObservatoryPieces(true),
  ...townObservatoryPieces(false),
  ...townObservatoryPieces(true),
  ...cathedralObservatoryPieces(false),
  ...cathedralObservatoryPieces(true),
];

const FLOOR = [
  { name: "Floor", geometry: makeFlagstones({ size: 8.4, seed: 1103 }) },
  { name: "Earth", geometry: makeEarth(8.4) },
];

/** The Observatory with one door (eth0, the back arch) or two (eth1, the left wall's arch). */
export function observatoryLayout(doors: number, region: RegionId = 1): RoomLayout {
  const frame = {
    doorSlots: [
      { wall: "back", at: 0 },
      { wall: "left", at: 2 },
    ] as RoomLayout["doorSlots"],
    keeper: [0, 0, -0.6] as RoomLayout["keeper"],
    air: { min: [-3.4, 0.4, -3.4], max: [3.4, 3.0, 3.4] } as RoomLayout["air"],
  };
  if (region === 2) return { ...frame, ...worksObservatory(doors > 1) };
  if (region === 3) return { ...frame, ...townObservatory(doors > 1) };
  if (region === 4) return { ...frame, ...cathedralObservatory(doors > 1) };
  return {
    placements: placements(doors > 1),
    extras: FLOOR,
    doorSlots: [
      { wall: "back", at: 0 },
      { wall: "left", at: 2 },
    ],
    keeper: [0, 0, -0.6],
    air: { min: [-3.4, 0.4, -3.4], max: [3.4, 3.0, 3.4] },
  };
}

// Where things are, for the scene and the message paths.
export const DOORWAY = { x: 0, z: -4 } as const;
export const KEEPER = { position: [0, 0, -0.6] as [number, number, number] } as const;
// The corridor itself isn't built in the room view: beyond the doorway is darkness, and the cable
// runs a little way into it and fades. (Anything built behind the walls shows outside the cutaway.)
export const CORRIDOR_END_Z = -6.5;
// Where the Knight's unfinished letter lies, under a brick, near the Glass.
export const LETTER: [number, number, number] = [1.65, 0.035, 2.45];
