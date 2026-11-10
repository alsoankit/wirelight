import type { BufferGeometry } from "three";
import { FLOORS, makeFlagstones } from "../kit/floor";
import type { Extra, Placement } from "../kit/StaticRoom";
import type { KitPlacement } from "../kits/placement";
import type { RuneMark } from "../observatory/Runes";
import type { RegionId } from "../region";
import type { Beams, Gear, Glow } from "../room/layout";
import type { StatuePlace } from "../room/standing";

// A corridor's frame (0081), in room coordinates so each region dresses it with the same helpers as its
// rooms: the back wall's face on z = −4 like a room's, the tunnel running along x from one door's arch
// (−x) to the other's (+x), open toward the camera (the cutaway), the cable along its middle.

export const CORRIDOR = {
  /** Half its length: the arches stand at x = ±half. */
  half: 5,
  /** The back wall's face (a room's back wall). */
  back: -4,
  /** Where the floor stops toward the camera. */
  front: -0.4,
  /** Where the cable runs. */
  cable: -2.2,
} as const;

/** Corridors longer than the usual 10 m (half lengths, by room): 1.B's long root tunnel (region-1 brief). */
export const LONG_CORRIDORS: Record<string, number> = { "f1.boss-dark-corridor": 8 };

/** How far a room's corridors run each way from their middle. */
export function corridorHalf(roomId: string | null | undefined): number {
  return (roomId ? LONG_CORRIDORS[roomId] : undefined) ?? CORRIDOR.half;
}

/** What a region puts in a corridor: the same parts as a room's layout. */
export type CorridorDressing = {
  placements: Placement[];
  extras: Extra[];
  kitPieces: KitPlacement[];
  glows: Glow[];
  gears?: Gear[];
  /** Where steam rises from (Region 2: regions/Steam.tsx). */
  steam?: [number, number, number][];
  beams?: Beams;
  stainedGlass?: BufferGeometry;
  /** Carved runes on the back wall (Region 1): the visible source of its glows. */
  runes?: RuneMark[];
  /** Live models of the corridor's own (0100): statues and backdrops, shadow casters in the bake. */
  statues?: StatuePlace[];
};

/** The region's floor, laid as a path between the back wall and the cutaway's edge. */
export function corridorFloor(
  region: RegionId,
  name: "Floor" | "Cobble",
  seed: number,
  half: number = CORRIDOR.half,
): Extra[] {
  const { back, front } = CORRIDOR;
  return [
    {
      name,
      geometry: makeFlagstones({
        size: 2 * half + 0.4,
        seed,
        ...FLOORS[region],
        keep: (_x, z) => z > back - 0.05 && z < front,
      }),
    },
  ];
}

/**
 * Does the corridor turn into its back wall at the right-hand end (0119)? Then the right room's gate is
 * an arch in the back wall (a far side) rather than an arch across the near end, which stood between the
 * camera and the corridor. Every region now (Regions 3 and 4 copied from 1 and 2).
 */
export function turnsIntoBack(_region: RegionId): boolean {
  return true;
}

/** Where the right-hand gate's centre is along the back wall, when the corridor turns into it. */
export function rightGateX(half: number = CORRIDOR.half): number {
  return half - 1;
}

/**
 * The gates the Ruins kit gives: the left one across the far (−x) end, facing the camera; the right
 * one across the near end, or in the back wall when the corridor turns into it (Region 1's, the same
 * overgrown arch its rooms use). Region 2's gates are its own village-kit doors (regions/works.ts);
 * Regions 3 and 4 make the right-hand gate a doorway in their own back wall (town.ts, cathedral.ts),
 * since the Ruins' 4 m arch doesn't fit their 2 m bays.
 */
export function endArches(region: RegionId, half: number = CORRIDOR.half): Placement[] {
  if (region === 2) return [];
  const piece = region === 1 ? "Wall_ArchRound_Overgrown" : region === 4 ? "Wall_ArchGothic" : "Wall_ArchRound";
  const { cable, back } = CORRIDOR;
  const left: Placement = { piece, position: [-half, 0, cable], rotationY: Math.PI / 2 };
  if (!turnsIntoBack(region)) return [left, { piece, position: [half, 0, cable], rotationY: Math.PI / 2 }];
  return region === 1 ? [left, { piece, position: [rightGateX(half), 0, back] }] : [left];
}
