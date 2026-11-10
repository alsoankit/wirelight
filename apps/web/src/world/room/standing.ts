import type { CarvedOptions } from "../kit/carved";
import type { RegionId } from "../region";

// What stands in a room as a live model (a Statue, not room geometry): the region's statue and the
// set dressing, as plain data. The scenes draw them; the bake (tools/bake/export.mjs) adds them to its
// scene as shadow casters, so they cast baked shadows without taking any lightmap space.

export type StatueLook = CarvedOptions & { slug: string; scale: number };

/** Each region's statue (0094): a figure of its part of the palace. */
export const STATUES: Partial<Record<RegionId, StatueLook>> = {
  // The outer gardens: a seated stone woman with roses, moss on her shoulders and lap.
  1: { slug: "frauenfigur", scale: 0.8, tint: { restored: "#BDB6A7", ruined: "#6A6F78" }, moss: 0.85, detail: 0.3 },
  // The works: none since the owl went (owner, 2026-11-10: it doesn't fit the palace).
  // The town: a robed figure with a lantern, in warm stone.
  3: { slug: "lamplighter-mourner", scale: 1.0, tint: { restored: "#C8B89C", ruined: "#6D6F76" }, detail: 0.3 },
  // The cathedral: a winged grave angel, in sandstone.
  4: { slug: "warden-grab", scale: 0.85, tint: { restored: "#D2C2A2", ruined: "#7A7B80" }, detail: 0.3 },
};

/** Where it stands in a room: on the floor (or a cabinet top), and which way it faces (radians). */
export type StatueSpot = { at: [number, number, number]; turn: number };

/**
 * Facing the camera: the town's figure faces +z in its scan; the woman's, the owl's and the angel's face −z.
 */
export const FACING: Record<RegionId, number> = { 1: 3.9, 2: 3.9, 3: 0.7, 4: 3.9 };

/** Regional room history stays near the far wall, away from the near-right machine workspace. */
export const ROOM_HISTORY_PLACE: Record<RegionId, StatueSpot> = {
  1: { at: [2.25, 0, -2.45], turn: FACING[1] },
  2: { at: [3.0, 0, -2.45], turn: FACING[2] },
  3: { at: [-2.7, 0, -2.45], turn: FACING[3] },
  4: { at: [3.0, 0, -2.45], turn: FACING[4] },
};

/** The region's historical figure stays at the far end, clear of the near-right workspace. */
export const SIDE_PLACE = (region: RegionId): StatueSpot => ROOM_HISTORY_PLACE[region];

/**
 * Where each region's statue stands in the Observatory (0094), clear of the doorway and the boards.
 * The scans of the woman, the owl and the angel face −z: turned about 3.9 they face the camera.
 */
export const STATUE_AT: Record<number, StatueSpot> = {
  // The far end (0110): statues and wall art at the back, machines at the near end.
  1: { at: [2.6, 0, -3.1], turn: 3.7 },
  // Perched on the sorters' card cabinet, right of the door.
  2: { at: [2.95, 1.73, -3.55], turn: 3.9 },
  3: { at: [2.8, 0, -3.1], turn: 0.4 },
  // Where the code-made statue stood, in the far corner.
  4: { at: [3.0, 0, -2.9], turn: 3.9 },
};

/**
 * Set dressing (0089, 0094): one carved statue per region, in the back-left corner, clear of the
 * keeper, the doors, the boards and the region's statue. Reworked models face +z: turned about 0.8 they face
 * the camera and the room.
 */
export const DRESSING_AT: Record<number, StatuePlace> = {
  // A kneeling angel, half taken by the moss.
  1: {
    slug: "stone-angel",
    position: [-3.35, 0, -1.35],
    turn: 0.8,
    scale: 0.75,
    tint: { restored: "#BDB6A7", ruined: "#6A6F78" },
    moss: 0.8,
  },
  // A small praying monk in the corner.
  3: {
    slug: "praying-monk",
    position: [-3.35, 0, -1.35],
    turn: 0.8,
    scale: 0.7,
    tint: { restored: "#C8B89C", ruined: "#6D6F76" },
  },
  // A gothic figure by the back wall, left of the door.
  4: {
    slug: "gothic-statue",
    position: [-3.35, 0, -1.35],
    turn: 0.8,
    scale: 0.6,
    tint: { restored: "#D2C2A2", ruined: "#7A7B80" },
  },
};

/** A live model in a room, as `Statue` takes it. */
export type StatuePlace = Partial<CarvedOptions> & {
  slug: string;
  position: [number, number, number];
  turn?: number;
  scale?: number;
};

/** The live models standing in a room of this kind: what the bake takes as shadow casters. */
export function standing(
  kind: string,
  region: RegionId,
): { slug: string; position: [number, number, number]; turn: number; scale: number }[] {
  if (kind === "corridor") return [];
  const out = [];
  const statue = STATUES[region];
  const place = kind === "observatory" ? STATUE_AT[region] : SIDE_PLACE(region);
  const hallUsesAngel = kind === "hall" && (region === 1 || region === 3);
  if (statue && place && !hallUsesAngel)
    out.push({ slug: statue.slug, position: place.at, turn: place.turn, scale: statue.scale });
  const dressing = kind === "observatory" ? DRESSING_AT[region] : undefined;
  if (dressing)
    out.push({
      slug: dressing.slug,
      position: dressing.position,
      turn: dressing.turn ?? 0,
      scale: dressing.scale ?? 1,
    });
  return out;
}
