import { FLOORS, makeFlagstones } from "../kit/floor";
import type { Extra, Placement } from "../kit/StaticRoom";
import type { KitPlacement } from "../kits/placement";
import type { RegionId } from "../region";
import type { DoorSlot, Glow, RoomLayout } from "./layout";

// The first stretch of each corridor, seen through its arch (0119): the room's floor carries on out of
// the doorway between two side walls of the room's own kit, so from inside you see the corridor's wall
// and floor running away, and from above every door is a walled passage leading out of the room, not a
// hole into the dark. Static, so it's baked and pictured with the room. Regions 1 and 2 first.

const QUARTER = Math.PI / 2;
/** How far the stub runs out from the wall face (two 2 m wall pieces), fading into the dark. */
const LENGTH = 4;
const FACE = -4;
/** Region 2's village kit: its walls' face sits this far in front of the piece's origin (works.ts). */
const WORKS_FACE = 0.09;
/** Half a doorway's width: the arches and door pieces are 2 m wide. */
const HALF = 1;

type Stubs = Pick<RoomLayout, "placements" | "extras" | "kitPieces">;

/**
 * The side walls' pieces for a doorway in `slot`: each side in 2 m pieces from the wall face outward
 * (both sides face +x or +z, toward the camera). `far` marks the outer pieces.
 */
function sides(slot: DoorSlot): { at: [number, number][]; far: boolean[]; turn: number } {
  const at: [number, number][] = [];
  const far: boolean[] = [];
  for (let k = 0; k < LENGTH / 2; k++) {
    const mid = FACE - 1 - 2 * k;
    for (const side of [-HALF, HALF]) {
      at.push(slot.wall === "back" ? [slot.at + side, mid] : [mid, slot.at + side]);
      far.push(k > 0);
    }
  }
  return { at, far, turn: slot.wall === "back" ? QUARTER : 0 };
}

/** Is (x, z) on the stub's floor (between its walls, from the wall face out)? */
function onStub(slot: DoorSlot, x: number, z: number): boolean {
  const [along, out] = slot.wall === "back" ? [x, z] : [z, x];
  return Math.abs(along - slot.at) < HALF && out < FACE + 0.15 && out > FACE - LENGTH;
}

/** The corridor stubs behind `slots`, in `region`'s pieces (none yet for Regions 3 and 4). */
export function corridorStubs(region: RegionId, slots: readonly DoorSlot[], seed = 7101): Stubs {
  if (region > 2 || slots.length === 0) return { placements: [], extras: [], kitPieces: [] };
  const floor: Extra = {
    name: "Floor",
    geometry: makeFlagstones({
      size: 2 * (-FACE + LENGTH) + 0.4,
      seed,
      ...FLOORS[region],
      keep: (x, z) => slots.some((s) => onStub(s, x, z)),
    }),
  };
  if (region === 1) {
    // The garden ruin's own walls (the Ruins kit), one overgrown, like the room's.
    const placements: Placement[] = slots.flatMap((slot) => {
      const { at, far, turn } = sides(slot);
      return at.map(
        ([x, z], i): Placement => ({
          piece: far[i] ? "Wall_Broken" : i === 0 ? "Wall_Overgrown" : "Wall",
          position: [x, 0, z],
          rotationY: turn,
        }),
      );
    });
    return { placements, extras: [floor], kitPieces: [] };
  }
  // The Works' uneven brick (its village kit), set like its room walls.
  const kitPieces: KitPlacement[] = slots.flatMap((slot) => {
    const { at, turn } = sides(slot);
    return at.map(([x, z]): KitPlacement => {
      const [dx, dz] = slot.wall === "back" ? [-WORKS_FACE, 0] : [0, -WORKS_FACE];
      return {
        kit: "region-2/hall",
        piece: "Wall_UnevenBrick_Straight",
        position: [x + dx, 0, z + dz],
        rotationY: turn,
      };
    });
  });
  return { placements: [], extras: [floor], kitPieces };
}

/** A soft light a little way down each stub, so its walls read through the arch (no visible source). */
function stubGlows(region: RegionId, slots: readonly DoorSlot[]): Glow[] {
  const colour = region === 1 ? "#FFD08A" : "#FFC27A";
  // Just inside the arch, so the stub is lit where it starts and fades into the dark further on.
  const out = FACE - 0.8;
  return slots.map((s) => ({
    position: s.wall === "back" ? [s.at, 1.7, out] : [out, 1.7, s.at],
    colour,
    strength: 0.9,
  }));
}

/** `layout` with corridor stubs behind the doorways in `slots` (0119). */
export function withStubs(layout: RoomLayout, region: RegionId, slots: readonly DoorSlot[]): RoomLayout {
  const s = corridorStubs(region, slots);
  if (!s.placements.length && !s.kitPieces?.length) return layout;
  return {
    ...layout,
    placements: [...layout.placements, ...s.placements],
    extras: [...layout.extras, ...s.extras],
    kitPieces: [...(layout.kitPieces ?? []), ...(s.kitPieces ?? [])],
    stubGlows: stubGlows(region, slots),
  };
}
