import type { BufferGeometry } from "three";
import { FLOORS, makeEarth, makeFlagstones } from "../kit/floor";
import type { Extra, Placement } from "../kit/StaticRoom";
import { addTo, ball, box, extras, gearGeometry, onWall, pipe, ring, rod, type V3 } from "../kit/shapes";
import type { Gear, Glow, Wall } from "../room/layout";

// Region 2, the Sorting Works (world/art-briefs/region-2-sorting-works.md): a clockwork workshop of
// brass, gears and pipes, where the sorting machines learned where everyone lived. Stand-ins until the
// region's own kit: the Ruins kit's walls recoloured as warm brick, and pieces made in code (walnut
// wainscot, copper pipes with flanges and gauges, brass gear trains, caged amber lamps).
// A left world (0052): the machine hall's own structure and machinery, nothing that says someone still
// works here. Ruin: seized gears, cold grey daylight, tarnished metal. Restored: amber lamplight, warm
// brass, gears turning.

const QUARTER = Math.PI / 2;
const LAMP = "#F5A04A";

type Bag = Record<string, BufferGeometry[]>;

export function worksFloor(seed: number): Extra[] {
  return [
    { name: "Floor", geometry: makeFlagstones({ size: 8.4, seed, ...FLOORS[2] }) },
    { name: "Earth", geometry: makeEarth(8.4) },
  ];
}

/** A run of walnut wainscot along a wall, from `from` to `to`, with a brass rail on top. */
function wainscot(bag: Bag, wall: Wall, from: number, to: number) {
  const length = to - from;
  const mid = (from + to) / 2;
  const panel = box([length, 0.95, 0.05], [0, 0.475, 0.025]);
  addTo(bag, "Walnut", onWall(panel, wall, mid, 0, 0.0));
  // Raised panels, each with its own frame line.
  for (let a = from + 0.1; a + 0.6 <= to - 0.05; a += 0.7) {
    addTo(bag, "Walnut", onWall(box([0.58, 0.6, 0.03], [0, 0, 0]), wall, a + 0.29, 0.45, 0.06));
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

/**
 * A cabinet of tiny drawers (the sorters' card index), standing on the floor against a wall: walnut,
 * a grid of drawer fronts with brass pulls and label frames.
 */
function drawerCabinet(bag: Bag, wall: Wall, along: number, width = 1.2, height = 1.7, cols = 4, rows = 7) {
  const depth = 0.42;
  addTo(bag, "Walnut", onWall(box([width, height, depth], [0, height / 2, depth / 2]), wall, along, 0, 0.02));
  addTo(
    bag,
    "DarkWood",
    onWall(box([width + 0.08, 0.06, depth + 0.06], [0, height + 0.03, depth / 2]), wall, along, 0, 0.02),
  );
  const w = (width - 0.1) / cols;
  const h = (height - 0.25) / rows;
  for (let c = 0; c < cols; c++)
    for (let r = 0; r < rows; r++) {
      const x = -width / 2 + 0.05 + w * (c + 0.5);
      const y = 0.15 + h * (r + 0.5);
      addTo(bag, "Walnut", onWall(box([w - 0.03, h - 0.03, 0.02], [x, y, depth + 0.01]), wall, along, 0, 0.02));
      addTo(
        bag,
        "Brass",
        onWall(box([w * 0.45, h * 0.22, 0.008], [x, y + h * 0.18, depth + 0.024]), wall, along, 0, 0.02),
      );
      addTo(bag, "Brass", onWall(ball([x, y - h * 0.15, depth + 0.035], 0.016, 6), wall, along, 0, 0.02));
    }
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

/** A dial-style link light beside a hall door (region-2 brief): an enamel dial with a lamp eye. */
function doorDial(bag: Bag, wall: Wall, at: number) {
  addTo(bag, "Brass", onWall(rod([0, 0, 0], [0, 0, 0.05], 0.13, 16), wall, at + 1.25, 2.1, 0));
  addTo(bag, "Enamel", onWall(rod([0, 0, 0.05], [0, 0, 0.06], 0.1, 16), wall, at + 1.25, 2.1, 0));
  addTo(bag, "DarkMetal", onWall(box([0.012, 0.08, 0.01], [0.02, 0.03, 0.07], [0, 0, -0.5]), wall, at + 1.25, 2.1, 0));
  addTo(bag, "LampGlass", onWall(ball([0, -0.19, 0.04], 0.035, 8), wall, at + 1.25, 2.1, 0));
}

// ---------------------------------------------------------------------------------------------------
// The Observatory (the Knight's corner of the Works)

export function worksObservatoryPieces(secondDoor: boolean): Placement[] {
  const back: Placement[] = [
    { piece: "Wall", position: [-3, 0, -4] },
    { piece: "Window_Bars", position: [-3, 2, -4] },
    { piece: "Wall_ArchRound_Broken", position: [0, 0, -4] },
    { piece: "Wall", position: [3, 0, -4] },
    { piece: "Wall_Broken", position: [3, 2, -4] },
  ];
  const left: Placement[] = [
    { piece: "Wall", position: [-4, 0, -3], rotationY: QUARTER },
    { piece: "Wall", position: [-4, 2, -3], rotationY: QUARTER },
    { piece: "Wall", position: [-4, 0, -1], rotationY: QUARTER },
    { piece: "Wall_Broken", position: [-4, 2, -1], rotationY: QUARTER },
  ];
  const front: Placement[] = secondDoor
    ? [{ piece: "Wall_ArchRound", position: [-4, 0, 2], rotationY: QUARTER }]
    : [
        { piece: "Wall", position: [-4, 0, 1], rotationY: QUARTER },
        { piece: "Wall_Double_Broken", position: [-4, 0, 3], rotationY: QUARTER },
      ];
  return [
    ...back,
    ...left,
    ...front,
    { piece: "Column_Square", position: [-4, 0, -4] },
    { piece: "Column_Square", position: [4, 0, -4], scale: 0.5 },
    { piece: "Brick", position: [1.9, 0, 2.2], rotationY: 0.7 },
    { piece: "Brick", position: [1.75, 0, 2.55], rotationY: 2.0 }, // weighs down the Knight's letter
    { piece: "Bricks", position: [-3.2, 0, 3.4], rotationY: 2.1, scale: 0.8 },
  ];
}

export function worksObservatory(secondDoor: boolean) {
  const bag: Bag = {};
  const glows: Glow[] = [];
  wainscot(bag, "back", -3.95, -2.05);
  wainscot(bag, "back", 2.05, 3.95);
  wainscot(bag, "left", -3.95, secondDoor ? -0.05 : 3.0);
  pipes(bag, [
    // Along the left wall high up, then down into the floor before the arch.
    [
      [-3.85, 3.6, -3.85],
      [-3.85, 2.7, -3.85],
      [-3.85, 2.7, -0.3],
      [-3.85, 0.0, -0.3],
    ],
    // Along the back wall, right of the arch, down into the floor.
    [
      [2.2, 0.0, -3.85],
      [2.2, 2.55, -3.85],
      [3.9, 2.55, -3.85],
    ],
  ]);
  pipes(
    bag,
    [
      [
        [-3.72, 0.0, -3.72],
        [-3.72, 2.35, -3.72],
        [-2.2, 2.35, -3.72],
      ],
    ],
    0.04,
  );
  gauge(bag, "left", -2.0, 2.72, 0.22);
  gauge(bag, "back", 2.9, 2.55, 0.22, 0.12);
  lamp(bag, glows, "back", -2.7, 2.0);
  lamp(bag, glows, "left", -1.2, 2.0);
  drawerCabinet(bag, "back", 3.0, 1.1, 1.5, 4, 6);
  hatch(bag, "left", -3.0, 1.55, 0.28);
  tubes(bag, [
    [
      [-3.9, 3.9, -2.2],
      [-3.9, 3.1, -2.2],
      [-3.9, 3.1, -0.4],
    ],
  ]);
  // A great gear fallen from the train, leaning against the back wall among the rubble.
  addTo(bag, "Brass", rotated(gearGeometry(0.55, 14, 0.07, 5), [3.0, 0.55, -3.55], [-0.25, 0.3, 0.2]));
  const gears: Gear[] = [
    { wall: "left", along: -2.6, y: 3.25, radius: 0.5, teeth: 14, spin: 1, spokes: 5 },
    { wall: "left", along: -1.72, y: 3.55, radius: 0.32, teeth: 9, spin: -1.56, out: 0.15 },
    { wall: "left", along: -1.3, y: 3.05, radius: 0.22, teeth: 7, spin: 2.27 },
  ];
  return {
    placements: worksObservatoryPieces(secondDoor),
    extras: [...worksFloor(1103), ...extras(bag)],
    glows,
    gears,
  };
}

// ---------------------------------------------------------------------------------------------------
// Another computer's room: a small workshop bay.

export function worksHouse() {
  const bag: Bag = {};
  const glows: Glow[] = [];
  const placements: Placement[] = [
    { piece: "Wall_ArchRound", position: [0, 0, -4] },
    { piece: "Wall", position: [-3, 0, -4] },
    { piece: "Wall_Broken", position: [-3, 2, -4] },
    { piece: "Wall", position: [3, 0, -4] },
    { piece: "Wall", position: [-4, 0, -3], rotationY: QUARTER },
    { piece: "Window_Bars", position: [-4, 2, -3], rotationY: QUARTER },
    { piece: "Wall", position: [-4, 0, -1], rotationY: QUARTER },
    { piece: "Wall_Half", position: [-4, 0, 1], rotationY: QUARTER },
    { piece: "Wall_Double_Broken", position: [-4, 0, 3], rotationY: QUARTER },
    { piece: "Column_Square", position: [-4, 0, -4] },
    { piece: "Column_Square", position: [4, 0, -4], scale: 0.5 },
    { piece: "Bricks", position: [2.9, 0, 1.9], rotationY: 0.9, scale: 0.8 },
    { piece: "Brick", position: [-1.6, 0, 2.6], rotationY: 0.4 },
  ];
  wainscot(bag, "back", -3.95, -2.05);
  wainscot(bag, "back", 2.05, 3.95);
  wainscot(bag, "left", -3.95, -0.05);
  pipes(bag, [
    [
      [-3.85, 0.0, -1.2],
      [-3.85, 1.9, -1.2],
      [-3.85, 1.9, -3.85],
      [-2.2, 1.9, -3.85],
    ],
  ]);
  gauge(bag, "left", -2.4, 1.9, 0.22);
  lamp(bag, glows, "back", 2.8, 2.1);
  drawerCabinet(bag, "left", 1.9, 1.3, 1.2, 5, 4);
  hatch(bag, "back", -2.9, 1.5, 0.3);
  const gears: Gear[] = [
    { wall: "back", along: -3.2, y: 2.75, radius: 0.42, teeth: 12, spin: 1, spokes: 5 },
    { wall: "back", along: -2.5, y: 2.35, radius: 0.24, teeth: 7, spin: -1.75, out: 0.14 },
  ];
  return { placements, extras: [...worksFloor(2207), ...extras(bag)], glows, gears };
}

// ---------------------------------------------------------------------------------------------------
// The sorting hall (a switch): doors as riveted hatches; a gantry of pipes and gear trains above.

/** A riveted iron-and-brass hatch frame round a hall doorway. */
export function worksDoorFrame(bag: Bag, wall: Wall, at: number) {
  for (const x of [-0.95, 0.95]) {
    addTo(bag, "DarkMetal", onWall(box([0.2, 2.45, 0.34], [x, 1.225, 0.05]), wall, at, 0));
    for (let y = 0.3; y < 2.4; y += 0.42) addTo(bag, "Brass", onWall(ball([x, y, 0.23], 0.028, 6), wall, at, 0));
  }
  addTo(bag, "Brass", onWall(box([2.15, 0.24, 0.38], [0, 2.52, 0.05]), wall, at, 0));
  for (const x of [-0.7, -0.35, 0, 0.35, 0.7])
    addTo(bag, "DarkMetal", onWall(ball([x, 2.52, 0.25], 0.03, 6), wall, at, 0));
}

export function worksHallDressing(used: { wall: Wall; at: number }[]) {
  const bag: Bag = {};
  const glows: Glow[] = [];
  const door = (wall: Wall, at: number) => used.some((s) => s.wall === wall && s.at === at);
  for (const s of used) {
    worksDoorFrame(bag, s.wall, s.at);
    if (s.at < 3) doorDial(bag, s.wall, s.at);
  }
  // The sorters' card index and an inspection hatch, between the doors where there's wall.
  if (!door("left", 1)) drawerCabinet(bag, "left", 1.0, 1.3, 1.7, 4, 7);
  else if (!door("back", -1)) drawerCabinet(bag, "back", -1.0, 1.3, 1.7, 4, 7);
  if (!door("back", 3)) hatch(bag, "back", 3.0, 1.3, 0.34);
  tubes(bag, [
    [
      [-3.7, 0, 3.6],
      [-3.7, 2.75, 3.6],
      [-3.7, 2.75, -3.5],
      [3.9, 2.75, -3.5],
    ],
  ]);
  // The upper wall: brick over the 2 m walls and the doorways' lintels, up to the gantry.
  for (const at of [-3, -1, 1, 3]) {
    for (const wall of ["back", "left"] as const) {
      const from = door(wall, at) ? 2.64 : 1.98;
      const height = 3.5 - from;
      addTo(bag, "Main", onWall(box([2.0, height, 0.3], [0, from + height / 2, -0.15]), wall, at, 0));
    }
  }
  // The gantry: a walnut beam along the top of both walls, two copper pipes on it.
  addTo(bag, "Walnut", box([8.3, 0.2, 0.42], [0.05, 3.55, -3.95]));
  addTo(bag, "Walnut", box([0.42, 0.2, 8.0], [-3.95, 3.55, 0.05]));
  pipes(
    bag,
    [
      [
        [3.95, 3.3, -3.86],
        [-3.86, 3.3, -3.86],
        [-3.86, 3.3, 3.95],
      ],
    ],
    0.055,
  );
  // A riser pipe in the back corner with a gauge.
  pipes(
    bag,
    [
      [
        [-3.75, 0, -3.75],
        [-3.75, 3.3, -3.75],
      ],
    ],
    0.07,
  );
  gauge(bag, "back", -3.45, 1.6, 0.33, 0.12);
  lamp(bag, glows, "back", 0.0, 2.2, 3.4);
  lamp(bag, glows, "left", 0.0, 2.2, 3.4);
  lamp(bag, glows, "left", 2.0, 2.2, 3.0);
  // Gear trains on the upper wall, between the lintels.
  const gears: Gear[] = [
    { wall: "back", along: -2.05, y: 2.95, radius: 0.42, teeth: 12, spin: 1, spokes: 5, out: 0.08 },
    { wall: "back", along: -1.42, y: 3.05, radius: 0.24, teeth: 7, spin: -1.75, out: 0.15 },
    { wall: "back", along: 2.05, y: 2.95, radius: 0.36, teeth: 10, spin: 1.2, spokes: 5, out: 0.08 },
    { wall: "left", along: 0.95, y: 2.95, radius: 0.42, teeth: 12, spin: -1, spokes: 5, out: 0.08 },
    { wall: "left", along: 1.58, y: 3.05, radius: 0.24, teeth: 7, spin: 1.75, out: 0.15 },
    { wall: "left", along: -2.05, y: 2.95, radius: 0.3, teeth: 9, spin: 1.4, out: 0.08 },
  ];
  return { extras: [...worksFloor(3301), ...extras(bag)], glows, gears };
}

function rotated(g: BufferGeometry, at: V3, euler: V3): BufferGeometry {
  return g
    .rotateX(euler[0])
    .rotateY(euler[1])
    .rotateZ(euler[2])
    .translate(...at);
}
