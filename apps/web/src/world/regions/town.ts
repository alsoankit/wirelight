import { type BufferGeometry, Shape } from "three";
import { FLOORS, makeEarth, makeFlagstones } from "../kit/floor";
import type { Extra, Placement } from "../kit/StaticRoom";
import { addTo, box, extras, gable, onWall, rectShape, rod, type V3, wallWithDoor, wallWithHoles } from "../kit/shapes";
import type { Glow, Wall } from "../room/layout";

// Region 3, the Lantern Town (world/art-briefs/region-3-lantern-town.md): a storybook town asleep
// under lanterns. Stand-ins until the region's own kit, made in code: plaster walls with timber
// framing, floorboards, lanterns on brackets and posts, house fronts with gable roofs round the
// square, cobbles underfoot, and the roofs of the rest of the town beyond the walls.
// Ruin: grey plaster, slate and faded terracotta, lanterns dark, windows black. Restored: cream and
// peach plaster, terracotta and teal roofs, lanterns and windows warm, lit one after another as the
// wave passes (the roofs beyond light street by street, nearest first). Palette: town/palette.ts.
// A left world (0052): the houses stand; nobody is home.

const QUARTER = Math.PI / 2;
const LANTERN = "#FFCB70";
/** How tall a room's plaster walls stand (a cutaway: low enough to see the town beyond). */
const WALL_H = 3.3;

type Bag = Record<string, BufferGeometry[]>;

function cobbles(seed: number): Extra[] {
  return [
    { name: "Cobble", geometry: makeFlagstones({ size: 8.4, seed, ...FLOORS[3] }) },
    { name: "Earth", geometry: makeEarth(8.4) },
  ];
}

// Inside a house: long floorboards laid in rows.
function boards(seed: number): Extra[] {
  return [
    {
      name: "Boards",
      geometry: makeFlagstones({
        size: 8.4,
        seed,
        course: [0.19, 0.21],
        slab: [1.6, 2.8],
        long: 0.1,
        chipped: 0.05,
        cracked: 0.02,
        sunk: 0.05,
        missing: 0.012,
        bevel: 0.012,
        gap: 0.012,
      }),
    },
    { name: "Earth", geometry: makeEarth(8.4) },
  ];
}

/**
 * A lantern: an iron frame round four panes of warm glass, a small flame inside, a pointed iron cap.
 * `at` is the lantern's centre. Thin panes with dark edges read as a lantern, not a glowing box.
 */
function lanternAt(bag: Bag, at: V3, glows: Glow[] | null, strength = 1.6) {
  const [x, y, z] = at;
  const h = 0.22;
  const w = 0.15;
  // Glass panes, inset between the corner posts.
  for (const [dx, dz, sx, sz] of [
    [0, w / 2, w - 0.03, 0.01],
    [0, -w / 2, w - 0.03, 0.01],
    [w / 2, 0, 0.01, w - 0.03],
    [-w / 2, 0, 0.01, w - 0.03],
  ] as const) {
    addTo(bag, "Lantern", box([sx, h - 0.04, sz], [x + dx, y, z + dz]));
  }
  // The flame.
  addTo(bag, "Lantern", box([0.035, 0.07, 0.035], [x, y - 0.03, z]));
  for (const [dx, dz] of [
    [-w / 2, -w / 2],
    [w / 2, -w / 2],
    [-w / 2, w / 2],
    [w / 2, w / 2],
  ] as const) {
    addTo(bag, "Iron", box([0.025, h + 0.04, 0.025], [x + dx, y, z + dz]));
  }
  // Bands round the top and bottom of the glass, a base, and a pointed cap with a ring.
  addTo(bag, "Iron", box([w + 0.03, 0.025, w + 0.03], [x, y + h / 2, z]));
  addTo(bag, "Iron", box([w + 0.07, 0.035, w + 0.07], [x, y - h / 2 - 0.01, z]));
  addTo(bag, "Iron", rod([x, y + h / 2, z], [x, y + h / 2 + 0.12, z], 0.12, 4, 0.015));
  addTo(bag, "Iron", rod([x, y + h / 2 + 0.12, z], [x, y + h / 2 + 0.18, z], 0.012, 6));
  if (glows) glows.push({ position: [x, y, z], colour: LANTERN, strength });
}

/** A lantern on an iron bracket out from a wall (far enough out that its light spreads, not a hot spot). */
function wallLantern(bag: Bag, glows: Glow[], wall: Wall, along: number, y: number, strength?: number) {
  const out = 0.5;
  addTo(bag, "Iron", onWall(box([0.04, 0.04, out], [0, 0.42, out / 2]), wall, along, y, 0));
  addTo(bag, "Iron", onWall(rod([0, 0.1, 0.02], [0, 0.42, out * 0.7], 0.015, 4), wall, along, y, 0));
  addTo(bag, "Iron", onWall(box([0.02, 0.1, 0.02], [0, 0.36, out]), wall, along, y, 0));
  const p: V3 = wall === "back" ? [along, y + 0.16, -4 + out] : [-4 + out, y + 0.16, along];
  lanternAt(bag, p, glows, strength);
}

/** A lamp post in the street. */
function lampPost(bag: Bag, glows: Glow[], x: number, z: number) {
  addTo(bag, "Iron", rod([x, 0, z], [x, 2.25, z], 0.05, 8, 0.035));
  addTo(bag, "Iron", box([0.2, 0.12, 0.2], [x, 0.06, z]));
  addTo(bag, "Iron", box([0.3, 0.03, 0.03], [x, 2.25, z]));
  lanternAt(bag, [x, 2.42, z], glows, 1.8);
}

/** Timber framing on a wall between `from` and `to`: posts, a sill, a top beam and a brace or two. */
function timbers(bag: Bag, wall: Wall, from: number, to: number, top: number, braces = true) {
  const mid = (from + to) / 2;
  const length = to - from;
  addTo(bag, "Timber", onWall(box([length, 0.14, 0.06], [0, top - 0.07, 0.03]), wall, mid, 0));
  addTo(bag, "Timber", onWall(box([length, 0.12, 0.06], [0, 0.9, 0.03]), wall, mid, 0));
  for (let a = from; a <= to + 0.01; a += 2) {
    addTo(bag, "Timber", onWall(box([0.14, top, 0.07], [0, top / 2, 0.035]), wall, Math.min(a, to - 0.07), 0));
  }
  if (braces) {
    // A diagonal brace in each upper panel.
    for (let a = from; a + 2 <= to + 0.01; a += 2) {
      const h = top - 0.9;
      const len = Math.hypot(2, h);
      const angle = Math.atan2(h, 2) * ((Math.round(a) / 2) % 2 === 0 ? 1 : -1);
      addTo(bag, "Timber", onWall(box([len - 0.1, 0.1, 0.05], [0, 0.9 + h / 2, 0.03], [0, 0, angle]), wall, a + 1, 0));
    }
  }
}

/** A round-topped doorway outline, `width` wide and `height` tall at the crown, centred on `x`. */
function archShape(x: number, width: number, height: number): Shape {
  const r = width / 2;
  const s = new Shape();
  s.moveTo(x - r, 0);
  s.lineTo(x + r, 0);
  s.lineTo(x + r, height - r);
  s.absarc(x, height - r, r, 0, Math.PI, false);
  s.lineTo(x - r, 0);
  return s;
}

/**
 * A room's wall in plaster, its doorways and windows cut out (`doors` and `windows` are positions
 * along the wall, in world terms: x for the back wall, z for the left). Timber frames each window,
 * with a cross of glazing bars and warm glass that glows when the house wakes.
 */
function plasterWall(bag: Bag, wall: Wall, plaster: string, doors: number[], windows: number[], height = WALL_H) {
  // The left wall is built facing +z and turned: along the wall, world z = −local x.
  const local = (a: number) => (wall === "back" ? a : -a);
  const holes = [
    ...doors.map((a) => archShape(local(a), 1.8, 2.6)),
    ...windows.map((a) => rectShape(local(a) - 0.42, 1.25, local(a) + 0.42, 2.35)),
  ];
  addTo(bag, plaster, onWall(wallWithHoles(8, height, 0.22, holes), wall, 0, 0));
  for (const a of windows) {
    addTo(bag, "Window", onWall(box([0.84, 1.1, 0.03], [0, 1.8, -0.14]), wall, a, 0));
    // The frame, a sill, and the glazing bars.
    addTo(bag, "Timber", onWall(box([1.0, 0.08, 0.1], [0, 1.21, 0.04]), wall, a, 0));
    addTo(bag, "Timber", onWall(box([1.0, 0.08, 0.06], [0, 2.39, 0.02]), wall, a, 0));
    for (const side of [-1, 1])
      addTo(bag, "Timber", onWall(box([0.08, 1.2, 0.06], [side * 0.46, 1.8, 0.02]), wall, a, 0));
    addTo(bag, "Timber", onWall(box([0.04, 1.1, 0.04], [0, 1.8, -0.1]), wall, a, 0));
    addTo(bag, "Timber", onWall(box([0.84, 0.04, 0.04], [0, 1.8, -0.1]), wall, a, 0));
  }
  for (const a of doors) {
    // A timber lintel over each doorway.
    addTo(bag, "Timber", onWall(box([2.1, 0.14, 0.1], [0, 2.68, 0.05]), wall, a, 0));
  }
}

/** Timber framing that leaves each doorway clear. */
function framing(bag: Bag, wall: Wall, doors: number[], top = WALL_H) {
  const edges = [-4, ...doors.flatMap((d) => [d - 1.15, d + 1.15]), 4].sort((a, b) => a - b);
  for (let i = 0; i < edges.length; i += 2) {
    const from = edges[i] as number;
    const to = edges[i + 1] as number;
    if (to - from > 0.3) timbers(bag, wall, from, to, top, to - from >= 2);
  }
}

/**
 * The rest of the town beyond a room's walls: rows of little houses (streets), each a plaster body
 * under a gable roof with a lit window in its gable. Nearer streets light first as the restoration
 * wave spreads (the region's victory: the town lights up street by street).
 */
function farTown(bag: Bag, seed: number, start = 1.4, base = 2.0) {
  let r = seed;
  const random = () => {
    r = (Math.imul(r, 1664525) + 1013904223) >>> 0;
    return r / 4294967296;
  };
  // Small and low: only their upper floors and roofs show over the walls, like a town down the hill.
  const streets = [0, 1, 2].map((row) => ({ behind: start + row * 1.8, tall: base + row * 0.45 }));
  for (const wall of ["back", "left"] as const) {
    streets.forEach(({ behind, tall }, row) => {
      for (let a = -3.5 + random() * 0.6 + row * 0.4; a < 4.2; a += 1.25 + random() * 0.5) {
        const w = 0.85 + random() * 0.35;
        const h = tall + random() * 0.4;
        const plaster = random() < 0.45 ? "PlasterPeach" : "Plaster";
        const roof = random() < 0.4 ? "RoofTeal" : "Roof";
        // Built on the back wall's frame, then moved back by `behind` (onWall's `out` is from the wall's face).
        addTo(bag, plaster, onWall(box([w, h, 1.0], [0, h / 2, -0.5]), wall, a, 0, -behind));
        const { wall: end, roofs } = gable(w, 0.45, 1.0, 0.08);
        addTo(bag, plaster, onWall(end, wall, a, h, -behind));
        addTo(bag, roof, ...roofs.map((g) => onWall(g, wall, a, h, -behind)));
        // A small window in the gable end, and now and then one below, facing the room.
        addTo(bag, "Window", onWall(box([0.12, 0.15, 0.03], [0, 0.17, 0.01]), wall, a, h, -behind));
        if (random() < 0.6)
          addTo(
            bag,
            "Window",
            onWall(box([0.18, 0.22, 0.03], [random() < 0.5 ? -0.18 : 0.18, h - 0.45, 0.01]), wall, a, 0, -behind),
          );
        if (row > 0 && random() < 0.3)
          addTo(bag, "Timber", onWall(box([0.12, 0.4, 0.12], [w * 0.25, h + 0.4, -0.6]), wall, a, 0, -behind));
      }
    });
  }
}

// Small things made in code (not kit pieces), so a town room never waits for a model to load before
// it shows (a cold load of the kit's pots and grass left the square black for 2–3 s on entering).

/** A clay pot; a broken one is shorter with a jagged rim and a shard beside it. */
function pot(bag: Bag, x: number, z: number, broken = false) {
  const h = broken ? 0.32 : 0.55;
  addTo(bag, "Pot_Main", rod([x, 0, z], [x, h * 0.6, z], 0.16, 12, 0.24));
  addTo(bag, "Pot_Main", rod([x, h * 0.6, z], [x, h, z], 0.24, 12, broken ? 0.2 : 0.12));
  if (!broken) addTo(bag, "Pot_Detail", rod([x, h, z], [x, h + 0.06, z], 0.14, 12));
  else addTo(bag, "Pot_Main", box([0.18, 0.03, 0.12], [x + 0.35, 0.015, z + 0.1], [0, 0.7, 0]));
}

function brick(bag: Bag, x: number, z: number, turn: number) {
  addTo(bag, "Stone", box([0.36, 0.16, 0.18], [x, 0.08, z], [0, turn, 0]));
}

/** A tuft of grass in a crack: a few thin blades. */
function tuft(bag: Bag, x: number, z: number) {
  for (let i = 0; i < 6; i++) {
    const a = i * 1.05;
    const lean = 0.08 + (i % 3) * 0.04;
    addTo(
      bag,
      "Green",
      rod(
        [x + Math.cos(a) * 0.05, 0, z + Math.sin(a) * 0.05],
        [x + Math.cos(a) * lean, 0.28 + (i % 2) * 0.12, z + Math.sin(a) * lean],
        0.018,
        3,
        0.004,
      ),
    );
  }
}

// ---------------------------------------------------------------------------------------------------
// The Observatory (the Knight's lodging in the town) and the other houses: small plaster interiors in
// the square's own colours, timber framed, with floorboards, lanterns and a window or two.

/** No kit pieces: everything in a town room is made in code (see `pot`). */
export function townObservatoryPieces(_secondDoor: boolean): Placement[] {
  return [];
}

export function townObservatory(secondDoor: boolean) {
  const bag: Bag = {};
  const glows: Glow[] = [];
  plasterWall(bag, "back", "Plaster", [0], [2.6]);
  plasterWall(bag, "left", "PlasterPeach", secondDoor ? [2] : [], [-2.4]);
  framing(bag, "back", [0]);
  framing(bag, "left", secondDoor ? [2] : []);
  // The corner post where the two walls meet.
  addTo(bag, "Timber", box([0.2, WALL_H + 0.1, 0.2], [-3.98, (WALL_H + 0.1) / 2, -3.98]));
  wallLantern(bag, glows, "back", -2.5, 1.9);
  wallLantern(bag, glows, "left", -0.4, 1.9);
  // A fallen street sign (blank: names are drawn as on-screen text, never painted).
  addTo(bag, "Timber", box([0.9, 0.3, 0.04], [2.9, 0.06, -1.9], [-QUARTER, 0, 0.5]));
  addTo(bag, "Timber", box([0.06, 1.6, 0.06], [3.25, 0.05, -1.3], [QUARTER, 0, 0.3]));
  pot(bag, 3.1, -3.2, true);
  pot(bag, -3.3, -2.0);
  brick(bag, 1.9, 2.2, 0.7);
  brick(bag, 1.75, 2.55, 2.0); // weighs down the Knight's letter
  tuft(bag, 3.0, 1.4);
  farTown(bag, 5);
  return { placements: townObservatoryPieces(secondDoor), extras: [...boards(1103), ...extras(bag)], glows };
}

export const TOWN_HOUSE_PIECES: Placement[] = [];

export function townHouse() {
  const bag: Bag = {};
  const glows: Glow[] = [];
  plasterWall(bag, "back", "PlasterPeach", [0], [-2.4]);
  plasterWall(bag, "left", "Plaster", [], [-1.6, 1.8]);
  framing(bag, "back", [0]);
  framing(bag, "left", []);
  addTo(bag, "Timber", box([0.2, WALL_H + 0.1, 0.2], [-3.98, (WALL_H + 0.1) / 2, -3.98]));
  wallLantern(bag, glows, "back", 2.5, 1.9);
  wallLantern(bag, glows, "left", 0.1, 1.9, 1.4);
  pot(bag, 2.6, -3.2, true);
  pot(bag, -3.3, -0.3);
  tuft(bag, 3.1, 3.0);
  farTown(bag, 11);
  return { placements: TOWN_HOUSE_PIECES, extras: [...boards(2207), ...extras(bag)], glows };
}

// ---------------------------------------------------------------------------------------------------
// The town square (a switch): every doorway is a house's front door; the other places are house
// fronts with a shuttered window. Gable roofs above, lamp posts in the square, cobbles underfoot.
// Roofs alternate terracotta and slate (teal once restored), so even in ruin the square isn't one colour.

export function townSquare(used: { wall: Wall; at: number }[]) {
  const bag: Bag = {};
  const glows: Glow[] = [];
  const front = 3.0;
  let k = 0;
  for (const wall of ["back", "left"] as const) {
    for (const at of [-3, -1, 1, 3]) {
      const door = used.some((s) => s.wall === wall && s.at === at);
      const peach = (k + (wall === "left" ? 1 : 0)) % 2 === 1;
      const slate = k % 2 === 1;
      k++;
      const plaster = peach ? "PlasterPeach" : "Plaster";
      // The house front, 2 m wide, with its door (a doorway the corridor runs through) or a window.
      const face = door
        ? wallWithDoor(1.98, front, 0.25, 1.8, 2.45, false)
        : box([1.98, front, 0.25], [0, front / 2, -0.125]);
      addTo(bag, plaster, onWall(face, wall, at, 0));
      // Corner posts and a beam at the eaves.
      for (const x of [-0.93, 0.93])
        addTo(bag, "Timber", onWall(box([0.12, front, 0.08], [x, front / 2, 0.04]), wall, at, 0));
      addTo(bag, "Timber", onWall(box([1.98, 0.12, 0.09], [0, front - 0.06, 0.045]), wall, at, 0));
      if (door) {
        addTo(bag, "Timber", onWall(box([2.0, 0.16, 0.12], [0, 2.53, 0.06]), wall, at, 0));
      } else {
        // A shuttered window: glows warm when the house wakes.
        addTo(bag, "Window", onWall(box([0.56, 0.7, 0.04], [0, 1.55, 0.02]), wall, at, 0));
        addTo(bag, "Timber", onWall(box([0.7, 0.07, 0.1], [0, 1.17, 0.06]), wall, at, 0));
        for (const side of [-1, 1])
          addTo(
            bag,
            "Timber",
            onWall(box([0.3, 0.74, 0.04], [side * 0.48, 1.55, 0.07], [0, side * 0.5, 0]), wall, at, 0),
          );
      }
      // The gable and its roof, running back from the front. (The house's number is drawn on the
      // gable as on-screen text: town/TownSquare.tsx.)
      const { wall: end, roofs } = gable(1.98, 0.85, 1.6);
      addTo(bag, plaster, onWall(end, wall, at, front));
      addTo(bag, slate ? "RoofTeal" : "Roof", ...roofs.map((r) => onWall(r, wall, at, front)));
    }
  }
  // The corner where the two rows of houses meet.
  addTo(bag, "Timber", box([0.3, front + 0.9, 0.3], [-4.1, (front + 0.9) / 2, -4.1]));
  // Lamp posts at the edges of the square (none in the foreground, where one cut the view in two).
  lampPost(bag, glows, 3.45, -1.7);
  lampPost(bag, glows, -2.2, 3.5);
  pot(bag, 2.4, -3.4);
  pot(bag, -3.4, 3.5, true);
  tuft(bag, 2.2, 1.0);
  tuft(bag, -3.0, -3.2);
  farTown(bag, 23, 2.2, 2.8);
  return { extras: [...cobbles(3301), ...extras(bag)], glows };
}

export const TOWN_SQUARE_PIECES: Placement[] = [];
