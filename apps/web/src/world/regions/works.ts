import type { BufferGeometry } from "three";
import { FLOORS, makeEarth, makeFlagstones } from "../kit/floor";
import type { Extra, Placement } from "../kit/StaticRoom";
import { addTo, ball, box, extras, gearGeometry, onWall, pipe, ring, rod, type V3 } from "../kit/shapes";
import type { KitPlacement } from "../kits/placement";
import type { Gear, Glow, Wall } from "../room/layout";

// Region 2, the Sorting Works (world/art-briefs/region-2-sorting-works.md): a clockwork workshop of
// brass, gears and pipes, where the sorting machines learned where everyone lived.
// Built in layers:
// 1. Shell: the Medieval Village kit's fieldstone walls (3.1 m, timber-capped), with human-sized
//    doorways where the machine's doors are; the slate floor is made in code (kit/floor.ts).
// 2. Structure: the sorters' furniture from the Fantasy Props kit, a few strong pieces per room: a
//    cabinet of tiny drawers (Workbench_Drawers stacked on a cabinet), shelves of ledgers, a sorting
//    bench; one turret base as a gearbox where a pipe goes into the floor (machinery, never a figure).
// 3. Light: caged amber lamps (code) and the kit's hanging lantern, lit when restored (`glows`).
// 4. Life: brass gear trains that turn when restored (Gears.tsx), copper pipes with gauges, message
//    tubes, riveted hatches, dial-style link lights by the hall doors (all code-made: no kit does them).
// A left world (0052): the machine hall's own structure and machinery, its records left on the
// shelves; nothing that says someone still works here (no chairs pulled out, no lit candles).
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
// line (−4), where the code-made panelling, pipes and gears expect it.
const WALL_FACE = 0.09;

/**
 * One wall, from `from` to `to` (along it), in 2 m village wall pieces: a doorway piece centred on
 * each door, plain pieces filling between, laid outward from the doors. Where a gap is shorter than a
 * piece, the last piece is set flush with the gap's end and a little further back, behind its
 * neighbour (the kit has no half walls).
 */
function wallRun(
  wall: Wall,
  from: number,
  to: number,
  doors: { at: number; piece: string }[],
  plain: (centre: number) => string,
): KitPlacement[] {
  const out: KitPlacement[] = [];
  const put = (piece: string, centre: number, back = 0) =>
    out.push(onWallKit(HALL, piece, wall, centre, [0, 0, -WALL_FACE - back]));
  const sorted = [...doors].sort((a, b) => a.at - b.at);
  for (const d of sorted) put(d.piece, d.at);
  const edges = [from, ...sorted.flatMap((d) => [d.at - 1, d.at + 1]), to];
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
      put(plain(centre), centre);
    }
    if (b - a - 2 * n > 0.01) {
      const centre = fromB ? a + 1 : b - 1;
      put(plain(centre), centre, 0.025);
    }
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
  out.push(onWallKit(PROPS, "Book_Stack_1", wall, along, [0.35, 1.0 + rows * h, 0.17], { rotationY: 0.3 }));
  return out;
}

/** A tall bookcase of ledgers, its shelves full (the hall's records). */
function ledgerCase(wall: Wall, along: number): KitPlacement[] {
  const out = [onWallKit(PROPS, "Bookcase_2", wall, along, [0, 0, 0.22])];
  // Shelf tops measured at 0.76, 1.16, 1.54 and 1.92 m; the lowest holds a stack and a gap.
  const rows = ["BookGroup_Medium_1", "BookGroup_Medium_3", "BookGroup_Medium_2"];
  [1.16, 1.54, 1.92].forEach((y, i) => {
    out.push(onWallKit(PROPS, rows[i] as string, wall, along, [0.02, y, 0.27]));
  });
  out.push(onWallKit(PROPS, "BookGroup_Small_1", wall, along, [-0.4, 0.765, 0.25]));
  out.push(onWallKit(PROPS, "Book_Stack_1", wall, along, [0.3, 0.765, 0.25], { rotationY: -0.2 }));
  return out;
}

/** A hanging shelf of ledgers on the wall, its lowest board at `y`. */
function ledgerShelf(wall: Wall, along: number, y: number): KitPlacement[] {
  // Shelf_Arch's boards are at −0.42, 0.12 and 0.64 from its pivot.
  const pivot = y + 0.42;
  return [
    onWallKit(PROPS, "Shelf_Arch", wall, along, [0, pivot, 0.0]),
    onWallKit(PROPS, "BookGroup_Medium_1", wall, along, [0.02, pivot - 0.42, 0.19]),
    onWallKit(PROPS, "BookGroup_Small_1", wall, along, [-0.3, pivot + 0.12, 0.17]),
    onWallKit(PROPS, "Book_Stack_2", wall, along, [0.25, pivot + 0.12, 0.17], { rotationY: 0.4 }),
    onWallKit(PROPS, "BookGroup_Medium_2", wall, along, [0.0, pivot + 0.64, 0.19]),
  ];
}

/** The sorting bench: a workbench against the wall with its drawer block, an open ledger, a drawing. */
function sortingBench(wall: Wall, along: number): KitPlacement[] {
  return [
    onWallKit(PROPS, "Workbench", wall, along, [0, 0, 0.53]),
    onWallKit(PROPS, "Workbench_Drawers", wall, along, [0, 0, 0.53]),
    onWallKit(PROPS, "Book_7", wall, along, [-0.35, 0.93, 0.6], { rotationY: 0.25 }),
    onWallKit(PROPS, "Scroll_1", wall, along, [-0.75, 0.9, 0.75], { rotationY: -0.4 }),
    onWallKit(PROPS, "Bucket_Metal", wall, along, [0.75, 0, 1.25], { rotationY: 0.8 }),
  ];
}

/**
 * The kit's hanging lantern on its bracket, at `y` (the cage's middle), with an amber glass in its
 * cage (code: the kit lantern is dark iron) and the room light it gives when restored.
 */
function hangingLantern(bag: Bag, glows: Glow[], wall: Wall, along: number, y: number): KitPlacement {
  const s = 0.75;
  // The cage hangs 0.83 m out and 0.38 m up from the piece's pivot (measured).
  const [cageOut, cageUp] = [0.83 * s, 0.38 * s];
  addTo(bag, "LampGlass", onWall(ball([0, 0, 0], 0.07, 10), wall, along, y, cageOut));
  const p: V3 = wall === "back" ? [along, y, -4 + cageOut + 0.2] : [-4 + cageOut + 0.2, y, along];
  glows.push({ position: p, colour: LAMP, strength: 3.2 });
  return onWallKit(PROPS, "Lantern_Wall", wall, along, [0, y - cageUp, 0], { scale: s });
}

// ---------------------------------------------------------------------------------------------------
// Code-made pieces (the Works' own machinery)

/** A run of walnut wainscot along a wall, from `from` to `to`, with a riveted brass rail on top. */
function wainscot(bag: Bag, wall: Wall, from: number, to: number) {
  const length = to - from;
  const mid = (from + to) / 2;
  const panel = box([length, 0.95, 0.05], [0, 0.475, 0.025]);
  addTo(bag, "Walnut", onWall(panel, wall, mid, 0, 0.0));
  // Raised panels, each with its own frame line and a brass rivet at its corners.
  for (let a = from + 0.1; a + 0.6 <= to - 0.05; a += 0.7) {
    addTo(bag, "Walnut", onWall(box([0.58, 0.6, 0.03], [0, 0, 0]), wall, a + 0.29, 0.45, 0.06));
    for (const [dx, y] of [
      [0.04, 0.8],
      [0.54, 0.8],
      [0.04, 0.1],
      [0.54, 0.1],
    ] as const)
      addTo(bag, "Brass", onWall(ball([0, 0, 0], 0.014, 5), wall, a + dx, y, 0.055));
  }
  addTo(bag, "Brass", onWall(box([length, 0.05, 0.08], [0, 0, 0]), wall, mid, 0.97, 0.04));
}

/** A dial gauge (enamel face, brass rim, a needle) on a wall at height y. */
function gauge(bag: Bag, wall: Wall, along: number, y: number, out = 0.1, size = 0.16) {
  addTo(
    bag,
    "Enamel",
    onWall(box([size * 1.5, size * 1.5, 0.02], [0, 0, 0], [0, 0, QUARTER / 2]), wall, along, y, out),
  );
  addTo(bag, "Brass", onWall(ring([0, 0, 0], size, size * 0.14, "z", 16), wall, along, y, out + 0.01));
  addTo(
    bag,
    "DarkMetal",
    onWall(box([0.012, size * 0.85, 0.01], [0, size * 0.25, 0], [0, 0, -0.6]), wall, along, y, out + 0.02),
  );
}

/** A caged amber lamp on a bracket (the Works' own light; relights with the room). */
function lamp(bag: Bag, glows: Glow[], wall: Wall, along: number, y: number, strength = 3.4) {
  addTo(bag, "Brass", onWall(box([0.08, 0.08, 0.32], [0, 0, 0.16]), wall, along, y + 0.18, 0));
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

/** A round riveted hatch in a wall (an inspection door into the machinery). */
function hatch(bag: Bag, wall: Wall, along: number, y: number, radius = 0.32) {
  addTo(bag, "DarkMetal", onWall(rod([0, 0, 0], [0, 0, 0.05], radius, 20), wall, along, y, 0.0));
  addTo(bag, "Brass", onWall(ring([0, 0, 0.05], radius, 0.025, "z", 24), wall, along, y, 0.0));
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    addTo(
      bag,
      "Brass",
      onWall(ball([Math.cos(a) * radius * 0.85, Math.sin(a) * radius * 0.85, 0.06], 0.016, 5), wall, along, y, 0),
    );
  }
  addTo(bag, "Brass", onWall(box([radius * 1.1, 0.05, 0.04], [0, 0, 0.08]), wall, along, y, 0));
}

/** Pneumatic message tubes: thin brass-collared tubes with junction boxes where they turn. */
function tubes(bag: Bag, runs: V3[][]) {
  for (const run of runs) {
    for (let i = 0; i < run.length - 1; i++) addTo(bag, "Copper", rod(run[i] as V3, run[i + 1] as V3, 0.04, 8));
    for (let i = 1; i < run.length - 1; i++) addTo(bag, "Brass", box([0.14, 0.14, 0.14], run[i] as V3));
    const end = run[run.length - 1] as V3;
    addTo(bag, "Brass", ball(end, 0.07, 8));
  }
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
    addTo(bag, "DarkMetal", onWall(box([0.13, height, 0.12], [x, height / 2, 0.06]), wall, at, 0));
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

// ---------------------------------------------------------------------------------------------------
// The Observatory (the Knight's corner of the Works)

/** The Ruins kit pieces the Observatory keeps here: only the brick on the Knight's letter. */
export function worksObservatoryPieces(_secondDoor: boolean): Placement[] {
  return [{ piece: "Brick", position: [1.75, 0, 2.55], rotationY: 2.0 }];
}

export function worksObservatory(secondDoor: boolean) {
  const bag: Bag = {};
  const glows: Glow[] = [];
  const kitPieces: KitPlacement[] = [
    // Shell: the door in the back wall, a window high in the left wall where its first bay is.
    ...wallRun("back", -4, 4, [{ at: 0, piece: FLAT.piece }], () => "Wall_UnevenBrick_Straight"),
    ...wallRun("left", -4.4, 4, secondDoor ? [{ at: 2, piece: FLAT.piece }] : [], (c) =>
      Math.abs(c + 3) < 0.01 ? "Wall_UnevenBrick_Window_Wide_Round" : "Wall_UnevenBrick_Straight",
    ),
    onWallKit(HALL, "WindowShutters_Wide_Round_Closed", "left", -3, [0, 0, -WALL_FACE - 0.13]),
    // The sorters' card index by the door, the ledgers at the front.
    ...drawerCabinet("back", 2.95),
    ...(secondDoor ? [] : ledgerCase("left", 2.9)),
    // A gearbox where the riser pipe goes into the floor.
    { kit: TURRETS, piece: "Base", position: [-3.5, 0, -3.5], scale: 0.42, rotationY: 0.3 },
  ];
  doorFrame(bag, "back", 0, FLAT.half, FLAT.height);
  if (secondDoor) doorFrame(bag, "left", 2, FLAT.half, FLAT.height);
  wainscot(bag, "back", -3.95, -0.85);
  wainscot(bag, "back", 0.85, 2.15);
  wainscot(bag, "left", -3.95, secondDoor ? 0.85 : 2.1);
  pipes(bag, [
    // Up from the gearbox in the back corner, along the left wall over the window, down to the floor.
    [
      [-3.72, 0.2, -3.72],
      [-3.72, 2.95, -3.72],
      [-3.72, 2.95, -0.35],
      [-3.72, 0.0, -0.35],
    ],
    // Along the back wall right of the door, high, over the cabinet.
    [
      [1.05, 0.0, -3.86],
      [1.05, 2.6, -3.86],
      [3.95, 2.6, -3.86],
    ],
  ]);
  pipes(
    bag,
    [
      [
        [-3.84, 0.0, -3.84],
        [-3.84, 2.7, -3.84],
        [-1.0, 2.7, -3.84],
      ],
    ],
    0.04,
  );
  gauge(bag, "left", -1.4, 2.62, 0.22);
  gauge(bag, "back", 2.3, 2.6, 0.22, 0.12);
  lamp(bag, glows, "back", -2.6, 2.05);
  lamp(bag, glows, "left", 0.3, 2.05);
  tubes(bag, [
    [
      [-3.9, 3.1, -2.0],
      [-3.9, 2.45, -2.0],
      [-3.9, 2.45, -0.9],
    ],
  ]);
  // A great gear fallen from the train, leaning against the cabinet.
  addTo(bag, "Brass", rotated(gearGeometry(0.42, 12, 0.07, 5), [1.95, 0.42, -3.45], [-0.25, 0.4, 0.2]));
  const gears: Gear[] = [
    { wall: "back", along: -1.75, y: 2.55, radius: 0.42, teeth: 12, spin: 1, spokes: 5 },
    { wall: "back", along: -2.62, y: 2.82, radius: 0.26, teeth: 8, spin: -1.62, out: 0.15 },
    { wall: "left", along: -1.0, y: 2.0, radius: 0.24, teeth: 7, spin: 2.27 },
  ];
  return {
    placements: worksObservatoryPieces(secondDoor),
    kitPieces,
    extras: [...worksFloor(1103), ...extras(bag)],
    glows,
    gears,
  };
}

// ---------------------------------------------------------------------------------------------------
// Another computer's room: a small workshop bay. (Its right-hand side and the rug are the house's
// own things: house/Traits.tsx.)

export function worksHouse() {
  const bag: Bag = {};
  const glows: Glow[] = [];
  const kitPieces: KitPlacement[] = [
    ...wallRun("back", -4, 4, [{ at: 0, piece: FLAT.piece }], () => "Wall_UnevenBrick_Straight"),
    ...wallRun("left", -4.4, 4, [], (c) =>
      Math.abs(c - 1) < 0.01 ? "Wall_UnevenBrick_Window_Wide_Round" : "Wall_UnevenBrick_Straight",
    ),
    onWallKit(HALL, "WindowShutters_Wide_Round_Closed", "left", 1, [0, 0, -WALL_FACE - 0.13]),
    ...drawerCabinet("back", -2.6, 2),
    ...sortingBench("left", -1.75),
    ...ledgerShelf("left", -1.75, 1.55),
  ];
  doorFrame(bag, "back", 0, FLAT.half, FLAT.height);
  wainscot(bag, "back", -3.95, -0.85);
  wainscot(bag, "back", 0.85, 3.95);
  wainscot(bag, "left", -3.95, 3.95);
  pipes(bag, [
    [
      [-3.85, 0.0, -0.45],
      [-3.85, 2.85, -0.45],
      [-3.85, 2.85, -3.85],
      [-1.2, 2.85, -3.85],
    ],
  ]);
  gauge(bag, "back", -1.6, 2.45, 0.2, 0.12);
  lamp(bag, glows, "back", 2.6, 2.1);
  hatch(bag, "back", 2.6, 1.35, 0.26);
  const gears: Gear[] = [
    { wall: "back", along: -3.15, y: 2.45, radius: 0.4, teeth: 12, spin: 1, spokes: 5 },
    { wall: "back", along: -2.38, y: 2.62, radius: 0.24, teeth: 7, spin: -1.75, out: 0.14 },
  ];
  return {
    placements: [] as Placement[],
    kitPieces,
    extras: [...worksFloor(2207), ...extras(bag)],
    glows,
    gears,
  };
}

// ---------------------------------------------------------------------------------------------------
// The sorting hall (a switch): doors as riveted hatches in fieldstone walls, gear trains between
// them, the sorters' records along the walls where there's no door.

export function worksHall(used: { wall: Wall; at: number }[]) {
  const bag: Bag = {};
  const glows: Glow[] = [];
  const door = (wall: Wall, at: number) => used.some((s) => s.wall === wall && s.at === at);
  const doorsOn = (wall: Wall) => used.filter((s) => s.wall === wall).map((s) => ({ at: s.at, piece: FLAT.piece }));
  const kitPieces: KitPlacement[] = [
    ...wallRun("back", -4, 4, doorsOn("back"), () => "Wall_UnevenBrick_Straight"),
    ...wallRun("left", -4.4, 4, doorsOn("left"), () => "Wall_UnevenBrick_Straight"),
  ];
  for (const s of used) {
    doorFrame(bag, s.wall, s.at, FLAT.half, FLAT.height);
    // Its link light on the stone between it and the next bay.
    if (s.at < 3) doorDial(bag, s.wall, s.at + 1.0, 1.75);
  }
  // Where there's wall: the card index, a shelf of ledgers, the sorting bench under a lantern.
  if (!door("back", -1)) kitPieces.push(...drawerCabinet("back", -1.0));
  else if (!door("left", 1)) kitPieces.push(...drawerCabinet("left", 1.0));
  if (!door("left", -3)) kitPieces.push(...ledgerShelf("left", -2.35, 1.0));
  if (!door("back", 3)) {
    kitPieces.push(...sortingBench("back", 3.0));
    kitPieces.push(hangingLantern(bag, glows, "back", 3.0, 2.15));
  } else hatch(bag, "left", 1.0, 1.4, 0.3);
  wainscot(bag, "back", -3.95, 3.95);
  wainscot(bag, "left", -3.95, 3.95);
  tubes(bag, [
    [
      [-3.7, 0, 3.6],
      [-3.7, 2.62, 3.6],
      [-3.7, 2.62, -3.6],
      [3.9, 2.62, -3.6],
    ],
  ]);
  // A copper main along the top of both walls, and a riser in the back corner with a gauge.
  pipes(
    bag,
    [
      [
        [3.95, 2.95, -3.86],
        [-3.86, 2.95, -3.86],
        [-3.86, 2.95, 3.95],
      ],
    ],
    0.055,
  );
  pipes(
    bag,
    [
      [
        [-3.75, 0, -3.75],
        [-3.75, 2.95, -3.75],
      ],
    ],
    0.07,
  );
  gauge(bag, "back", -3.85 + 0.45, 1.25, 0.12, 0.11);
  lamp(bag, glows, "back", 0.0, 2.3, 3.4);
  lamp(bag, glows, "left", 0.0, 2.3, 3.4);
  if (door("back", 3)) lamp(bag, glows, "left", 2.0, 2.3, 3.0);
  // Gear trains on the stone between the doorways, above the link lights.
  const gears: Gear[] = [
    { wall: "back", along: -2.0, y: 2.6, radius: 0.36, teeth: 11, spin: 1, spokes: 5, out: 0.08 },
    { wall: "back", along: -1.45, y: 2.88, radius: 0.2, teeth: 7, spin: -1.9, out: 0.15 },
    { wall: "back", along: 2.0, y: 2.6, radius: 0.34, teeth: 10, spin: 1.2, spokes: 5, out: 0.08 },
    { wall: "left", along: -2.0, y: 2.6, radius: 0.36, teeth: 11, spin: -1, spokes: 5, out: 0.08 },
    { wall: "left", along: -1.45, y: 2.88, radius: 0.2, teeth: 7, spin: 1.9, out: 0.15 },
    { wall: "left", along: 2.0, y: 2.6, radius: 0.3, teeth: 9, spin: 1.4, out: 0.08 },
  ];
  return { placements: [] as Placement[], kitPieces, extras: [...worksFloor(3301), ...extras(bag)], glows, gears };
}

function rotated(g: BufferGeometry, at: V3, euler: V3): BufferGeometry {
  return g
    .rotateX(euler[0])
    .rotateY(euler[1])
    .rotateZ(euler[2])
    .translate(...at);
}
