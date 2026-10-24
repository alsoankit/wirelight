import type { BufferGeometry } from "three";
import { FLOORS, makeFlagstones } from "../kit/floor";
import type { Extra, Placement } from "../kit/StaticRoom";
import type { KitPlacement } from "../kits/placement";
import type { RuneMark } from "../observatory/Runes";
import type { RegionId } from "../region";
import type { Beams, Gear, Glow } from "../room/layout";

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
  beams?: Beams;
  stainedGlass?: BufferGeometry;
  /** Carved runes on the back wall (Region 1): the visible source of its glows. */
  runes?: RuneMark[];
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

/** The arches at both ends, each a door into a room (both face the camera, +x). */
export function endArches(region: RegionId, half: number = CORRIDOR.half): Placement[] {
  const piece = region === 1 ? "Wall_ArchRound_Overgrown" : region === 4 ? "Wall_ArchGothic" : "Wall_ArchRound";
  const { cable } = CORRIDOR;
  return [-half, half].map((x): Placement => ({ piece, position: [x, 0, cable], rotationY: Math.PI / 2 }));
}
