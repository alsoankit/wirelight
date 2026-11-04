import type { BufferGeometry } from "three";
import { type CorridorDressing, corridorFloor } from "../corridor/frame";
import { FLOORS, makeEarth, makeFlagstones } from "../kit/floor";
import type { Extra, Placement } from "../kit/StaticRoom";
import { addTo, box, extras, gable, placed, rod, type V3 } from "../kit/shapes";
import type { KitPlacement } from "../kits/placement";
import type { Wall as DoorWall, Glow } from "../room/layout";

/** The two walls a room has (the near edge, 0111, has no wall to dress). */
type Wall = Exclude<DoorWall, "front">;

// Region 3, the Lantern Town (world/art-briefs/region-3-lantern-town.md; 0095): the courtiers' quarter
// on the palace terraces, asleep under lanterns. Quaternius' Medieval Village and Fantasy Props kits
// (0072; KitRoom draws them) in the palace's colours (town/palette.ts `kitTones`): plaster over ashlar,
// round-headed arcades in carved stone, one long slate roof with dormers along each row of residences.
// The Modular Cathedral kit gives the balustrades and the upper terrace. Beyond the walls stands the
// palace itself, whose windows light as the restoration wave reaches them (nearest terrace first: the
// region's victory, street by street).
// Made in code still: the floors (cobbles, paving: 0053), the cornices and pilasters, the towers and
// keep, the lanterns (a kit lantern read as a cage on a gallows at this size) and the lamp posts.
// Ruin: grey plaster and stone, dark slate, lanterns and windows dark (the kit materials' ruin dial).
// Restored: cream plaster, sandstone, slate blue, lanterns and windows warm.
// A left world (0052): the residences stand; nobody is home.

const LANTERN = "#FFCB70";
const VILLAGE = "region-3/village";
const PROPS = "region-3/props";
const CATH = "region-4/cathedral";
const QUARTER = Math.PI / 2;
/** A village wall's face stands this far in front of its pivot (catalog: face at z ≈ +0.093). */
const FACE = 0.093;
/** Where a storey's walls end and the roof starts (the kit's walls are 3.12 m with their top beam). */
const STOREY = 3.0;

type Bag = Record<string, BufferGeometry[]>;

/**
 * A kit piece against a wall: `along` the wall (x on the back wall, z on the left), `out` in front of
 * the wall's face at −4 (negative is behind it, out in the town), turned to face into the room.
 */
function onWallKit(
  wall: Wall,
  piece: string,
  along: number,
  {
    y = 0,
    out = 0,
    kit = VILLAGE,
    scale,
    glow,
    turn = 0,
  }: Partial<Omit<KitPlacement, "position">> & {
    y?: number;
    out?: number;
    turn?: number;
  } = {},
): KitPlacement {
  const face = -4 + out;
  const position: V3 = wall === "back" ? [along, y, face] : [face, y, along];
  const rotationY = (wall === "back" ? 0 : Math.PI / 2) + turn;
  return { kit, piece, position, rotationY, ...(scale ? { scale } : {}), ...(glow ? { glow } : {}) };
}

/** A village wall piece, its face on the room's wall line (or `out` from it). */
function wallPiece(wall: Wall, piece: string, along: number, out = 0, y = 0): KitPlacement {
  return onWallKit(wall, piece, along, { out: out - FACE, y });
}

function prop(piece: string, x: number, z: number, turn = 0, scale?: number, kit = PROPS): KitPlacement {
  return { kit, piece, position: [x, 0, z], rotationY: turn, ...(scale ? { scale } : {}) };
}

function cobbles(seed: number): Extra[] {
  return [
    { name: "Cobble", geometry: makeFlagstones({ size: 8.4, seed, ...FLOORS[3] }) },
    { name: "Earth", geometry: makeEarth(8.4) },
  ];
}

// Inside a residence: dressed stone paving, square slabs laid in even rows.
function paving(seed: number): Extra[] {
  return [
    {
      name: "Paving",
      geometry: makeFlagstones({
        size: 8.4,
        seed,
        course: [0.78, 0.82],
        slab: [0.78, 0.82],
        long: 0,
        chipped: 0.06,
        cracked: 0.05,
        sunk: 0.03,
        missing: 0.01,
        bevel: 0.016,
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
  // From the wall's own frame (x along it, z out into the room) to the room's.
  const place = (local: V3): V3 =>
    wall === "back" ? [along + local[0], y + local[1], -4 + local[2]] : [-4 + local[2], y + local[1], along - local[0]];
  const turnY = wall === "back" ? 0 : Math.PI / 2;
  addTo(bag, "Iron", box([0.04, 0.04, out], place([0, 0.42, out / 2]), [0, turnY, 0]));
  addTo(bag, "Iron", rod(place([0, 0.1, 0.02]), place([0, 0.42, out * 0.7]), 0.015, 4));
  addTo(bag, "Iron", box([0.02, 0.1, 0.02], place([0, 0.36, out])));
  // A plate where the bracket meets the wall.
  addTo(bag, "Iron", box([0.12, 0.5, 0.03], place([0, 0.25, 0.015]), [0, turnY, 0]));
  lanternAt(bag, place([0, 0.16, out]), glows, strength);
}

/** A lamp post in the street. */
function lampPost(bag: Bag, glows: Glow[], x: number, z: number) {
  addTo(bag, "Iron", rod([x, 0, z], [x, 2.25, z], 0.05, 8, 0.035));
  addTo(bag, "Iron", box([0.2, 0.12, 0.2], [x, 0.06, z]));
  addTo(bag, "Iron", box([0.3, 0.03, 0.03], [x, 2.25, z]));
  lanternAt(bag, [x, 2.42, z], glows, 1.8);
}

/** A seeded random stream (the same town every time). */
function stream(seed: number) {
  let r = seed;
  return () => {
    r = (Math.imul(r, 1664525) + 1013904223) >>> 0;
    return r / 4294967296;
  };
}

const sized = (k: number) => (Math.abs(k - 1) < 1e-6 ? undefined : k);

/** A point in the room: `along` a wall, `out` in front of its face at −4, `y` up. */
function onWallAt(wall: Wall, along: number, out: number, y: number): V3 {
  return wall === "back" ? [along, y, -4 + out] : [-4 + out, y, along];
}

/** A stone block on a wall: `width` along it, `depth` out from it. */
function wallBlock(wall: Wall, along: number, out: number, y: number, [width, height, depth]: V3) {
  return box(wall === "back" ? [width, height, depth] : [depth, height, width], onWallAt(wall, along, out, y));
}

/** A stone pilaster on a wall: a base, a flat shaft and a capital. */
function pilaster(bag: Bag, wall: Wall, along: number, height = STOREY) {
  addTo(
    bag,
    "Stone",
    wallBlock(wall, along, 0.05, height / 2, [0.2, height, 0.1]),
    wallBlock(wall, along, 0.07, 0.17, [0.28, 0.34, 0.14]),
    wallBlock(wall, along, 0.07, height - 0.08, [0.28, 0.16, 0.14]),
  );
}

/**
 * One residence's front facing the room, 2 m wide × one storey (at `scale`): a doorway or a window
 * (`face`) in its carved arch. A window gets its glass, lit when restored, or (`closed`) its shutters.
 */
function front(
  out: KitPlacement[],
  wall: Wall,
  along: number,
  face: string,
  {
    behind = 0,
    scale = 1,
    y = 0,
    closed = false,
  }: { behind?: number; scale?: number; y?: number; closed?: boolean } = {},
) {
  const at = -behind - FACE * scale;
  const s = sized(scale);
  out.push(onWallKit(wall, face, along, { out: at, y, scale: s }));
  const kind = /Window_Wide/.test(face) ? "Wide" : /Window_Thin/.test(face) ? "Thin" : null;
  if (!kind) return;
  if (closed) out.push(onWallKit(wall, `WindowShutters_${kind}_Round_Closed`, along, { out: at, y, scale: s }));
  else out.push(onWallKit(wall, `Window_${kind}_Round1`, along, { out: at, y, scale: s, glow: true }));
}

/** A triangle of stone closing the end of a wing's roof (`eaves` is the roof's centre line, as `out`). */
function wingEnd(wall: Wall, along: number, eaves: number, y: number, r: number) {
  const { wall: end } = gable(3.05 * r, 2.05 * r, 0.14, 0);
  return placed(end, onWallAt(wall, along, eaves, y), [0, wall === "back" ? QUARTER : 0, 0]);
}

/**
 * What crowns a row of residences from `from` to `to`: a stone cornice, a balustrade, and one long slate
 * roof with its ridge along the row (a palace wing, not a row of gabled cottages), with a dormer at
 * each of `dormers` and a stone chimney at each of `chimneys`.
 */
function wing(
  out: KitPlacement[],
  bag: Bag,
  wall: Wall,
  {
    from = -4,
    to = 4,
    behind = 0,
    scale = 1,
    y = 0,
    dormers = [],
    chimneys = [],
  }: {
    from?: number;
    to?: number;
    behind?: number;
    scale?: number;
    y?: number;
    dormers?: number[];
    chimneys?: number[];
  } = {},
) {
  const top = y + STOREY * scale;
  const r = scale * 0.78;
  addTo(
    bag,
    "Stone",
    wallBlock(wall, (from + to) / 2, 0.02 - behind, top + 0.06 * scale, [to - from, 0.12 * scale, 0.3 * scale]),
  );
  // The balustrade: whole four-metre lengths, the last one pinned to the row's end.
  const rail = 4 * scale;
  for (let a = from + rail / 2; ; a += rail) {
    const along = Math.min(a, to - rail / 2);
    out.push(
      onWallKit(wall, "railing_01", along, {
        kit: CATH,
        out: 0.12 * scale - behind,
        y: top + 0.12 * scale,
        scale: sized(scale),
      }),
    );
    if (a >= to - rail / 2) break;
  }
  // The roof: 2 × 4 pieces turned to run along the row, its eaves behind the balustrade.
  const length = 4.1 * r;
  const count = Math.ceil((to - from) / length);
  const eaves = -behind - 0.1 * scale - 1.65 * r;
  for (let k = 0; k < count; k++) {
    const along = from + ((k + 0.5) * (to - from)) / count;
    out.push(
      onWallKit(wall, "Roof_2x4_RoundTile", along, {
        out: eaves,
        y: top + 0.1 * scale,
        scale: sized(r),
        turn: QUARTER,
      }),
    );
  }
  // Stone end walls under the roof's gables (the kit's roofs are open at the ends).
  for (const along of [from - 0.02, to + 0.02]) addTo(bag, "Stone", wingEnd(wall, along, eaves, top + 0.05 * scale, r));
  for (const along of dormers)
    out.push(
      onWallKit(wall, "Roof_Dormer_RoundTile", along, {
        out: eaves + 0.4 * r,
        y: top + 0.3 * scale,
        scale: r * 0.46,
        turn: -QUARTER,
        glow: true,
      }),
    );
  for (const along of chimneys)
    out.push(
      onWallKit(wall, "Prop_Chimney2", along, { out: eaves - 0.5 * r, y: top + 0.5 * scale, scale: scale * 0.42 }),
    );
}

/** A round tower beyond the walls: stone, a lit slit or two facing the room, a slate cone. */
function tower(bag: Bag, wall: Wall, along: number, behind: number, base: number, height: number, radius: number) {
  const [x, , z] = onWallAt(wall, along, -behind, 0);
  const top = base + height;
  addTo(bag, "Stone", rod([x, base, z], [x, top, z], radius, 12));
  addTo(bag, "Stone", rod([x, top, z], [x, top + 0.12, z], radius * 1.18, 12));
  addTo(bag, "Slate", rod([x, top + 0.12, z], [x, top + 0.12 + radius * 2.6, z], radius * 1.14, 12, 0.01));
  const slit = (y: number) =>
    wall === "back"
      ? box([radius * 0.26, radius * 0.7, 0.03], [x + radius * 0.3, y, z + radius * 0.96])
      : box([0.03, radius * 0.7, radius * 0.26], [x + radius * 0.96, y, z + radius * 0.3]);
  addTo(bag, "Window", slit(top - radius * 0.9), slit(top - radius * 2.4));
}

/**
 * The palace beyond a room's walls: a lower wing of residences, then the upper terrace with its
 * colonnade and its towers, the great tower among them standing for the keep (the fixed camera can't
 * frame anything taller). The nearer terrace lights first as the restoration wave spreads (the
 * region's victory: the quarter lights up street by street).
 */
function farPalace(bag: Bag, seed: number, start = 2.4, scale = 0.42): KitPlacement[] {
  const random = stream(seed);
  const out: KitPlacement[] = [];
  const reach = 4.8;
  const upper = start + 1.95;
  const terrace = 0.8;
  const big = scale * 1.3;
  const column = (STOREY * big) / 9.016 / 0.5;
  for (const wall of ["back", "left"] as const) {
    // The lower wing, on the plinth of its terrace.
    addTo(bag, "Stone", wallBlock(wall, 0, 0.04 - start, -0.3, [reach * 2, 0.6, 0.2]));
    const fronts = Math.floor((reach * 2) / (2 * scale));
    const dormers: number[] = [];
    for (let k = 0; k < fronts; k++) {
      const along = -reach + (k + 0.5) * 2 * scale;
      const pick = random();
      const face =
        k % 5 === 2
          ? "Wall_Plaster_Door_Round"
          : pick < 0.5
            ? "Wall_Plaster_Window_Thin_Round"
            : "Wall_Plaster_Window_Wide_Round";
      front(out, wall, along, face, { behind: start, scale, closed: random() < 0.15 });
      if (k % 3 === 1) dormers.push(along);
    }
    wing(out, bag, wall, { from: -reach, to: reach, behind: start, scale, dormers });

    // The upper terrace: a wing of tall windows behind its colonnade.
    addTo(bag, "Stone", wallBlock(wall, 0, -upper + 0.2, terrace / 2 - 0.3, [reach * 2, terrace + 0.6, 0.6]));
    const bays = Math.floor((reach * 2) / (2 * big));
    for (let k = 0; k < bays; k++) {
      const along = -reach + (k + 0.5) * 2 * big;
      front(out, wall, along, "Wall_Plaster_Window_Thin_Round", {
        behind: upper,
        scale: big,
        y: terrace,
        closed: random() < 0.1,
      });
      out.push(
        onWallKit(wall, "column_small_01", along + big, {
          kit: CATH,
          out: -upper + 0.32,
          y: terrace,
          scale: column,
        }),
      );
    }
    addTo(bag, "Stone", wallBlock(wall, 0, -upper + 0.2, terrace + STOREY * big + 0.04, [reach * 2, 0.1, 0.5]));
    wing(out, bag, wall, { from: -reach, to: reach, behind: upper, scale: big, y: terrace + 0.08 });

    // The towers rise from the terrace's edge, the great one on the back wall's far side.
    const towerAt = upper - 0.75;
    tower(bag, wall, -3.5 + random() * 0.5, towerAt, terrace, 2.3, 0.3);
    if (wall === "back") tower(bag, wall, 3.1, towerAt, terrace, 3.1, 0.55);
    else tower(bag, wall, 3.3, towerAt, terrace, 2.6, 0.34);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------
// The Observatory (the robot's lodging in the quarter) and the other residences: plaster rooms over a
// carved plinth, stone pilasters and cornice, dressed paving, lanterns and a tall window or two.

/** A carved stone frame round a round-headed doorway (the doors read first in every room). */
function doorFrame(wall: Wall, along: number, behind = 0): KitPlacement {
  return onWallKit(wall, "DoorFrame_Round_WoodDark", along, { out: -behind - FACE });
}

/**
 * A stone cornice along the top of both walls: the kit's walls are open on top (they wait for a roof),
 * which showed as a black slot from the camera.
 */
function wallCaps(bag: Bag) {
  addTo(bag, "Stone", box([8.5, 0.1, 0.5], [0.05, 3.17, -4.19]));
  addTo(bag, "Stone", box([0.5, 0.1, 8.19], [-4.19, 3.17, 0.155]));
  addTo(bag, "Stone", box([8.5, 0.06, 0.62], [0.05, 3.25, -4.13]));
  addTo(bag, "Stone", box([0.62, 0.06, 8.19], [-4.13, 3.25, 0.155]));
}

/**
 * A room's two walls from the inside: the back wall with its doorway at x = 0 (between whole pieces,
 * the gaps filled by plain pieces set a hair behind), the left wall plain with a window or two.
 */
function interiorWalls(windowsBack: number[], windowsLeft: number[], backDoor = true): KitPlacement[] {
  const out: KitPlacement[] = [];
  // Back wall: the doorway (unless the door is on the near edge, 0111), plain pieces at either end,
  // fillers between (behind, so their edges hide).
  out.push(wallPiece("back", backDoor ? "Wall_Plaster_Door_Round" : "Wall_Plaster_Straight_Base", 0));
  if (backDoor) out.push(doorFrame("back", 0));
  for (const at of [-3, 3]) {
    out.push(
      wallPiece("back", windowsBack.includes(at) ? "Wall_Plaster_Window_Wide_Round" : "Wall_Plaster_Straight_Base", at),
    );
    if (windowsBack.includes(at)) out.push(onWallKit("back", "Window_Wide_Round1", at, { out: -FACE }));
  }
  for (const at of [-1.55, 1.55]) out.push(wallPiece("back", "Wall_Plaster_Straight_Base", at, -0.015));
  // Left wall: four pieces.
  for (const at of [-3, -1, 1, 3]) {
    const window = windowsLeft.includes(at);
    out.push(wallPiece("left", window ? "Wall_Plaster_Window_Thin_Round" : "Wall_Plaster_Straight_Base", at));
    if (window) out.push(onWallKit("left", "Window_Thin_Round1", at, { out: -FACE }));
  }
  return out;
}

/** The pilasters on an interior's joints, and the pier in its corner. */
function interiorStone(bag: Bag) {
  for (const x of [-2, -1, 1, 2]) pilaster(bag, "back", x);
  for (const z of [-2, 0, 2]) pilaster(bag, "left", z);
  addTo(bag, "Stone", box([0.3, STOREY, 0.3], [-3.92, STOREY / 2, -3.92]));
}

const OBSERVATORY_KIT: KitPlacement[] = [
  ...interiorWalls([3], [-1]),
  // A crate left by the wall, a broken pot, loose bricks (one weighs down the old letter). No
  // whole pots (0052).
  prop("Vase_Rubble_Medium", 3.0, -3.2, 2.2),
  prop("Crate_Wooden", 3.0, -1.9, 0.5, 0.6),
  prop("Prop_Brick1", 1.9, 2.2, 0.7, undefined, VILLAGE),
  prop("Prop_Brick2", 1.75, 2.55, 2.0, undefined, VILLAGE),
];

/** The Observatory's kit pieces (Region 3 has one door: its second-door variant is the same room). */
export function townObservatoryPieces(_secondDoor: boolean): Placement[] {
  return [];
}

export function townObservatory(_secondDoor: boolean) {
  const bag: Bag = {};
  const glows: Glow[] = [];
  wallCaps(bag);
  interiorStone(bag);
  wallLantern(bag, glows, "back", -2.0, 1.75);
  wallLantern(bag, glows, "left", 0.0, 1.75);
  return {
    placements: townObservatoryPieces(_secondDoor),
    kitPieces: [...OBSERVATORY_KIT, ...farPalace(bag, 5)],
    extras: [...paving(1103), ...extras(bag)],
    glows,
  };
}

export const TOWN_HOUSE_PIECES: Placement[] = [];

const HOUSE_KIT: KitPlacement[] = [...interiorWalls([-3], [-1, 3], false), prop("Vase_Rubble_Medium", 2.6, -3.2, 0.6)];

export function townHouse() {
  const bag: Bag = {};
  const glows: Glow[] = [];
  wallCaps(bag);
  interiorStone(bag);
  wallLantern(bag, glows, "back", 2.4, 1.75);
  wallLantern(bag, glows, "left", 0.0, 1.75, 1.4);
  return {
    placements: TOWN_HOUSE_PIECES,
    kitPieces: [...HOUSE_KIT, ...farPalace(bag, 11)],
    extras: [...paving(2207), ...extras(bag)],
    glows,
  };
}

// ---------------------------------------------------------------------------------------------------
// The town square (a switch): every doorway is a residence's front door; the other places are fronts
// with a window. One wing along each side, lamp posts in the square, cobbles underfoot.

export function townSquare(used: { wall: Wall; at: number }[]) {
  const bag: Bag = {};
  const glows: Glow[] = [];
  const kit: KitPlacement[] = [];
  let k = 0;
  for (const wall of ["back", "left"] as const) {
    for (const at of [-3, -1, 1, 3]) {
      const door = used.some((s) => s.wall === wall && s.at === at);
      const brick = k % 3 === 2;
      const face = door
        ? brick
          ? "Wall_UnevenBrick_Door_Round"
          : "Wall_Plaster_Door_Round"
        : k % 2 === 0
          ? "Wall_Plaster_Window_Wide_Round"
          : "Wall_Plaster_Window_Thin_Round";
      front(kit, wall, at, face, { closed: !door && k % 4 === 3 });
      if (door) kit.push(doorFrame(wall, at));
      k++;
    }
    wing(kit, bag, wall, { dormers: [-3, -1, 1, 3], chimneys: [wall === "back" ? -2 : 2] });
    for (const at of [-2, 0, 2]) pilaster(bag, wall, at);
  }
  // A barrel and a crate by the houses (the street's, not a home's), a broken pot. No whole pots (0052).
  kit.push(prop("Barrel", 2.45, -3.55, 0.4));
  kit.push(prop("Crate_Wooden", -3.5, 2.5, 0.3));
  kit.push(prop("Vase_Rubble_Medium", 3.2, 2.9, 1.2));
  // The corner where the two rows of residences meet.
  addTo(bag, "Stone", box([0.45, STOREY + 0.2, 0.45], [-4.15, (STOREY + 0.2) / 2, -4.15]));
  // Lamp posts in the square's two open corners, beyond the end doors as the camera sees them (never
  // in front of a doorway or a board); none in the foreground, where one cut the view in two.
  lampPost(bag, glows, 3.95, -3.65);
  lampPost(bag, glows, -3.65, 3.95);
  return { kitPieces: [...kit, ...farPalace(bag, 23, 3.6, 0.5)], extras: [...cobbles(3301), ...extras(bag)], glows };
}

export const TOWN_SQUARE_PIECES: Placement[] = [];

// ---------------------------------------------------------------------------------------------------
// A corridor (0081): a cobbled lane along a wing of residences (region-3 brief, 0095). Fronts along the
// back, windows lit when restored, wall lanterns, the palace beyond; the rune-line runs down the
// middle of the lane. Room coordinates: back wall on z = −4, x from −5 to 5.

export function townCorridor(): CorridorDressing {
  const bag: Bag = {};
  const glows: Glow[] = [];
  const kit: KitPlacement[] = [];
  const faces = [
    "Wall_Plaster_Window_Wide_Round",
    "Wall_Plaster_Window_Thin_Round",
    "Wall_UnevenBrick_Door_Round",
    "Wall_Plaster_Window_Thin_Round",
    "Wall_Plaster_Window_Wide_Round",
  ];
  [-4, -2, 0, 2, 4].forEach((at, k) => {
    front(kit, "back", at, faces[k] as string, { closed: k === 3 });
  });
  wing(kit, bag, "back", { from: -5, to: 5, dormers: [-4, -2, 2, 4], chimneys: [-1] });
  for (const at of [-3, -1, 1, 3]) pilaster(bag, "back", at);
  // The lane's one residence door is shut (a strapped door in its frame): the way on is the arches at the
  // ends, never a dark doorway in the middle of the lane.
  kit.push(doorFrame("back", 0));
  kit.push(onWallKit("back", "Door_4_Round", -0.53, { out: -0.2 }));
  kit.push(prop("Barrel", -3.2, -3.4, 0.6));
  kit.push(prop("Vase_2", 2.9, -3.45, 1.4));
  wallLantern(bag, glows, "back", -1.0, 1.75);
  wallLantern(bag, glows, "back", 3.0, 1.75);
  return {
    placements: [],
    kitPieces: [...kit, ...farPalace(bag, 41, 3.6, 0.5)],
    extras: [...corridorFloor(3, "Cobble", 5301), ...extras(bag)],
    glows,
  };
}
