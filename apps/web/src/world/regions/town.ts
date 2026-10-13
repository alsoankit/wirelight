import type { BufferGeometry } from "three";
import { FLOORS, makeEarth, makeFlagstones } from "../kit/floor";
import type { Extra, Placement } from "../kit/StaticRoom";
import { addTo, box, extras, rod, type V3 } from "../kit/shapes";
import type { KitPlacement } from "../kits/placement";
import type { Glow, Wall } from "../room/layout";

// Region 3, the Lantern Town (world/art-briefs/region-3-lantern-town.md): a storybook town asleep
// under lanterns. Built from Quaternius' Medieval Village and Fantasy Props kits (0072; KitRoom draws
// them): plaster and timber walls, round-headed doorways, arched windows with their shutters, tiled
// gable roofs, and the rest of the town beyond the walls as smaller houses whose windows light as the
// restoration wave reaches them (nearest street first: the region's victory, street by street).
// Made in code still: the floors (cobbles, floorboards: 0053), the lanterns (a kit lantern read as a
// cage on a gallows at this size) and the lamp posts. Ruin: grey plaster, slate-grey roofs, lanterns
// and windows dark (the kit materials' ruin dial). Restored: the kit's own cream plaster and
// terracotta, lanterns and windows warm. Palette for the code-made parts: town/palette.ts.
// A left world (0052): the houses stand; nobody is home.

const LANTERN = "#FFCB70";
const VILLAGE = "region-3/village";
const PROPS = "region-3/props";
/** A village wall's face stands this far in front of its pivot (catalog: face at z ≈ +0.093). */
const FACE = 0.093;
/** Where a storey's walls end and the gable starts (the kit's walls are 3.12 m with their top beam). */
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

/**
 * A house front facing the room, 2 m wide × one storey (at `scale`), with a gable and a tiled roof
 * running back from it: the square's houses at full size, the rest of the town smaller. `face` is the
 * wall piece (a doorway or a window); a window gets its glass (lit when restored) and its shutters,
 * open or (`closed`) shut. The gable and roof are drawn at `roof` × the house's scale (0.78 keeps a
 * 2 m front's gable inside its own width, so neighbours' roofs meet in a valley, never overlap), and
 * `lift` brings them forward a hair so two neighbours never share a plane. `short` uses the short
 * 2 m roof (the far town: only its front shows).
 */
function houseFront(
  out: KitPlacement[],
  wall: Wall,
  along: number,
  face: string,
  {
    behind = 0,
    scale = 1,
    roof = 0.78,
    lift = 0,
    closed = false,
    short = false,
  }: { behind?: number; scale?: number; roof?: number; lift?: number; closed?: boolean; short?: boolean } = {},
) {
  const s = scale;
  const at = -behind - FACE * s;
  const sized = (k: number) => (Math.abs(k - 1) < 1e-6 ? undefined : k);
  out.push(onWallKit(wall, face, along, { out: at, scale: sized(s) }));
  const kind = /Window_Wide/.test(face) ? "Wide" : /Window_Thin/.test(face) ? "Thin" : null;
  if (kind) {
    if (!closed) out.push(onWallKit(wall, `Window_${kind}_Round1`, along, { out: at, scale: sized(s), glow: true }));
    const shutters = `WindowShutters_${kind}_Round_${closed ? "Closed" : "Open"}`;
    out.push(onWallKit(wall, shutters, along, { out: at, scale: sized(s) }));
  }
  const r = s * roof;
  const top = STOREY * s;
  out.push(onWallKit(wall, "Roof_Front_Brick2", along, { out: at + lift * s + 0.05 * s, y: top, scale: sized(r) }));
  if (short)
    out.push(
      onWallKit(wall, "Roof_RoundTile_2x1", along, {
        out: at + lift * s - 0.2 * r,
        y: top,
        scale: sized(r),
        turn: Math.PI,
      }),
    );
  else
    out.push(onWallKit(wall, "Roof_2x4_RoundTile", along, { out: at + lift * s - 1.75 * r, y: top, scale: sized(r) }));
}

/**
 * The rest of the town beyond a room's walls: rows of smaller houses (streets), roofs and lit windows
 * showing over the walls. The nearer streets light first as the restoration wave spreads (the
 * region's victory: the town lights up street by street).
 */
function farTown(seed: number, start = 1.4, scale = 0.42): KitPlacement[] {
  const random = stream(seed);
  const out: KitPlacement[] = [];
  for (const wall of ["back", "left"] as const) {
    for (const row of [0, 1, 2]) {
      // Each street further back stands a little taller (up the hill), so its windows show over the roofs in front.
      const s = scale * (1 + row * 0.18);
      const behind = start + row * 2.3;
      let k = 0;
      for (let a = -4.6 + random() * 0.4 + (row % 2) * s; a < 4.6; a += 2 * s + random() * 0.12) {
        const face = random() < 0.55 ? "Wall_Plaster_Window_Thin_Round" : "Wall_Plaster_Window_Wide_Round";
        houseFront(out, wall, a, face, {
          behind,
          scale: s,
          lift: (k % 2) * 0.05,
          closed: random() < 0.15,
          short: true,
        });
        k++;
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------
// The Observatory (the Knight's lodging in the town) and the other houses: small plaster interiors in
// the square's own colours, timber framed, with floorboards, lanterns and a window or two.

/**
 * A room's two walls from the inside: the back wall with its doorway at x = 0 (between whole pieces,
 * the gaps filled by plain pieces set a hair behind), the left wall plain with a window or two.
 * Posts of timber cover each joint.
 */
function interiorWalls(windowsBack: number[], windowsLeft: number[]): KitPlacement[] {
  const out: KitPlacement[] = [];
  const plain = (at: number) => (Math.round(at) % 2 === 0 ? "Wall_Plaster_WoodGrid" : "Wall_Plaster_Straight");
  // Back wall: the doorway, plain pieces at either end, fillers between (behind, so their edges hide).
  out.push(wallPiece("back", "Wall_Plaster_Door_Round", 0));
  for (const at of [-3, 3]) {
    out.push(
      wallPiece("back", windowsBack.includes(at) ? "Wall_Plaster_Window_Wide_Round" : "Wall_Plaster_Straight", at),
    );
    if (windowsBack.includes(at)) out.push(onWallKit("back", "Window_Wide_Round1", at, { out: -FACE }));
  }
  for (const at of [-1.55, 1.55]) out.push(wallPiece("back", "Wall_Plaster_Straight", at, -0.015));
  // Left wall: four pieces.
  for (const at of [-3, -1, 1, 3]) {
    const window = windowsLeft.includes(at);
    out.push(wallPiece("left", window ? "Wall_Plaster_Window_Thin_Round" : plain(at), at));
    if (window) out.push(onWallKit("left", "Window_Thin_Round1", at, { out: -FACE }));
  }
  // Timber posts on the joints and in the corner.
  for (const x of [-2, -1, 1, 2]) out.push(onWallKit("back", "Corner_Exterior_Wood", x, { out: 0.02 }));
  for (const z of [-2, 0, 2]) out.push(onWallKit("left", "Corner_Exterior_Wood", z, { out: 0.02 }));
  out.push({ kit: VILLAGE, piece: "Corner_ExteriorWide_Wood", position: [-3.95, 0, -3.95] });
  return out;
}

const OBSERVATORY_KIT: KitPlacement[] = [
  ...interiorWalls([3], [-1]),
  // A fallen street sign's crate, a pot by the wall, a broken one, loose bricks (one weighs down the
  // Knight's letter).
  prop("Vase_2", -3.3, -2.0, 0.4),
  prop("Vase_Rubble_Medium", 3.0, -3.2, 2.2),
  prop("Prop_Crate", 3.0, -1.9, 0.5, 0.55, VILLAGE),
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
  wallLantern(bag, glows, "back", -2.0, 1.75);
  wallLantern(bag, glows, "left", 0.0, 1.75);
  return {
    placements: townObservatoryPieces(_secondDoor),
    kitPieces: [...OBSERVATORY_KIT, ...farTown(5)],
    extras: [...boards(1103), ...extras(bag)],
    glows,
  };
}

export const TOWN_HOUSE_PIECES: Placement[] = [];

const HOUSE_KIT: KitPlacement[] = [
  ...interiorWalls([-3], [-1, 3]),
  prop("Vase_2", -3.3, -0.3, 1.1),
  prop("Vase_Rubble_Medium", 2.6, -3.2, 0.6),
];

export function townHouse() {
  const bag: Bag = {};
  const glows: Glow[] = [];
  wallLantern(bag, glows, "back", 2.4, 1.75);
  wallLantern(bag, glows, "left", 0.0, 1.75, 1.4);
  return {
    placements: TOWN_HOUSE_PIECES,
    kitPieces: [...HOUSE_KIT, ...farTown(11)],
    extras: [...boards(2207), ...extras(bag)],
    glows,
  };
}

// ---------------------------------------------------------------------------------------------------
// The town square (a switch): every doorway is a house's front door; the other places are house
// fronts with a window. Gable roofs above, lamp posts in the square, cobbles underfoot.

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
      houseFront(kit, wall, at, face, { lift: (k % 2) * 0.04, closed: !door && k % 4 === 3 });
      k++;
    }
  }
  // A barrel and a crate by the doors, a pot, a broken one.
  kit.push(prop("Barrel", 2.35, -3.45, 0.4));
  kit.push(prop("Crate_Wooden", -3.45, 2.1, 0.3));
  kit.push(prop("Vase_2", -3.45, 3.55, 0.8));
  kit.push(prop("Vase_Rubble_Medium", 3.2, 2.9, 1.2));
  // The corner where the two rows of houses meet.
  addTo(bag, "Timber", box([0.45, STOREY + 0.2, 0.45], [-4.15, (STOREY + 0.2) / 2, -4.15]));
  // Lamp posts at the edges of the square (none in the foreground, where one cut the view in two).
  lampPost(bag, glows, 3.45, -1.7);
  lampPost(bag, glows, -2.2, 3.5);
  return { kitPieces: [...kit, ...farTown(23, 3.6, 0.5)], extras: [...cobbles(3301), ...extras(bag)], glows };
}

export const TOWN_SQUARE_PIECES: Placement[] = [];
