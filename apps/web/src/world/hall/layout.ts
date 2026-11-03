import type { Placement } from "../kit/StaticRoom";
import type { RegionId } from "../region";
import { CATHEDRAL_HALL_PIECES, cathedralHall } from "../regions/cathedral";
import { HALLS_HALL_DRESSING, hallsHall } from "../regions/halls";
import { TOWN_SQUARE_PIECES, townSquare } from "../regions/town";
import { worksHall } from "../regions/works";
import type { DoorSlot, RoomLayout } from "../room/layout";
import type { StatuePlace } from "../room/standing";

// A switch's room, the sorting hall (CORE-06, Region 2's brief): many doors around the keeper, the
// MAC board on its stand, and the keeper's desk. Until Region 2's own kit is in (brass, gears,
// pipes), it's built from the Ruins kit with plain 2 m doorways in the walls: the gaps are left
// open and given a stone frame (DoorFrames in HallScene).
//
// Doors in order (eth0 first): back wall x = −3 and 1, left wall z = −1 and 3, back wall x = 3, then
// (for the town square's many houses) left wall z = −3, back wall x = −1 and left wall z = 1.

const QUARTER = Math.PI / 2;

export const HALL_SLOTS: (DoorSlot & { wall: "back" | "left" })[] = [
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

/** Every piece a hall can use (for preloading). */
export const HALL_PIECES: Placement[] = [
  ...walls(0),
  ...HALLS_HALL_DRESSING,
  ...TOWN_SQUARE_PIECES,
  ...CATHEDRAL_HALL_PIECES,
];

/**
 * Angels in the rooms with many doors (0113's dressing; owner, 2026-11-03: "best looking angels … in the
 * rooms with multiple gates or the square"). On the near-right edge, the one side a hall never has a
 * door, between its far end and the keeper, facing the camera. Not in the Works (machinery), nor in the
 * cathedral's halls (they keep their own statue).
 */
function angel(tint: { restored: string; ruined: string }, scale: number, moss = 0): StatuePlace {
  return { slug: "engel-wings", position: [3.1, 0, -2.75], turn: Math.PI / 2, scale, tint, moss, detail: 0.35 };
}

const ANGELS: Partial<Record<RegionId, StatuePlace[]>> = {
  1: [angel({ restored: "#BDB6A7", ruined: "#6A6F78" }, 0.75, 0.6)],
  3: [angel({ restored: "#CFC2A6", ruined: "#6D6F76" }, 0.75)],
};

export function hallLayout(doors: number, region: RegionId = 1): RoomLayout {
  const frame = {
    doorSlots: HALL_SLOTS,
    keeper: [0.4, 0, 0.2] as RoomLayout["keeper"],
    air: { min: [-3.4, 0.4, -3.4], max: [3.4, 3.0, 3.4] } as RoomLayout["air"],
  };
  const used = HALL_SLOTS.slice(0, doors);
  const withAngels = (l: RoomLayout): RoomLayout => ({
    ...l,
    statues: [...(l.statues ?? []), ...(ANGELS[region] ?? [])],
  });
  // The Works builds its halls from its own kits (regions/works.ts): village walls, its doorways.
  if (region === 2) return { ...frame, ...worksHall(used) };
  if (region === 3) return withAngels({ ...frame, placements: TOWN_SQUARE_PIECES, ...townSquare(used) });
  if (region === 4) return withAngels({ ...frame, placements: CATHEDRAL_HALL_PIECES, ...cathedralHall(used) });
  const halls = hallsHall();
  return withAngels({ ...frame, ...halls, placements: [...walls(doors), ...halls.placements] });
}
