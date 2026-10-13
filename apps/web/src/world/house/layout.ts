import { makeEarth, makeFlagstones } from "../kit/floor";
import type { Placement } from "../kit/StaticRoom";
import type { RegionId } from "../region";
import { CATHEDRAL_HOUSE_PIECES, cathedralHouse } from "../regions/cathedral";
import { TOWN_HOUSE_PIECES, townHouse } from "../regions/town";
import { worksHouse } from "../regions/works";
import type { RoomLayout } from "../room/layout";

// Another machine's room in the Overgrown Halls (lantern, Floor 1): a smaller ruin of the same
// weavers, one arch in the back wall where the corridor comes in. A left world (0052): broken stone,
// pots, the lamp the machine is named for, grass in the cracks. Same 8 × 8 m frame as the
// Observatory, so the camera and the doorways line up the same way.

const QUARTER = Math.PI / 2;

const PLACEMENTS: Placement[] = [
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
  { piece: "Grass", position: [-3.4, 0, 2.4] },
  { piece: "Grass", position: [1.7, 0, -3.5] },
  { piece: "Grass", position: [3.1, 0, 3.0] },
  { piece: "DeadTree_1", position: [-5.6, 0, -1.8], rotationY: 1.9, scale: 1.3 },
  // What makes it someone's room and not the Observatory (agent C, playtest): an old shelf of the
  // machine's own, a chest, candle stubs by the lamp-post, a bush pushing in at the broken corner.
  { piece: "Bookcase_Empty", position: [-3.55, 0, -1.0], rotationY: QUARTER },
  { piece: "Candles_2", position: [-1.7, 0, -3.4], rotationY: 0.5 },
  { piece: "Chest", position: [-2.9, 0, 1.6], rotationY: 1.2 },
  { piece: "Bush_Round", position: [3.3, 0, -3.2], scale: 0.8 },
];

const FLOOR = [
  { name: "Floor", geometry: makeFlagstones({ size: 8.4, seed: 2207 }) },
  { name: "Earth", geometry: makeEarth(8.4) },
];

/** Every piece a computer's room can use, in every region (for preloading). */
export const HOUSE_PIECES = [...PLACEMENTS, ...TOWN_HOUSE_PIECES, ...CATHEDRAL_HOUSE_PIECES];

export function houseLayout(region: RegionId = 1): RoomLayout {
  const frame = {
    doorSlots: [{ wall: "back", at: 0 }] as RoomLayout["doorSlots"],
    keeper: [0, 0, -0.8] as RoomLayout["keeper"],
    air: { min: [-3.4, 0.4, -3.4], max: [3.4, 3.0, 3.4] } as RoomLayout["air"],
  };
  if (region === 2) return { ...frame, ...worksHouse() };
  if (region === 3) return { ...frame, ...townHouse() };
  if (region === 4) return { ...frame, ...cathedralHouse() };
  return {
    placements: PLACEMENTS,
    extras: FLOOR,
    doorSlots: [{ wall: "back", at: 0 }],
    keeper: [0, 0, -0.8],
    air: { min: [-3.4, 0.4, -3.4], max: [3.4, 3.0, 3.4] },
  };
}
