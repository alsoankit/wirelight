import type { BufferGeometry } from "three";
import type { Extra, Placement } from "../kit/StaticRoom";
import type { KitPlacement } from "../kits/placement";
import type { RuneMark } from "../observatory/Runes";
import type { StatuePlace } from "./standing";

// What every machine's room needs to know about its own shape (CORE-06): where its doorways are, where
// the keeper stands, where the air is. One layout per kind of room; the doors come from the machine's
// real interfaces, in order (eth0 takes the first doorway, eth1 the second…).
//
// Rooms are 8 × 8 m around the origin, seen from the front right (a cutaway: only the back wall at
// z = −4 and the left wall at x = −4 are built). A doorway on the back wall leads out along −z; one on
// the left wall leads out along −x.

/** The far walls; the near sides are never built (0116). */
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
  /** `pool: false`: no pool for this shaft (too wide for the floor to hold it). */
  list: { from: Vec3; width: number; depth: number; colour?: string; pool?: boolean }[];
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
  /** Textured pieces from the region kits (`kits/catalog.ts`), drawn by `KitRoom`. */
  kitPieces?: KitPlacement[];
  /** Carved runes on the walls (Region 1): the room's light when restored (0052). */
  runes?: RuneMark[];
  /** Live models of the room's own (0100): statues and backdrops, shadow casters in the bake. */
  statues?: StatuePlace[];
  extras: Extra[];
  /** The room's own lights (when not given, the scene's). */
  glows?: Glow[];
  /** Soft light down each corridor stub behind its arches (room/stubs.ts), added to the room's lights. */
  stubGlows?: Glow[];
  gears?: Gear[];
  /** Where steam rises from (Region 2's valves and vents: regions/Steam.tsx). */
  steam?: Vec3[];
  beams?: Beams;
  /**
   * Stained glass over the lit kit windows (Region 4, regions/Haze.tsx): panes whose `pane` attribute
   * holds (u, v, kind), coloured in the shader and multiplied over the window's own glow.
   */
  stainedGlass?: BufferGeometry;
  doorSlots: DoorSlot[];
  keeper: Vec3;
  /** The room's air (fireflies, dust). */
  air: { min: Vec3; max: Vec3 };
};

const FACE = -4;
/** Heights above a doorway: the gate's click area reaches GATE_TOP, the chip and the plate stack above. */
export const GATE_TOP = 2.75;
export const CHIP_Y = 2.98;
export const PLATE_Y = 3.45;

/** Where a doorway is, where its corridor goes, and where its plate hangs. */
export function doorGeometry(slot: DoorSlot) {
  const out: Vec3 = slot.wall === "back" ? [0, 0, -1] : [-1, 0, 0];
  const doorway: Vec3 = slot.wall === "back" ? [slot.at, 0.9, FACE] : [FACE, 0.9, slot.at];
  const corridorEnd: Vec3 = [doorway[0] + out[0] * 1.8, 0.35, doorway[2] + out[2] * 1.8];
  // The plate hangs above the arch, over the door's chip, so neither covers the gate's click area
  // (owner, 2026-11-10); the same for every room, so a door is always read the same way.
  const plate: Vec3 = slot.wall === "back" ? [slot.at, PLATE_Y, FACE + 0.15] : [FACE + 0.15, PLATE_Y, slot.at];
  // A loose cable end lies on the floor just inside the doorway.
  const looseEnd: Vec3 = slot.wall === "back" ? [slot.at + 0.7, 0.06, FACE + 0.9] : [FACE + 0.9, 0.06, slot.at - 0.7];
  return { out, doorway, corridorEnd, plate, looseEnd };
}

/**
 * The room-side end of the cable: from just inside the doorway a short way into the corridor, where it
 * fades into the dark. Kept short so it stays inside the arch as seen from the camera (a longer line
 * showed through the broken wall beside the arch, as if the cable left by another gap).
 */
export function cableSpan(slot: DoorSlot): { centre: Vec3; length: number; along: "x" | "z" } {
  const inside = 0.5;
  const length = 1.7;
  const mid = FACE + inside - length / 2;
  return slot.wall === "back"
    ? { centre: [slot.at, 0.05, mid], length, along: "z" }
    : { centre: [mid, 0.05, slot.at], length, along: "x" };
}
