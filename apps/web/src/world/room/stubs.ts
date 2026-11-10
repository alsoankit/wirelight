import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { FLOORS, makeFlagstones } from "../kit/floor";
import type { Extra, Placement } from "../kit/StaticRoom";
import { box } from "../kit/shapes";
import type { KitPlacement } from "../kits/placement";
import type { RegionId } from "../region";
import type { DoorSlot, Glow, RoomLayout } from "./layout";

// The first stretch of each corridor, seen through its arch (0119): the room's floor carries on out of
// the doorway between two side walls of the room's own kit, so from inside you see the corridor's wall
// and floor running away, and from above every door is a walled passage leading out of the room, not a
// hole into the dark. Static, so it's baked and pictured with the room. Every region (Regions 3 and 4
// copied from 1 and 2).

const QUARTER = Math.PI / 2;
/**
 * How far the stub runs out from the wall face (2 m wall pieces), fading into the dark. Region 3's is
 * one piece: the palace's lower wing stands 2.4 m behind its rooms' walls (regions/town.ts farPalace).
 */
const LENGTHS: Record<RegionId, number> = { 1: 4, 2: 4, 3: 2, 4: 4 };
const FACE = -4;
/** Regions 2 and 3's village kits: their walls' face sits this far in front of the piece's origin. */
const VILLAGE_FACE = 0.09;
/** Region 4's cathedral bays (regions/cathedral.ts): 2 m long, their body 0.25 m thick behind the face. */
const BAY_DEPTH = 0.25;
/** The village walls' top (3.12 m with the beam), where Region 3 caps them as its rooms do. */
const VILLAGE_TOP = 3.17;
/** Half a doorway's width: the arches and door pieces are 2 m wide. */
const HALF = 1;
/**
 * How far past the side walls' line the floor runs, so its edge slabs tuck under the walls: Regions 3
 * and 4 lay bigger slabs, whose edge ones dropped out and left a dark band at the walls' foot. (Regions
 * 1 and 2 keep their baked floors as they are.)
 */
const TUCK: Record<RegionId, number> = { 1: 0, 2: 0, 3: 0.25, 4: 0.25 };

type Stubs = Pick<RoomLayout, "placements" | "extras" | "kitPieces">;

/**
 * The side walls' pieces for a doorway in `slot`: each side in 2 m pieces from the wall face outward
 * (both sides face +x or +z, toward the camera). `far` marks the outer pieces.
 */
function sides(slot: DoorSlot, length: number): { at: [number, number][]; far: boolean[]; turn: number } {
  const at: [number, number][] = [];
  const far: boolean[] = [];
  for (let k = 0; k < length / 2; k++) {
    const mid = FACE - 1 - 2 * k;
    for (const side of [-HALF, HALF]) {
      at.push(slot.wall === "back" ? [slot.at + side, mid] : [mid, slot.at + side]);
      far.push(k > 0);
    }
  }
  return { at, far, turn: slot.wall === "back" ? QUARTER : 0 };
}

/** Is (x, z) on the stub's floor (between its walls, from the wall face out)? */
function onStub(slot: DoorSlot, x: number, z: number, length: number, tuck: number): boolean {
  const [along, out] = slot.wall === "back" ? [x, z] : [z, x];
  return Math.abs(along - slot.at) < HALF + tuck && out < FACE + 0.15 && out > FACE - length;
}

/** The corridor stubs behind `slots`, in `region`'s pieces. */
export function corridorStubs(region: RegionId, slots: readonly DoorSlot[], seed = 7101): Stubs {
  if (slots.length === 0) return { placements: [], extras: [], kitPieces: [] };
  const length = LENGTHS[region];
  const floor: Extra = {
    // Region 3's lanes are cobbled (its corridors' floor), the rest flagstones.
    name: region === 3 ? "Cobble" : "Floor",
    geometry: makeFlagstones({
      size: 2 * (-FACE + length) + 0.4,
      seed,
      ...FLOORS[region],
      keep: (x, z) => slots.some((s) => onStub(s, x, z, length, TUCK[region])),
    }),
  };
  if (region === 1) {
    // The garden ruin's own walls (the Ruins kit), one overgrown, like the room's.
    const placements: Placement[] = slots.flatMap((slot) => {
      const { at, far, turn } = sides(slot, length);
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
  if (region === 4) {
    // The cathedral's plain bays (2 × 4 m), their face on each side's line, the body behind it on the
    // left-hand side and beyond the line on the other, so the doorway stays clear (cathedral.ts `bay`).
    const kitPieces: KitPlacement[] = slots.flatMap((slot) => {
      const out: KitPlacement[] = [];
      for (let k = 0; k < length / 2; k++) {
        const end = FACE - 2 * k;
        for (const side of [-HALF, HALF]) {
          const line = slot.at + side + (side < 0 ? -BAY_DEPTH : 0);
          out.push(
            slot.wall === "back"
              ? {
                  kit: "region-4/cathedral",
                  piece: "wall_01",
                  position: [line, 0, end],
                  rotationY: QUARTER,
                  scale: 0.5,
                }
              : { kit: "region-4/cathedral", piece: "wall_01", position: [end - 2, 0, line], scale: 0.5 },
          );
        }
      }
      return out;
    });
    return { placements: [], extras: [floor], kitPieces };
  }
  // The Works' uneven brick and the town's plaster (their village kits), set like their room walls.
  const [kit, piece] =
    region === 2 ? ["region-2/hall", "Wall_UnevenBrick_Straight"] : ["region-3/village", "Wall_Plaster_Straight_Base"];
  const caps: ReturnType<typeof box>[] = [];
  const kitPieces: KitPlacement[] = slots.flatMap((slot) => {
    const { at, turn } = sides(slot, length);
    return at.map(([x, z]): KitPlacement => {
      const [dx, dz] = slot.wall === "back" ? [-VILLAGE_FACE, 0] : [0, -VILLAGE_FACE];
      // Region 3 caps its walls in stone (open on top, they showed a black slot from the camera).
      if (region === 3)
        caps.push(
          slot.wall === "back"
            ? box([0.5, 0.1, 2.02], [x - 0.2, VILLAGE_TOP, z])
            : box([2.02, 0.1, 0.5], [x, VILLAGE_TOP, z - 0.2]),
        );
      return { kit, piece, position: [x + dx, 0, z + dz], rotationY: turn };
    });
  });
  const extras: Extra[] = caps.length ? [floor, { name: "Stone", geometry: mergeGeometries(caps) }] : [floor];
  return { placements: [], extras, kitPieces };
}

/** A soft light a little way down each stub, so its walls read through the arch (no visible source). */
function stubGlows(region: RegionId, slots: readonly DoorSlot[]): Glow[] {
  const colour = region === 1 ? "#FFD08A" : region === 3 ? "#FFCB70" : region === 4 ? "#FFC46B" : "#FFC27A";
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
