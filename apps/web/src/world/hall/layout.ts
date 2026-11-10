import type { Placement } from "../kit/StaticRoom";
import type { RegionId } from "../region";
import { CATHEDRAL_HALL_PIECES, cathedralHall } from "../regions/cathedral";
import { HALLS_HALL_DRESSING, hallsHall } from "../regions/halls";
import { TOWN_SQUARE_PIECES, townSquare } from "../regions/town";
import { worksHall } from "../regions/works";
import type { DoorSlot, RoomLayout } from "../room/layout";
import type { StatuePlace } from "../room/standing";
import { withStubs } from "../room/stubs";

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
function walls(used: readonly (typeof HALL_SLOTS)[number][], plain?: string): Placement[] {
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
  ...walls([]),
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
const ANGELS: Partial<Record<RegionId, StatuePlace[]>> = {
  1: [
    {
      slug: "angel-marble",
      position: [3.15, 0, 2.8],
      turn: Math.PI / 2,
      scale: 0.75,
      tint: { restored: "#BDB6A7", ruined: "#6A6F78" },
      moss: 0.4,
      detail: 0.35,
    },
  ],
  3: [
    {
      slug: "angels-scanned",
      position: [3.15, 0, 2.8],
      turn: Math.PI / 2,
      scale: 0.8,
      tint: { restored: "#CFC2A6", ruined: "#6D6F76" },
      detail: 0.35,
    },
    {
      slug: "engel-seated",
      position: [6.4, 0, -6.3],
      turn: -0.4,
      scale: 0.7,
      tint: { restored: "#CFC2A6", ruined: "#6D6F76" },
      detail: 0.35,
    },
  ],
};

/**
 * A hall with arches at `open` (its doors' slots, in door order: room/plan.ts, decision 0118), or for a
 * bare count the first `open` of HALL_SLOTS (old callers, the contact sheet).
 */
export function hallLayout(open: readonly DoorSlot[] | number, region: RegionId = 1): RoomLayout {
  const same = (a: DoorSlot) => (b: DoorSlot) => a.wall === b.wall && a.at === b.at;
  const wallDoors =
    typeof open === "number"
      ? HALL_SLOTS.slice(0, open)
      : open.map((slot) => HALL_SLOTS.find(same(slot))).filter((s): s is (typeof HALL_SLOTS)[number] => !!s);
  const frame = {
    doorSlots: [...wallDoors, ...HALL_SLOTS.filter((s) => !wallDoors.some(same(s)))],
    keeper: [0.4, 0, 0.2] as RoomLayout["keeper"],
    air: { min: [-3.4, 0.4, -3.4], max: [3.4, 3.0, 3.4] } as RoomLayout["air"],
  };
  // Its angels, and the corridors' first stretch behind its arches (0119).
  const dressed = (l: RoomLayout): RoomLayout =>
    withStubs({ ...l, statues: [...(l.statues ?? []), ...(ANGELS[region] ?? [])] }, region, wallDoors);
  // The Works builds its halls from its own kits (regions/works.ts): village walls, its doorways.
  if (region === 2) return dressed({ ...frame, ...worksHall(wallDoors) });
  if (region === 3) return dressed({ ...frame, placements: TOWN_SQUARE_PIECES, ...townSquare(wallDoors) });
  if (region === 4) return dressed({ ...frame, placements: CATHEDRAL_HALL_PIECES, ...cathedralHall(wallDoors) });
  const halls = hallsHall();
  return dressed({ ...frame, ...halls, placements: [...walls(wallDoors), ...halls.placements] });
}
