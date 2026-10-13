import type { Extra, Placement } from "../kit/StaticRoom";

// What every machine's room needs to know about its own shape (CORE-06): where its doorways are, where
// the keeper stands, where the air is. One layout per kind of room; the doors come from the machine's
// real interfaces, in order (eth0 takes the first doorway, eth1 the second…).
//
// Rooms are 8 × 8 m around the origin, seen from the front right (a cutaway: only the back wall at
// z = −4 and the left wall at x = −4 are built). A doorway on the back wall leads out along −z; one on
// the left wall leads out along −x.

export type Wall = "back" | "left";
export type Vec3 = [number, number, number];

export type DoorSlot = {
  wall: Wall;
  /** Along the wall: x for the back wall, z for the left. */
  at: number;
  /** Where its plate hangs: beside the arch (default) or above a narrow doorway (halls). */
  plate?: "beside" | "above";
};

/** A light in the room that relights as restoration reaches it (runes, lamps, lanterns, windows). */
export type Glow = { position: Vec3; colour: string; strength: number };

/** A gear on a wall (Region 2): turns while the room is restored, stands still in ruin. */
export type Gear = {
  wall: Wall;
  along: number;
  y: number;
  radius: number;
  teeth: number;
  /** Which way it turns, and how fast relative to the others (meshing gears alternate). */
  spin: number;
  /** How far in front of the wall face. */
  out?: number;
  spokes?: number;
};

/** Shafts of light from where the outside gets in (moonbeams; stained glass in the Cathedral). */
export type Beams = {
  list: { from: Vec3; width: number; depth: number; colour?: string }[];
  direction: Vec3;
  colour: string;
  /** Strength in ruin and restored. */
  ruined: number;
  restored: number;
  /** Soft pools of the light where the shafts meet the floor. */
  pools?: boolean;
};

export type RoomLayout = {
  placements: Placement[];
  extras: Extra[];
  /** The room's own lights (when not given, the scene's). */
  glows?: Glow[];
  gears?: Gear[];
  beams?: Beams;
  doorSlots: DoorSlot[];
  keeper: Vec3;
  /** The room's air (fireflies, dust). */
  air: { min: Vec3; max: Vec3 };
};

const FACE = -4;

/** Where a doorway is, where its corridor goes, and where its plate hangs. */
export function doorGeometry(slot: DoorSlot) {
  const out: Vec3 = slot.wall === "back" ? [0, 0, -1] : [-1, 0, 0];
  const doorway: Vec3 = slot.wall === "back" ? [slot.at, 0.9, FACE] : [FACE, 0.9, slot.at];
  const corridorEnd: Vec3 = [doorway[0] + out[0] * 2.5, 0.35, doorway[2] + out[2] * 2.5];
  // The plate hangs on the wall to the right of the arch, as seen from inside.
  const beside = slot.plate === "above" ? 0 : 1.6;
  const height = slot.plate === "above" ? 2.2 : 2.35;
  const plate: Vec3 =
    slot.wall === "back" ? [slot.at + beside, height, FACE + 0.15] : [FACE + 0.15, height, slot.at + beside];
  // A loose cable end lies on the floor just inside the doorway.
  const looseEnd: Vec3 = slot.wall === "back" ? [slot.at + 0.7, 0.06, FACE + 0.9] : [FACE + 0.9, 0.06, slot.at - 0.7];
  return { out, doorway, corridorEnd, plate, looseEnd };
}

/** The room-side end of the cable: from the doorway, a little way into the corridor (it fades into the dark). */
export function cableSpan(slot: DoorSlot): { centre: Vec3; length: number; along: "x" | "z" } {
  const length = 2.5;
  return slot.wall === "back"
    ? { centre: [slot.at, 0.05, FACE - length / 2], length, along: "z" }
    : { centre: [FACE - length / 2, 0.05, slot.at], length, along: "x" };
}
