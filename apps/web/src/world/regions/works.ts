import type { BufferGeometry } from "three";
import { type CorridorDressing, corridorFloor } from "../corridor/frame";
import { FLOORS, makeEarth, makeFlagstones } from "../kit/floor";
import type { Extra, Placement } from "../kit/StaticRoom";
import { addTo, ball, box, extras, gearGeometry, onWall, pipe, ring, rod, type V3 } from "../kit/shapes";
import type { KitPlacement } from "../kits/placement";
import { MOON_POSITION, MOON_TARGET } from "../moon";
import type { Beams, Wall as DoorWall, Gear, Glow } from "../room/layout";

/** The two walls a room has (the near edge, 0111, has no wall to dress). */
type Wall = Exclude<DoorWall, "front">;

// Region 2, the Sorting Works (world/art-briefs/region-2-sorting-works.md): a clockwork workshop of
// brass, gears and pipes, where the sorting machines learned where everyone lived.
// Built in layers:
// 1. Shell: the Medieval Village kit's fieldstone walls (3.1 m, timber-capped), with human-sized
//    doorways where the machine's doors are, each in a riveted iron frame; riveted iron plating
//    along the foot of every wall (boiler plate, not panelling: the room is machinery, not a home);
//    the slate floor is made in code (kit/floor.ts) and stays slate when restored.
// 2. Structure: one great gear train set into a wall in every room (the brief's "gear trains in the
//    walls", the region's signature), the sorters' cabinet of tiny drawers (their card index), the
//    sorting bench with its tray of blank brass tiles and its stamping press, copper pipes with valves
//    and gauges, riveted hatches; one turret base as a gearbox where a pipe goes into the floor
//    (machinery, never a figure).
// 3. Light: caged work lamps on brackets, part of the machinery (`glows`); in ruin, cold grey
//    daylight falling in from high skylights (shafts, `beams`).
// 4. Life: the gear trains turn once the room is restored (Gears.tsx), slowly.
// A left world (0052): the machine hall's own structure and machinery; no bookcases, chairs, candles
// or anything that says someone still works here. Amber lives only in the brass, the copper and the
// lamps; the stone and the slate stay near neutral.
// Ruin: seized gears, cold grey daylight, tarnished metal. Restored: amber lamplight, warm brass.

const QUARTER = Math.PI / 2;
const LAMP = "#F5A04A";
const HALL = "region-2/hall";
const PROPS = "region-2/props";
const TURRETS = "region-2/turrets";

type Bag = Record<string, BufferGeometry[]>;

export function worksFloor(seed: number): Extra[] {
  return [
    { name: "Floor", geometry: makeFlagstones({ size: 8.4, seed, ...FLOORS[2] }) },
    { name: "Earth", geometry: makeEarth(8.4) },
  ];
}

/**
 * Cold grey daylight from high skylights beyond the walls (brief: "grey daylight" in ruin), falling the
 * way the baked outside light does; faint once the lamps are lit.
 */
function daylight(list: Beams["list"]): Beams {
  return {
    list,
    direction: [
      MOON_TARGET[0] - MOON_POSITION[0],
      MOON_TARGET[1] - MOON_POSITION[1],
      MOON_TARGET[2] - MOON_POSITION[2],
    ],
    colour: "#AAB2BC",
    ruined: 0.2,
    restored: 0.03,
    pools: true,
  };
}

// ---------------------------------------------------------------------------------------------------
// Kit pieces against the walls

/**
 * A kit piece set against a wall: `local` is in the wall's frame (x along the wall as the back wall
 * runs, y up, z out into the room from the wall face at −4), turned with the wall. On the left wall
 * local x runs toward −z (a quarter turn), which only matters for pieces that aren't symmetric.
 */
function onWallKit(
  kit: string,
  piece: string,
  wall: Wall,
  along: number,
  local: V3,
  extra: Omit<KitPlacement, "kit" | "piece" | "position"> = {},
): KitPlacement {
  const [lx, ly, lz] = local;
  const position: V3 = wall === "back" ? [along + lx, ly, -4 + lz] : [-4 + lz, ly, along - lx];
  const turn = wall === "back" ? 0 : QUARTER;
  return { kit, piece, position, rotationY: turn + (extra.rotationY ?? 0), ...withoutTurn(extra) };
}

function withoutTurn(extra: Omit<KitPlacement, "kit" | "piece" | "position">) {
  const { rotationY: _, ...rest } = extra;
  return rest;
}

// The village walls' face is 0.09 m in front of their pivot; set back so the face is on the wall
// line (−4), where the code-made plating, pipes and gears expect it.
const WALL_FACE = 0.09;

/**
 * One wall, from `from` to `to` (along it), in 2 m village wall pieces: a doorway piece centred on
 * each door, plain pieces filling between, laid outward from the doors. Where a gap is shorter than a
 * piece, the last piece is set flush with the gap's end and a little further back, behind its
 * neighbour (the kit has no half walls).
 */
function wallRun(wall: Wall, from: number, to: number, doors: number[]): KitPlacement[] {
  const out: KitPlacement[] = [];
  const put = (piece: string, centre: number, back = 0) =>
    out.push(onWallKit(HALL, piece, wall, centre, [0, 0, -WALL_FACE - back]));
  const sorted = [...doors].sort((a, b) => a - b);
  for (const d of sorted) put(FLAT.piece, d);
  const edges = [from, ...sorted.flatMap((d) => [d - 1, d + 1]), to];
  for (let i = 0; i < edges.length; i += 2) {
    const a = edges[i] as number;
    const b = edges[i + 1] as number;
    if (b - a < 0.01) continue;
    // Lay from the door side (a seam beside a doorway shows; one at the wall's end doesn't); with no
    // door, from the open end, so the pieces sit on the 2 m grid (centres at ±1, ±3).
    const fromB = i === 0;
    const n = Math.floor((b - a) / 2 + 1e-6);
    for (let k = 0; k < n; k++) {
      const centre = fromB ? b - 1 - 2 * k : a + 1 + 2 * k;
      put("Wall_UnevenBrick_Straight", centre);
    }
    if (b - a - 2 * n > 0.01) put("Wall_UnevenBrick_Straight", fromB ? a + 1 : b - 1, 0.025);
  }
  return out;
}

/** A cabinet of tiny drawers (the sorters' card index): drawer blocks stacked on a low cabinet. */
function drawerCabinet(wall: Wall, along: number, rows = 3): KitPlacement[] {
  const out = [onWallKit(PROPS, "Cabinet", wall, along, [0, 0, 0.19])];
  // Workbench_Drawers is modelled sitting on the workbench: its block's centre is off its pivot.
  const [ox, oy, oz] = [0.516, 1.0055, -0.3455];
  const [w, h] = [0.426, 0.244];
  for (let c = 0; c < 3; c++)
    for (let r = 0; r < rows; r++) {
      const centre: V3 = [(c - 1) * w, 1.0 + h / 2 + r * h, 0.165];
      out.push(onWallKit(PROPS, "Workbench_Drawers", wall, along, [centre[0] - ox, centre[1] - oy, centre[2] - oz]));
    }
  return out;
}

/**
 * The sorting bench: a workbench against the wall with its drawer block; on it a tray of blank brass
 * tiles waiting to be stamped with names (the MAC board's tiles) and a small stamping press.
 */
function sortingBench(bag: Bag, wall: Wall, along: number): KitPlacement[] {
  const top = 0.9;
  // The tray and its tiles, toward the bench's left end.
  addTo(bag, "DarkMetal", onWall(box([0.5, 0.03, 0.32], [0, 0, 0]), wall, along - 0.45, top + 0.015, 0.62));
  for (let k = 0; k < 6; k++) {
    const [dx, dz] = [((k % 3) - 1) * 0.14, Math.floor(k / 3) * 0.13 - 0.065];
    addTo(bag, "Brass", onWall(box([0.11, 0.018, 0.09], [dx, 0, dz]), wall, along - 0.45, top + 0.04, 0.62));
  }
  // Two loose tiles beside the tray, one stamped (a dark line of name).
  addTo(bag, "Brass", onWall(box([0.11, 0.018, 0.09], [0, 0, 0], [0, 0.4, 0]), wall, along - 0.05, top + 0.01, 0.75));
  addTo(
    bag,
    "DarkMetal",
    onWall(box([0.07, 0.004, 0.012], [0, 0, 0], [0, 0.4, 0]), wall, along - 0.05, top + 0.02, 0.75),
  );
  // The stamping press: an iron frame, its screw, and a brass handwheel on top.
  const p = (g: BufferGeometry) => onWall(g, wall, along + 0.2, top, 0.55);
  addTo(bag, "Iron", p(box([0.3, 0.05, 0.24], [0, 0.025, 0])));
  for (const x of [-0.12, 0.12]) addTo(bag, "Iron", p(box([0.04, 0.42, 0.06], [x, 0.24, 0])));
  addTo(bag, "Iron", p(box([0.3, 0.06, 0.08], [0, 0.46, 0])));
  addTo(bag, "DarkMetal", p(rod([0, 0.12, 0], [0, 0.56, 0], 0.018, 6)));
  addTo(bag, "Iron", p(box([0.12, 0.05, 0.1], [0, 0.14, 0])));
  addTo(bag, "Brass", p(ring([0, 0.6, 0], 0.11, 0.014, "y", 14)));
  addTo(bag, "Brass", p(box([0.22, 0.016, 0.016], [0, 0.6, 0])));
  return [
    onWallKit(PROPS, "Workbench", wall, along, [0, 0, 0.53]),
    onWallKit(PROPS, "Workbench_Drawers", wall, along, [0, 0, 0.53]),
  ];
}

// ---------------------------------------------------------------------------------------------------
// Code-made pieces (the Works' own machinery)

/** Where a point `d` along from `along` lands on a wall's own axis (the left wall's local x runs to −z). */
function alongAt(wall: Wall, along: number, d: number): number {
  return wall === "back" ? along + d : along - d;
}

/**
 * Riveted iron plating along the foot of a wall, from `from` to `to`: plates with a raised strap and a
 * column of brass rivets at each seam, a brass rail along the top and a dark kick at the floor.
 */
function ironDado(bag: Bag, wall: Wall, from: number, to: number, height = 0.95) {
  const length = to - from;
  if (length < 0.2) return;
  const mid = (from + to) / 2;
  addTo(bag, "Iron", onWall(box([length, height, 0.04], [0, height / 2, 0.02]), wall, mid, 0));
  addTo(bag, "DarkMetal", onWall(box([length, 0.09, 0.06], [0, 0.045, 0.03]), wall, mid, 0));
  addTo(bag, "Brass", onWall(box([length, 0.05, 0.07], [0, 0, 0]), wall, mid, height + 0.02, 0.035));
  const n = Math.max(1, Math.round(length / 1.15));
  for (let k = 0; k <= n; k++) {
    // The seams; the end straps sit just inside the run's ends.
    const at = from + 0.05 + ((length - 0.1) * k) / n;
    addTo(bag, "Iron", onWall(box([0.07, height - 0.1, 0.02], [0, (height - 0.1) / 2 + 0.09, 0.05]), wall, at, 0));
    for (const y of [0.25, 0.52, 0.79]) addTo(bag, "Brass", onWall(ball([0, 0, 0], 0.016, 5), wall, at, y, 0.065));
  }
}

/** The runs of plating along a wall, around its doorways (`doors`: where each doorway is centred). */
function ironDadoAround(bag: Bag, wall: Wall, doors: number[], from = -3.95, to = 3.95) {
  let a = from;
  for (const d of [...doors].sort((x, y) => x - y)) {
    ironDado(bag, wall, a, d - 0.8);
    a = d + 0.8;
  }
  ironDado(bag, wall, a, to);
}

/** Teeth for a gear of radius r: the same tooth size on every gear, so neighbours mesh. */
const teethFor = (r: number) => Math.max(6, Math.round(r * 30));
/** How far apart two meshing gears' centres are (their teeth reach into each other). */
const reach = (a: number, b: number) => 0.93 * (a + b);

/**
 * A gear train set into a wall (the brief's "gear trains in the walls", the Works' signature): a great
 * wheel at (`along`, `y`), a middle gear meshing with it at angle `a1` (radians in the wall's plane,
 * measured along the wall's own axis: 0 is toward +along, π/2 straight up), and a small gear off the
 * middle one at `a2`. Each sits on a riveted iron disc set into the stone, with a brass axle cap.
 * Seized in ruin, turning once the room is restored (Gears.tsx).
 */
function gearTrain(
  bag: Bag,
  gears: Gear[],
  wall: Wall,
  along: number,
  y: number,
  { size = 1, a1 = 0.6, a2 = -0.6 }: { size?: number; a1?: number; a2?: number } = {},
) {
  const R = 0.62 * size;
  const M = 0.36 * size;
  const S = 0.22 * size;
  const [tR, tM, tS] = [teethFor(R), teethFor(M), teethFor(S)];
  const m: [number, number] = [Math.cos(a1) * reach(R, M), y + Math.sin(a1) * reach(R, M)];
  const s: [number, number] = [m[0] + Math.cos(a2) * reach(M, S), m[1] + Math.sin(a2) * reach(M, S)];
  // The middle gear stands a little proud of the others, so overlapping teeth never fight.
  const list: [number, number, number, number, number, number, number][] = [
    // along offset, y, radius, teeth, spin, out, spokes
    [0, y, R, tR, 1, 0.1, 5],
    [m[0], m[1], M, tM, -tR / tM, 0.17, 4],
    [s[0], s[1], S, tS, tR / tS, 0.1, 0],
  ];
  list.forEach(([d, gy, r, teeth, spin, out, spokes], i) => {
    const at = alongAt(wall, along, d);
    gears.push({ wall, along: at, y: gy, radius: r, teeth, spin, out, spokes });
    // Its iron disc in the wall (each a hair further out than the last, where discs overlap).
    addTo(bag, "Iron", onWall(rod([0, 0, 0], [0, 0, 0.03 + i * 0.006], r * 1.12, 24), wall, at, gy, 0));
    // The axle and its brass cap.
    addTo(bag, "DarkMetal", onWall(rod([0, 0, 0], [0, 0, out + 0.05], r * 0.09 + 0.012, 10), wall, at, gy, 0));
    addTo(bag, "Brass", onWall(rod([0, 0, out + 0.04], [0, 0, out + 0.075], r * 0.16 + 0.015, 12), wall, at, gy, 0));
  });
  // Bolts round the great wheel's disc.
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    const [bx, by] = [Math.cos(a) * R * 1.05, Math.sin(a) * R * 1.05];
    addTo(bag, "Brass", onWall(ball([0, 0, 0], 0.02, 5), wall, alongAt(wall, along, bx), y + by, 0.045));
  }
}

/** A dial gauge (enamel face, brass rim, a needle) on a wall at height y. */
function gauge(bag: Bag, wall: Wall, along: number, y: number, out = 0.1, size = 0.16) {
  addTo(bag, "Enamel", onWall(rod([0, 0, -0.01], [0, 0, 0.01], size * 0.95, 16), wall, along, y, out));
  addTo(bag, "Brass", onWall(ring([0, 0, 0], size, size * 0.14, "z", 16), wall, along, y, out + 0.01));
  addTo(
    bag,
    "DarkMetal",
    onWall(box([0.012, size * 0.85, 0.01], [0, size * 0.25, 0], [0, 0, -0.6]), wall, along, y, out + 0.02),
  );
  // The stub of pipe it reads from.
  if (out > 0.05) addTo(bag, "Copper", onWall(rod([0, -size, -out], [0, -size, 0], 0.025, 8), wall, along, y, out));
}

/** A valve's handwheel on a pipe: a brass ring with a cross of spokes on its stem, facing out of the wall. */
function valve(bag: Bag, wall: Wall, along: number, y: number, out: number, r = 0.13) {
  addTo(bag, "DarkMetal", onWall(rod([0, 0, -0.1], [0, 0, 0.02], 0.025, 8), wall, along, y, out));
  addTo(bag, "Brass", onWall(ring([0, 0, 0.02], r, r * 0.15, "z", 18), wall, along, y, out));
  addTo(bag, "Brass", onWall(box([r * 2, 0.026, 0.02], [0, 0, 0.02]), wall, along, y, out));
  addTo(bag, "Brass", onWall(box([0.026, r * 2, 0.02], [0, 0, 0.02]), wall, along, y, out));
}

/** A caged amber work lamp on a bracket (the Works' own light; relights with the room). */
function lamp(bag: Bag, glows: Glow[], wall: Wall, along: number, y: number, strength = 3.4) {
  addTo(bag, "Brass", onWall(box([0.08, 0.08, 0.32], [0, 0, 0.16]), wall, along, y + 0.18, 0));
  addTo(bag, "Iron", onWall(box([0.14, 0.2, 0.03], [0, 0, 0.015]), wall, along, y + 0.18, 0));
  addTo(bag, "Brass", onWall(box([0.2, 0.04, 0.2], [0, 0, 0]), wall, along, y + 0.17, 0.32));
  addTo(bag, "Brass", onWall(box([0.18, 0.03, 0.18], [0, 0, 0]), wall, along, y - 0.17, 0.32));
  addTo(bag, "LampGlass", onWall(ball([0, 0, 0], 0.11, 12), wall, along, y, 0.32));
  for (const [dx, dz] of [
    [-0.08, -0.08],
    [0.08, -0.08],
    [-0.08, 0.08],
    [0.08, 0.08],
  ] as const) {
    addTo(bag, "DarkMetal", onWall(rod([dx, -0.17, dz], [dx, 0.17, dz], 0.008, 4), wall, along, y, 0.32));
  }
  const p: V3 = wall === "back" ? [along, y, -4 + 0.75] : [-4 + 0.75, y, along];
  glows.push({ position: p, colour: LAMP, strength });
}

/** Copper pipes: points in world space. */
function pipes(bag: Bag, runs: V3[][], radius = 0.06) {
  for (const run of runs) addTo(bag, "Copper", ...pipe(run, radius));
}

/**
 * A relief stub off a pipe: a short copper arm from `from` to `to`, turned up into a brass mouth that
 * steam rises from (regions/Steam.tsx).
 */
function vent(bag: Bag, steam: V3[], from: V3, to: V3) {
  const mouth: V3 = [to[0], to[1] + 0.14, to[2]];
  addTo(bag, "Copper", rod(from, to, 0.032, 8), ball(to, 0.04, 8), rod(to, mouth, 0.032, 8));
  addTo(bag, "Brass", rod(mouth, [mouth[0], mouth[1] + 0.06, mouth[2]], 0.05, 10, 0.06));
  steam.push([mouth[0], mouth[1] + 0.1, mouth[2]]);
}

/** Iron straps holding a pipe `out` from a wall, at each of `at` along it, at height y. */
function brackets(bag: Bag, wall: Wall, at: number[], y: number, out: number) {
  for (const a of at) {
    addTo(bag, "Iron", onWall(box([0.05, 0.05, out], [0, 0, out / 2]), wall, a, y, 0));
    addTo(bag, "Iron", onWall(box([0.12, 0.16, 0.025], [0, 0, 0.012]), wall, a, y, 0));
  }
}

/** A round riveted hatch in a wall (an inspection door into the machinery). */
function hatch(bag: Bag, wall: Wall, along: number, y: number, radius = 0.32) {
  addTo(bag, "Iron", onWall(rod([0, 0, 0], [0, 0, 0.05], radius, 20), wall, along, y, 0.0));
  addTo(bag, "Brass", onWall(ring([0, 0, 0.05], radius, 0.025, "z", 24), wall, along, y, 0.0));
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    addTo(
      bag,
      "Brass",
      onWall(ball([Math.cos(a) * radius * 0.85, Math.sin(a) * radius * 0.85, 0.06], 0.016, 5), wall, along, y, 0),
    );
  }
  // Its dogging handle: a bar across, and the hinge on one side.
  addTo(bag, "Brass", onWall(box([radius * 1.1, 0.05, 0.04], [0, 0, 0.08]), wall, along, y, 0));
  addTo(bag, "DarkMetal", onWall(box([0.06, radius * 0.7, 0.06], [-radius - 0.02, 0, 0.04]), wall, along, y, 0));
}

/** A dial-style link light beside a door (region-2 brief): an enamel dial with a lamp eye. */
function doorDial(bag: Bag, wall: Wall, along: number, y: number) {
  addTo(bag, "Brass", onWall(rod([0, 0, 0], [0, 0, 0.05], 0.13, 16), wall, along, y, 0));
  addTo(bag, "Enamel", onWall(rod([0, 0, 0.05], [0, 0, 0.06], 0.1, 16), wall, along, y, 0));
  addTo(bag, "DarkMetal", onWall(box([0.012, 0.08, 0.01], [0.02, 0.03, 0.07], [0, 0, -0.5]), wall, along, y, 0));
  addTo(bag, "LampGlass", onWall(ball([0, -0.19, 0.04], 0.035, 8), wall, along, y, 0));
}

/**
 * A riveted iron-and-brass frame round a doorway in a village wall (the brief's riveted hatches):
 * posts either side of the opening, a brass lintel plate over it. `half` is half the opening's width.
 */
function doorFrame(bag: Bag, wall: Wall, at: number, half: number, height: number) {
  for (const x of [-half - 0.06, half + 0.06]) {
    addTo(bag, "Iron", onWall(box([0.13, height, 0.12], [x, height / 2, 0.06]), wall, at, 0));
    for (let y = 0.25; y < height - 0.1; y += 0.38)
      addTo(bag, "Brass", onWall(ball([x, y, 0.13], 0.022, 6), wall, at, 0));
  }
  addTo(bag, "Brass", onWall(box([half * 2 + 0.36, 0.14, 0.14], [0, height + 0.07, 0.07]), wall, at, 0));
  for (const x of [-0.45, -0.15, 0.15, 0.45].map((k) => k * half * 1.6))
    addTo(bag, "DarkMetal", onWall(ball([x, height + 0.07, 0.15], 0.022, 6), wall, at, 0));
}

// The village doorway, measured: Wall_UnevenBrick_Door_Flat opens 1.2 × 2.12 m (square, so the
// riveted frame sits flush round it).
const FLAT = { piece: "Wall_UnevenBrick_Door_Flat", half: 0.6, height: 2.12 };

function rotated(g: BufferGeometry, at: V3, euler: V3): BufferGeometry {
  return g
    .rotateX(euler[0])
    .rotateY(euler[1])
    .rotateZ(euler[2])
    .translate(...at);
}

// ---------------------------------------------------------------------------------------------------
// The Observatory (the Knight's corner of the Works)
//
// Gameplay keeps the middle: the keeper in front of the door, the workbench front left, the address
// card right of the door, the Glass front right. The great gear train is on the back wall left of the
// door; the card index right of it; the sorters' emblem and a smaller train on the left wall.

/** The Ruins kit pieces the Observatory keeps here: only the brick on the Knight's letter. */
export function worksObservatoryPieces(_secondDoor: boolean): Placement[] {
  return [{ piece: "Brick", position: [1.75, 0, 2.55], rotationY: 2.0 }];
}

export function worksObservatory(secondDoor: boolean) {
  const bag: Bag = {};
  const glows: Glow[] = [];
  const gears: Gear[] = [];
  const steam: V3[] = [];
  const kitPieces: KitPlacement[] = [
    ...wallRun("back", -4, 4, [0]),
    ...wallRun("left", -4.4, 4, secondDoor ? [2] : []),
    // The sorters' card index right of the door.
    ...drawerCabinet("back", 2.95),
    // A gearbox where the riser pipe goes into the floor.
    { kit: TURRETS, piece: "Base", position: [-3.5, 0, -3.5], scale: 0.42, rotationY: 0.3 },
  ];
  doorFrame(bag, "back", 0, FLAT.half, FLAT.height);
  if (secondDoor) doorFrame(bag, "left", 2, FLAT.half, FLAT.height);
  ironDadoAround(bag, "back", [0], -3.6);
  ironDadoAround(bag, "left", secondDoor ? [2] : [], -3.6);
  // The great gear train, left of the door, its middle gear climbing toward the door.
  gearTrain(bag, gears, "back", -2.5, 1.7, { a1: 0.7, a2: -0.25 });
  pipes(bag, [
    // Up from the gearbox in the back corner, along the left wall high, down to the floor.
    [
      [-3.72, 0.2, -3.72],
      [-3.72, 2.85, -3.72],
      [-3.72, 2.85, -0.35],
      [-3.72, 0.0, -0.35],
    ],
    // Along the back wall right of the door, high, over the card index.
    [
      [1.05, 0.0, -3.86],
      [1.05, 2.75, -3.86],
      [3.95, 2.75, -3.86],
    ],
  ]);
  brackets(bag, "left", [-2.2, -1.1], 2.85, 0.22);
  brackets(bag, "back", [2.2, 3.4], 2.75, 0.08);
  valve(bag, "left", -0.35, 1.15, 0.36);
  vent(bag, steam, [-3.72, 1.75, -0.35], [-3.5, 1.75, -0.35]);
  gauge(bag, "left", -1.0, 2.35, 0.24, 0.13);
  gauge(bag, "back", 3.55, 2.4, 0.12, 0.11);
  // The left wall's middle carries the sorters' emblem (0091) and, nearer the front, the Knight's corner.
  // A smaller train over the workbench, where the left wall has room.
  gearTrain(bag, gears, "left", 1.5, 2.05, { size: 0.62, a1: 2.3, a2: 2.6 });
  lamp(bag, glows, "back", -3.25, 2.5, 3.0);
  lamp(bag, glows, "left", 0.95, 2.15, 3.2);
  // A great gear fallen from a train, leaning against the card index.
  addTo(bag, "Brass", rotated(gearGeometry(0.42, 12, 0.07, 5), [1.95, 0.42, -3.45], [-0.25, 0.4, 0.2]));
  return {
    placements: worksObservatoryPieces(secondDoor),
    kitPieces,
    extras: [...worksFloor(1103), ...extras(bag)],
    glows,
    gears,
    steam,
    beams: daylight([
      { from: [-4, 3.1, -1.2], width: 1.1, depth: 0.8 },
      { from: [-1.2, 3.1, -4], width: 1.0, depth: 0.7 },
    ]),
  };
}

// ---------------------------------------------------------------------------------------------------
// Another computer's room: a small workshop bay. (Its right-hand side, the rug and the name plaque
// are the house's own: house/Traits.tsx; its boards stand front left and front right.)

export function worksHouse() {
  const bag: Bag = {};
  const glows: Glow[] = [];
  const gears: Gear[] = [];
  const steam: V3[] = [];
  const kitPieces: KitPlacement[] = [
    ...wallRun("back", -4, 4, []), // whole: the door is on the near edge (0111)
    ...wallRun("left", -4.4, 4, []),
    ...drawerCabinet("back", -2.6, 2),
    ...sortingBench(bag, "left", -1.75),
  ];
  doorFrame(bag, "back", 0, FLAT.half, FLAT.height);
  ironDadoAround(bag, "back", [0], -3.95);
  ironDadoAround(bag, "left", [], -3.6);
  pipes(bag, [
    [
      [-3.85, 0.0, -0.45],
      [-3.85, 2.85, -0.45],
      [-3.85, 2.85, -3.85],
      [-1.2, 2.85, -3.85],
    ],
  ]);
  brackets(bag, "left", [-2.4], 2.85, 0.1);
  valve(bag, "left", -0.45, 1.3, 0.24, 0.11);
  vent(bag, steam, [-3.85, 1.85, -0.45], [-3.62, 1.85, -0.45]);
  gauge(bag, "back", -1.55, 2.75, 0.12, 0.1);
  // The gear train where the left wall is open, over the front of the room.
  gearTrain(bag, gears, "left", 1.2, 1.75, { size: 0.9, a1: 1.0, a2: -0.3 });
  lamp(bag, glows, "back", 2.6, 2.3);
  lamp(bag, glows, "left", -1.75, 2.45, 2.6);
  hatch(bag, "back", 2.6, 1.4, 0.3);
  return {
    placements: [] as Placement[],
    kitPieces,
    extras: [...worksFloor(2207), ...extras(bag)],
    glows,
    gears,
    steam,
    beams: daylight([{ from: [-4, 3.1, -0.6], width: 1.0, depth: 0.8 }]),
  };
}

// ---------------------------------------------------------------------------------------------------
// The sorting hall (a switch): doors in riveted iron frames, each with its dial-style link light;
// the great gear train in the left wall's back bay; the card index and the sorting bench where there
// is wall. (4.B's warning lamps stand on the wall tops at ±2: room/BossPiece.tsx; 3.B's tubes run
// along the top of both walls.)

export function worksHall(used: { wall: Wall; at: number }[]) {
  const bag: Bag = {};
  const glows: Glow[] = [];
  const gears: Gear[] = [];
  const steam: V3[] = [];
  const door = (wall: Wall, at: number) => used.some((s) => s.wall === wall && s.at === at);
  const doorsOn = (wall: Wall) => used.filter((s) => s.wall === wall).map((s) => s.at);
  const kitPieces: KitPlacement[] = [
    ...wallRun("back", -4, 4, doorsOn("back")),
    ...wallRun("left", -4.4, 4, doorsOn("left")),
  ];
  for (const s of used) {
    doorFrame(bag, s.wall, s.at, FLAT.half, FLAT.height);
    // Its link light on the stone between it and the next bay.
    if (s.at < 3) doorDial(bag, s.wall, s.at + 1.0, 1.75);
  }
  ironDadoAround(bag, "back", doorsOn("back"), -3.6);
  ironDadoAround(bag, "left", doorsOn("left"), -3.6);
  // Where there's wall: the card index, the great gear train, the sorting bench.
  if (!door("back", -1)) {
    kitPieces.push(...drawerCabinet("back", -1.0));
    lamp(bag, glows, "back", -1.0, 2.5, 3.2);
  }
  if (!door("left", -3)) hatch(bag, "left", -2.9, 1.35, 0.32);
  if (!door("back", 3)) {
    kitPieces.push(...sortingBench(bag, "back", 3.0));
    lamp(bag, glows, "back", 3.0, 2.3, 3.0);
  }
  if (!door("left", 1)) {
    gearTrain(bag, gears, "left", 0.2, 1.5, { size: 0.85, a1: 2.6, a2: 1.45 });
    lamp(bag, glows, "left", 1.6, 2.15, 3.0);
  }
  // A copper main along the top of both walls, held off the stone, and a riser in the back corner.
  pipes(
    bag,
    [
      [
        [3.95, 2.92, -3.86],
        [-3.86, 2.92, -3.86],
        [-3.86, 2.92, 3.95],
      ],
    ],
    0.055,
  );
  pipes(
    bag,
    [
      [
        [-3.72, 0, -3.72],
        [-3.72, 2.92, -3.72],
      ],
    ],
    0.07,
  );
  valve(bag, "back", -3.72, 1.2, 0.4, 0.12);
  vent(bag, steam, [-3.72, 1.8, -3.72], [-3.45, 1.8, -3.72]);
  gauge(bag, "back", -3.2, 2.35, 0.12, 0.11);
  return {
    placements: [] as Placement[],
    kitPieces,
    extras: [...worksFloor(3301), ...extras(bag)],
    glows,
    gears,
    steam,
    beams: daylight([{ from: [-4, 3.1, 0.3], width: 1.1, depth: 0.8 }]),
  };
}

// ---------------------------------------------------------------------------------------------------
// A corridor (0081): a workshop passage (region-2 brief: riveted pipes, the rune-line in a channel).
// Fieldstone over riveted iron plating, two copper pipes along the top on iron straps with a riser and
// its valve, a gear train in the middle, gauges, caged lamps; the cable runs between two copper rails.
// Room coordinates: back wall on z = −4, x from −half to half.

export function worksCorridor(half = 5): CorridorDressing {
  const bag: Bag = {};
  const glows: Glow[] = [];
  const gears: Gear[] = [];
  const steam: V3[] = [];
  const kitPieces = wallRun("back", -half, half, []);
  ironDado(bag, "back", -half, half);
  pipes(bag, [
    [
      [-half, 2.78, -3.86],
      [half, 2.78, -3.86],
    ],
    [
      [-3.3, 0, -3.8],
      [-3.3, 2.5, -3.8],
      [half, 2.5, -3.8],
    ],
  ]);
  brackets(bag, "back", [-4.2, -2.4, 2.4, 4.2], 2.78, 0.08);
  brackets(bag, "back", [-1.5, 3.3], 2.5, 0.14);
  valve(bag, "back", -3.3, 1.2, 0.36);
  vent(bag, steam, [-3.3, 1.75, -3.8], [-3.3, 1.75, -3.52]);
  gauge(bag, "back", -2.5, 2.05, 0.12, 0.13);
  gauge(bag, "back", 2.4, 2.0, 0.12, 0.1);
  gearTrain(bag, gears, "back", 0.4, 1.55, { size: 0.75, a1: 0.7, a2: -0.4 });
  lamp(bag, glows, "back", -1.5, 2.1, 2.6);
  lamp(bag, glows, "back", 3.3, 2.1, 2.6);
  hatch(bag, "back", 4.1, 1.45, 0.3);
  // The channel the cable runs in: two copper rails along the floor.
  for (const z of [-2.34, -2.06]) addTo(bag, "Copper", rod([-half + 0.3, 0.05, z], [half - 0.3, 0.05, z], 0.025, 6));
  return {
    placements: [{ piece: "Brick", position: [3.6, 0, -0.9], rotationY: 1.1 }],
    kitPieces,
    extras: [...corridorFloor(2, "Floor", 5201, half), ...extras(bag)],
    glows,
    gears,
    steam,
  };
}
