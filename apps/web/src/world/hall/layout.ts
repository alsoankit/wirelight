import { makeEarth, makeFlagstones } from "../kit/floor";
import type { Placement } from "../kit/StaticRoom";
import type { RegionId } from "../region";
import { CATHEDRAL_HALL_PIECES, cathedralHall } from "../regions/cathedral";
import { TOWN_SQUARE_PIECES, townSquare } from "../regions/town";
import { worksHallDressing } from "../regions/works";
import type { DoorSlot, RoomLayout } from "../room/layout";

// A switch's room, the sorting hall (CORE-06, Region 2's brief): many doors around the keeper, the
// MAC board on its stand, and the keeper's desk. Until Region 2's own kit is in (brass, gears,
// pipes), it's built from the Ruins kit with plain 2 m doorways in the walls: the gaps are left
// open and given a stone frame (DoorFrames in HallScene).
//
// Doors in order (eth0 first): back wall x = −3 and 1, left wall z = −1 and 3, back wall x = 3, then
// (for the town square's many houses) left wall z = −3, back wall x = −1 and left wall z = 1.

const QUARTER = Math.PI / 2;

export const HALL_SLOTS: DoorSlot[] = [
  { wall: "back", at: -3, plate: "above" },
  { wall: "back", at: 1, plate: "above" },
  { wall: "left", at: -1, plate: "above" },
  { wall: "left", at: 3, plate: "above" },
  { wall: "back", at: 3, plate: "above" },
  { wall: "left", at: -3, plate: "above" },
  { wall: "back", at: -1, plate: "above" },
  { wall: "left", at: 1, plate: "above" },
];

/** The walls, with a gap wherever a door is. */
function walls(doors: number, plain?: string): Placement[] {
  const used = HALL_SLOTS.slice(0, doors);
  const gap = (wall: "back" | "left", at: number) => used.some((s) => s.wall === wall && s.at === at);
  const out: Placement[] = [];
  for (const at of [-3, -1, 1, 3]) {
    if (!gap("back", at)) out.push({ piece: plain ?? (at === -1 ? "Wall_Overgrown" : "Wall"), position: [at, 0, -4] });
    if (!gap("left", at))
      out.push({ piece: plain ?? (at === 1 ? "Wall_Broken" : "Wall"), position: [-4, 0, at], rotationY: QUARTER });
  }
  return out;
}

const DRESSING: Placement[] = [
  { piece: "Column_Square", position: [-4, 0, -4] },
  { piece: "Column_Round_Short", position: [4, 0, -4] },
  { piece: "Bricks", position: [2.9, 0, 2.6], rotationY: 0.8 },
  { piece: "Brick", position: [0.9, 0, 3.1], rotationY: 0.3 },
  { piece: "Barrel", position: [3.2, 0, -2.9] },
  { piece: "Crate", position: [2.6, 0, -3.3], rotationY: 0.4 },
  { piece: "Grass", position: [-3.4, 0, 2.2] },
  { piece: "Grass", position: [2.2, 0, 1.0] },
];

const FLOOR = [
  { name: "Floor", geometry: makeFlagstones({ size: 8.4, seed: 3301 }) },
  { name: "Earth", geometry: makeEarth(8.4) },
];

/** Every piece a hall can use (for preloading). */
export const HALL_PIECES: Placement[] = [...walls(0), ...DRESSING, ...TOWN_SQUARE_PIECES, ...CATHEDRAL_HALL_PIECES];

const WORKS_DRESSING: Placement[] = [
  { piece: "Column_Square", position: [-4, 0, -4] },
  { piece: "Column_Square", position: [4, 0, -4], scale: 0.5 },
  { piece: "Bricks", position: [2.9, 0, 2.6], rotationY: 0.8, scale: 0.8 },
  { piece: "Crate", position: [2.6, 0, -3.3], rotationY: 0.4 },
];

export function hallLayout(doors: number, region: RegionId = 1): RoomLayout {
  const frame = {
    doorSlots: HALL_SLOTS,
    keeper: [0.4, 0, 0.2] as RoomLayout["keeper"],
    air: { min: [-3.4, 0.4, -3.4], max: [3.4, 3.0, 3.4] } as RoomLayout["air"],
  };
  const used = HALL_SLOTS.slice(0, doors);
  if (region === 2) {
    const d = worksHallDressing(used);
    return { ...frame, placements: [...walls(doors, "Wall"), ...WORKS_DRESSING], ...d };
  }
  if (region === 3) return { ...frame, placements: TOWN_SQUARE_PIECES, ...townSquare(used) };
  if (region === 4) return { ...frame, placements: CATHEDRAL_HALL_PIECES, ...cathedralHall(used) };
  return {
    placements: [...walls(doors), ...DRESSING],
    extras: FLOOR,
    doorSlots: HALL_SLOTS,
    keeper: [0.4, 0, 0.2],
    air: { min: [-3.4, 0.4, -3.4], max: [3.4, 3.0, 3.4] },
  };
}
