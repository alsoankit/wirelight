import type { CarvedOptions } from "../kit/carved";
import type { RegionId } from "../region";

// What stands in a room as a live model (a Statue, not room geometry): the Guardian and the set
// dressing, as plain data. The scenes draw them; the bake (tools/bake/export.mjs) adds them to its
// scene as shadow casters, so they cast baked shadows without taking any lightmap space.

export type GuardianLook = CarvedOptions & { slug: string; scale: number };

export const GUARDIANS: Record<RegionId, GuardianLook> = {
  // The outer gardens: the Gardener, a seated stone woman with roses, moss on her shoulders and lap.
  1: { slug: "frauenfigur", scale: 0.8, tint: { restored: "#BDB6A7", ruined: "#6A6F78" }, moss: 0.85, detail: 0.3 },
  // The works: the clockwork owl, in bronze.
  2: {
    slug: "owl-carved",
    scale: 0.85,
    tint: { restored: "#A98245", ruined: "#5A5550" },
    metalness: 0.35,
    roughness: 0.55,
    detail: 0.4,
  },
  // The town: the Lamplighter, a robed figure in warm stone.
  3: { slug: "lamplighter-mourner", scale: 1.0, tint: { restored: "#C8B89C", ruined: "#6D6F76" }, detail: 0.3 },
  // The cathedral: the stone warden, the winged grave angel, in sandstone.
  4: { slug: "warden-grab", scale: 0.85, tint: { restored: "#D2C2A2", ruined: "#7A7B80" }, detail: 0.3 },
};

/** Where it stands in a room: on the floor (or a cabinet top), and which way it faces (radians). */
export type GuardianPlace = { at: [number, number, number]; turn: number };

/**
 * Facing the camera: the Lamplighter's scan faces +z, the Gardener's, the owl's and the warden's −z.
 */
export const FACING: Record<RegionId, number> = { 1: 3.9, 2: 3.9, 3: 0.7, 4: 3.9 };

/**
 * In a house or a hall: on the open right-hand side (no wall there: the camera's side), between the
 * routes board at the front and the back wall's furniture.
 */
export const SIDE_PLACE = (region: RegionId): GuardianPlace => ({ at: [3.0, 0, -1.0], turn: FACING[region] });

/**
 * Where each region's Guardian stands in the Observatory (0094), clear of the doorway and the boards.
 * The scans of the Gardener, the owl and the warden face −z: turned about 3.9 they face the camera.
 */
export const GUARDIAN_AT: Record<number, GuardianPlace> = {
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
 * keeper, the doors, the boards and the Guardian. Reworked models face +z: turned about 0.8 they face
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
  // The bronze owl vessel on the floor, by the back wall.
  2: {
    slug: "owl-zun",
    position: [-3.35, 0, -1.35],
    turn: 0.8,
    scale: 1.0,
    tint: { restored: "#A98245", ruined: "#5A5550" },
    metalness: 0.6,
    roughness: 0.5,
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

const TABLE_TOP = 0.845;

/**
 * The machines in the player's room (0110): real network hardware, still and silent, at the near end
 * of the room (the robot's workspace); statues and wall art keep the far end. A server cabinet and a
 * control panel on the near-right edge, a cable spool by the front, and one thing per region on the
 * planning table or the near corner. The near-left stays low: it is in front of the left door.
 * Reworked models face +z: a quarter turn faces +x, toward the camera's side.
 */
/** Each machine's paint: worn and greyed in ruin, its own colour restored. */
const MACHINE_LOOK: Record<string, CarvedOptions> = {
  "server-console": { tint: { restored: "#8C9096", ruined: "#5E636B" }, detail: 0.6, metalness: 0.3, roughness: 0.6 },
  "control-panel": { tint: { restored: "#A3A8A0", ruined: "#666B72" }, detail: 0.55, metalness: 0.25, roughness: 0.65 },
  "cable-spool": { tint: { restored: "#9A7A55", ruined: "#6B655C" }, detail: 0.5 },
  "vintage-terminal": { tint: { restored: "#D8CDB2", ruined: "#8E8F92" }, detail: 0.6, roughness: 0.6 },
  radio: { tint: { restored: "#CDB68C", ruined: "#8A8A88" }, detail: 0.6, roughness: 0.6 },
  "robot-arm": { tint: { restored: "#C98A3A", ruined: "#77757A" }, detail: 0.55, metalness: 0.2, roughness: 0.6 },
};

type MachinePlace = StatuePlace & CarvedOptions;

function machine(slug: string, position: [number, number, number], turn = 0): MachinePlace {
  return { slug, position, turn, ...(MACHINE_LOOK[slug] as CarvedOptions) };
}

/** The near-right edge (x 3.3): no door can be there, and nothing tall hides a door from the camera. */
const NEAR = 3.3;
const NEAR_EDGE = [
  machine("server-console", [NEAR, 0, -0.3], Math.PI / 2),
  machine("control-panel", [NEAR, 0, 0.5], Math.PI / 2),
];
const TERMINAL_ON_TABLE = machine("vintage-terminal", [2.75, TABLE_TOP, 1.45], Math.PI / 4);

export const MACHINES_AT: Record<number, MachinePlace[]> = {
  1: [...NEAR_EDGE, machine("cable-spool", [1.4, 0, 3.3], 0.4), TERMINAL_ON_TABLE],
  2: [...NEAR_EDGE, machine("cable-spool", [1.4, 0, 3.3], 0.4), machine("robot-arm", [3.1, 0, 2.9], Math.PI / 2)],
  3: [...NEAR_EDGE, machine("cable-spool", [1.4, 0, 3.3], 0.4), machine("radio", [2.8, TABLE_TOP, 1.4], Math.PI / 4)],
  4: [...NEAR_EDGE, machine("cable-spool", [1.4, 0, 3.3], 0.4), TERMINAL_ON_TABLE],
};

/** The live models standing in a room of this kind: what the bake takes as shadow casters. */
export function standing(
  kind: string,
  region: RegionId,
): { slug: string; position: [number, number, number]; turn: number; scale: number }[] {
  if (kind === "corridor") return [];
  const out = [];
  const guardian = GUARDIANS[region];
  const place = kind === "observatory" ? GUARDIAN_AT[region] : SIDE_PLACE(region);
  if (place) out.push({ slug: guardian.slug, position: place.at, turn: place.turn, scale: guardian.scale });
  const dressing = kind === "observatory" ? DRESSING_AT[region] : undefined;
  if (dressing)
    out.push({
      slug: dressing.slug,
      position: dressing.position,
      turn: dressing.turn ?? 0,
      scale: dressing.scale ?? 1,
    });
  if (kind === "observatory")
    for (const m of MACHINES_AT[region] ?? [])
      out.push({ slug: m.slug, position: m.position, turn: m.turn ?? 0, scale: m.scale ?? 1 });
  return out;
}
