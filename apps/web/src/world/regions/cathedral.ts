import { BufferAttribute, type BufferGeometry, CircleGeometry, ExtrudeGeometry, ShapeGeometry } from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { type CorridorDressing, corridorFloor } from "../corridor/frame";
import type { Placement } from "../kit/StaticRoom";
import {
  addTo,
  ball,
  box,
  doorFrame,
  extras,
  lancetShape,
  onWall,
  placed,
  prep,
  rod,
  type V3,
  wallWithDoor,
} from "../kit/shapes";
import type { KitPlacement } from "../kits/placement";
import type { Beams, Wall as DoorWall, Glow } from "../room/layout";
import type { StatuePlace } from "../room/standing";

/** The two walls a room has (the near edge, 0111, has no wall to dress). */
type Wall = Exclude<DoorWall, "front">;

// Region 4, the Cathedral of Crossings (world/art-briefs/region-4-cathedral-of-crossings.md): vaulted
// stone, tall pointed arches, stained glass in jewel tones (kept away from cyan), polished brass.
//
// Built from SigilsVault's Modular Cathedral kit (region-4/cathedral; kits/catalog.ts) where it fits
// the 8 × 8 m cutaway: its walls at a quarter scale make 2 × 4 m bays on the rooms' 2 m grid (the
// kit's half scale, its "4 m module", stands 8 m tall: above the camera's frame), dressed-stone bays
// with lancet, tall and rose windows whose own emission atlas lights the glass; its wall trim as a
// stone plinth under every walled bay; its floors (flagstone courses in the chapels, the inlaid floor
// with brass scrollwork bands in the crossing halls); its columns as piers at the corners and,
// fallen, as the ruin. Fantasy Props (region-4/props) gives one candle stand per room (dark in ruin,
// lit restored). No bookcase, rug or table (0052, 0086): the chapels' left-behinds are the builders'
// work (house/Traits.tsx).
// Made in code still, where no kit piece fits: the stained glass laid over the kit's windows
// (coloured in regions/Haze.tsx), the doorways (the kit's doors are 2 × 3.4 m only at the 8 m-tall
// scale; the chapels keep the Ruins kit's gothic arch, the crossing halls a pointed doorway for every
// town, its bay laid in courses like the kit's: the Ashlar swatch), slender shafts on the bays'
// joints, the cornice, the region's statue, the coloured shafts and pools, the haze.
// Restored, the trim sheet's red brick and grey ashlar turn to pale sandstone (`LOOKS[4].kitStone`),
// the floor keeping more of its grey.
// Ruin: cold grey stone, dark glass, grey-blue shafts. Restored: the windows lit, golden and coloured
// light falling across the floor, the candles caught.

const QUARTER = Math.PI / 2;
const GOLD = "#F2CF8A";
const CANDLE = "#FFC46B";
const CATH = "region-4/cathedral";
const PROPS = "region-4/props";
/** Metres per kit unit for the walls: a bay is 8 × 16 units, so 2 × 4 m. */
const E = 0.25;
const BAY = 8 * E;
const HEIGHT = 16 * E;

type Bag = Record<string, BufferGeometry[]>;

// Coloured light falls in from the back left, down across the floor.
const SHAFT: V3 = [0.55, -0.85, 0.55];
// Jewel-tinted shafts (ruby, sapphire, gold; kept away from cyan), strong enough to colour the floor.
const SHAFT_TINTS = [GOLD, "#E0707E", "#7E9CE6"];

/** What a room's dressing collects: kit pieces, code-made pieces, lights, shafts and glass. */
type Room = { kit: KitPlacement[]; bag: Bag; glows: Glow[]; beams: Beams["list"]; glass: BufferGeometry[] };

function newRoom(): Room {
  return { kit: [], bag: {}, glows: [], beams: [], glass: [] };
}

/** A kit wall bay along a wall, covering [from, from + 2] with its inner face on the wall's plane. */
function bay(piece: string, wall: Wall, from: number, glow?: boolean): KitPlacement {
  const scale = E / 0.5;
  return wall === "back"
    ? { kit: CATH, piece, position: [from, 0, -4 - E], scale, glow }
    : { kit: CATH, piece, position: [-4 - E, 0, from + BAY], rotationY: QUARTER, scale, glow };
}

/** Where, along a wall and out from it, a point in the room is. */
function inside(wall: Wall, along: number, out: number, y: number): V3 {
  return wall === "back" ? [along, y, -4 + out] : [-4 + out, y, along];
}

// The glass in each kit window, measured from its emission atlas (metres at E, from the bay's sill
// line): the lancet, the tall triple lancet, the rose.
const WINDOWS = {
  lancet: { piece: "wall_window_01", width: 0.84, sill: 1.24, height: 1.98 },
  tall: { piece: "wall_window_large_01", width: 0.82, sill: 0.6, height: 2.64 },
  rose: { piece: "wall_rose_window_01", width: 1.48, sill: 1.26, height: 1.48 },
} as const;
type WindowKind = keyof typeof WINDOWS;

/** A pane of stained glass over a kit window: `pane` = (u, v, kind: 0 lancet, 1 rose, 2 tall) for Haze.tsx. */
function pane(kind: WindowKind, wall: Wall, along: number): BufferGeometry {
  const w = WINDOWS[kind];
  const source =
    kind === "rose"
      ? new CircleGeometry(w.width / 2, 40).translate(0, w.height / 2, 0)
      : new ShapeGeometry(lancetShape(w.width, w.height), 8);
  const g = source.toNonIndexed();
  const position = g.getAttribute("position");
  const values = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    values[i * 3] = position.getX(i) / w.width + 0.5;
    values[i * 3 + 1] = position.getY(i) / w.height;
    values[i * 3 + 2] = kind === "rose" ? 1 : kind === "tall" ? 2 : 0;
  }
  const out = prep(g);
  out.setAttribute("pane", new BufferAttribute(values, 3));
  // Just in front of the kit's glass card (which stands 1.3 cm proud of the wall), behind its mouldings.
  return onWall(out, wall, along, w.sill, 0.028);
}

/**
 * A lit window bay: the kit's window wall (its glass glows from the emission atlas when restored),
 * stained glass over it, its light, and a shaft of coloured light falling into the room.
 */
function windowBay(room: Room, wall: Wall, from: number, kind: WindowKind, light = true) {
  const w = WINDOWS[kind];
  const along = from + BAY / 2;
  room.kit.push(bay(w.piece, wall, from, true));
  room.glass.push(pane(kind, wall, along));
  if (light)
    room.glows.push({
      position: inside(wall, along, 0.9, w.sill + w.height * 0.55),
      colour: GOLD,
      strength: kind === "rose" ? 1.3 : 1.6,
    });
  // Each window's shaft takes a tint from its glass: gold, rose, pale sapphire in turn.
  const tint = SHAFT_TINTS[room.beams.length % SHAFT_TINTS.length];
  room.beams.push({
    from: inside(wall, along, 0.15, w.sill + w.height * 0.5),
    width: w.width * 0.9,
    depth: 0.5,
    colour: tint,
  });
}

/** The floor: kit slabs (flagstone courses in the chapels, marble chequer in the halls), 4 × 4 m each. */
function floor(piece: "floor_01" | "floor_02" | "floor_03"): KitPlacement[] {
  return [-2, 2].flatMap((x) => [-2, 2].map((z): KitPlacement => ({ kit: CATH, piece, position: [x, 0, z] })));
}

/** Piers at the cutaway's corners: where the walls meet, and where each ends at the front. */
function piers(): KitPlacement[] {
  const scale = 0.88; // 4 m tall, like the walls
  return [
    { kit: CATH, piece: "column_small_01", position: [-4.1, 0, -4.1], scale },
    { kit: CATH, piece: "column_small_01", position: [4, 0, -4.1], scale },
    { kit: CATH, piece: "column_small_01", position: [-4.1, 0, 4], scale },
  ];
}

/** A column fallen across the floor (the ruin): lying along +z from `at`, or turned by `turn`. */
function fallenColumn(at: [number, number], turn = 0, scale = 0.5): KitPlacement {
  const radius = 0.872 * 0.5 * scale;
  return { kit: CATH, piece: "column_small_01", position: [at[0], radius, at[1]], rotation: [QUARTER, turn, 0], scale };
}

/** One tall candle stand (dark in ruin, its candles caught when restored) and its light. */
function candles(room: Room, at: [number, number]) {
  room.kit.push({ kit: PROPS, piece: "CandleStick_Stand", position: [at[0], 0, at[1]], rotationY: 0.4, glow: true });
  room.glows.push({ position: [at[0], 1.45, at[1]], colour: CANDLE, strength: 1.3 });
}

/** A string course (a moulded band) along a wall at height y. */
function course(bag: Bag, wall: Wall, from: number, to: number, y: number, depth = 0.12) {
  addTo(bag, "Highlights", onWall(box([to - from, 0.14, depth], [0, 0, depth / 2]), wall, (from + to) / 2, y, 0));
}

/**
 * A stone plinth course along the foot of a bay (the kit's wall trim, 0.75 m tall, standing 0.1 m
 * proud of the wall): the bench-table of a gothic wall, under every bay that isn't a doorway.
 */
function plinth(wall: Wall, from: number): KitPlacement {
  const scale = E / 0.5;
  const face = -4 - 0.608 * E + 0.1;
  return wall === "back"
    ? { kit: CATH, piece: "wall_trim_01", position: [from, 0, face], scale }
    : { kit: CATH, piece: "wall_trim_01", position: [face, 0, from + BAY], rotationY: QUARTER, scale };
}

/**
 * A slender stone shaft (a colonnette) on a joint between two bays, from the plinth up to the cornice,
 * with a moulded base and capital: the wall's vertical rhythm, as a nave's bays have.
 */
function shaft(bag: Bag, wall: Wall, along: number) {
  const out = 0.16;
  const p = (y: number): V3 => inside(wall, along, out, y);
  addTo(bag, "Highlights", rod(p(0.75), p(HEIGHT - 0.12), 0.065, 8));
  addTo(bag, "Highlights", rod(p(0.75), p(0.86), 0.1, 8, 0.07));
  addTo(bag, "Highlights", rod(p(HEIGHT - 0.24), p(HEIGHT - 0.04), 0.07, 8, 0.12));
}

/**
 * At most three room lights (`glows`): a fourth point light blanked the whole static room on WebGPU
 * (measured 2026-10-13, the crossing hall with a rose, two lancets and candles). Windows beyond the
 * third glow by their own emission and shafts only.
 */
const MAX_GLOWS = 3;

function finish(room: Room) {
  if (import.meta.env.DEV && room.glows.length > MAX_GLOWS) console.warn("[wirelight] cathedral: too many glows");
  const glass = room.glass.length > 0 ? mergeGeometries(room.glass) : null;
  return {
    kitPieces: room.kit,
    extras: extras(room.bag),
    glows: room.glows.slice(0, MAX_GLOWS),
    beams: { list: room.beams, direction: SHAFT, colour: GOLD, ruined: 0.1, restored: 0.7, pools: true },
    ...(glass ? { stainedGlass: glass } : {}),
  };
}

// ---------------------------------------------------------------------------------------------------
// The Observatory: a side chapel of the Cathedral. A lancet in the back wall, a tall window in the
// left, the gothic arch to the nave (and a second to the left with two doors), the region's statue in
// the far corner, a column fallen along the left wall, candles in the back corner. A stone plinth
// under the bays, shafts on their joints, a cornice along the top.

export function cathedralObservatoryPieces(secondDoor: boolean): Placement[] {
  return [
    { piece: "Wall_ArchGothic", position: [0, 0, -4] },
    ...(secondDoor ? [{ piece: "Wall_ArchGothic", position: [-4, 0, 2], rotationY: QUARTER } as Placement] : []),
    { piece: "Bricks", position: [-2.9, 0, 3.5], rotationY: 2.1, scale: 0.7 },
    { piece: "Brick", position: [-2.2, 0, 2.6], rotationY: 0.7 },
    { piece: "Brick", position: [1.75, 0, 2.55], rotationY: 2.0 }, // weighs down the old letter
  ];
}

/** The plain and window bays of a chapel's walls, their plinths, shafts on the joints and a cornice. */
function chapelWalls(room: Room, back: Record<number, WindowKind | "wall">, left: Record<number, WindowKind | "wall">) {
  for (const [wall, bays] of [
    ["back", back],
    ["left", left],
  ] as const) {
    const starts = Object.keys(bays).map(Number);
    for (const from of starts) {
      const kind = bays[from];
      if (kind === "wall") room.kit.push(bay("wall_01", wall, from));
      else if (kind) windowBay(room, wall, from, kind);
      room.kit.push(plinth(wall, from));
    }
    // A shaft wherever two bays meet (not beside an arch: the Ruins kit's arch has its own jambs).
    for (const from of starts) if (starts.includes(from + BAY)) shaft(room.bag, wall, from + BAY);
    course(room.bag, wall, -4, 4, HEIGHT + 0.07, 0.2);
  }
}

export function cathedralObservatory(secondDoor: boolean) {
  const room = newRoom();
  chapelWalls(
    room,
    { [-4]: "lancet", 2: "wall" },
    secondDoor ? { [-4]: "wall", [-2]: "tall" } : { [-4]: "wall", [-2]: "tall", 0: "wall", 2: "wall" },
  );
  room.kit.push(...floor("floor_01"), ...piers(), fallenColumn([-3.25, 0.4]));
  candles(room, [-3.1, -3.15]);
  // The region's statue stands here now (room/RegionStatue.tsx, 0094).
  const statues: StatuePlace[] = [
    { slug: "temple-pillar", position: [6.2, 0, -6.1], turn: 0.2, scale: 0.85 },
    { slug: "candle-altar", position: [2.8, 0, -3.15], turn: -0.3, scale: 0.7 },
  ];
  return { placements: cathedralObservatoryPieces(secondDoor), ...finish(room), statues };
}

// ---------------------------------------------------------------------------------------------------
// Another computer's room: a small chapel-like study. A lancet in the back wall, a tall window in the
// left, candles by the back wall where the other regions keep their lamp. No bookcase, rug or table
// (0052): what the cathedral's builders left in each is in house/Traits.tsx.

export const CATHEDRAL_HOUSE_PIECES: Placement[] = [
  { piece: "Bricks", position: [2.9, 0, 2.0], rotationY: 0.9, scale: 0.7 },
  // Clear of the near-edge door's path (0111).
  { piece: "Brick", position: [-3.2, 0, 1.2], rotationY: 0.4 },
];

export function cathedralHouse() {
  const room = newRoom();
  // The back wall whole (0111: the door is on the near edge).
  chapelWalls(
    room,
    { [-4]: "lancet", [-2]: "wall", 0: "wall", 2: "wall" },
    { [-4]: "wall", [-2]: "tall", 0: "wall", 2: "wall" },
  );
  room.kit.push(...floor("floor_01"), ...piers());
  candles(room, [-3.1, -3.15]);
  const statues: StatuePlace[] = [{ slug: "temple-pillar-broken", position: [6.2, 0, -6.1], turn: 0.2, scale: 0.85 }];
  return { placements: CATHEDRAL_HOUSE_PIECES, ...finish(room), statues };
}

// ---------------------------------------------------------------------------------------------------
// A crossing hall (a router): a great pointed door for every town it joins, a rose window and tall
// lancets between, a stone plinth and shafts along the bays, the crossing's inlaid floor underfoot.

export const CATHEDRAL_HALL_PIECES: Placement[] = [{ piece: "Bricks", position: [2.9, 0, 2.6], rotationY: 0.8 }];

/** Which free bays get windows, in order of preference: the rose first, then two lancets. */
const ROSE_BAYS: { wall: Wall; at: number }[] = [
  { wall: "back", at: -1 },
  { wall: "left", at: -1 },
  { wall: "back", at: 1 },
  { wall: "left", at: 1 },
];
const LANCET_BAYS: { wall: Wall; at: number }[] = [
  { wall: "left", at: -3 },
  { wall: "back", at: -3 },
  { wall: "left", at: -1 },
  { wall: "back", at: -1 },
  { wall: "left", at: 1 },
  { wall: "back", at: 1 },
];

export function cathedralHall(used: { wall: Wall; at: number }[]) {
  const room = newRoom();
  const taken = (wall: Wall, at: number) => used.some((s) => s.wall === wall && s.at === at);
  const rose = ROSE_BAYS.find((b) => !taken(b.wall, b.at));
  const lancets = LANCET_BAYS.filter(
    (b) => !taken(b.wall, b.at) && !(rose && b.wall === rose.wall && b.at === rose.at),
  );
  const lit = lancets.slice(0, 2);
  for (const wall of ["back", "left"] as const) {
    for (const at of [-3, -1, 1, 3]) {
      if (taken(wall, at)) {
        // A pointed doorway: the wall around it laid in courses like the kit's, a moulded frame, the
        // dark beyond in the arch's shape.
        addTo(room.bag, "Ashlar", onWall(wallWithDoor(2, HEIGHT, 0.3, 1.8, 2.9, true), wall, at, 0));
        addTo(room.bag, "Stone", onWall(doorFrame(1.8, 2.9, 0.16, 0.14, true), wall, at, 0));
        const dark = prep(new ExtrudeGeometry(lancetShape(1.8, 2.9), { depth: 0.02, bevelEnabled: false }));
        addTo(room.bag, "Void", onWall(dark, wall, at, 0, -0.3));
        continue;
      }
      if (rose && rose.wall === wall && rose.at === at) windowBay(room, wall, at - 1, "rose");
      else if (lit.some((b) => b.wall === wall && b.at === at))
        windowBay(room, wall, at - 1, "lancet", lit[0]?.wall === wall && lit[0]?.at === at);
      else room.kit.push(bay("wall_01", wall, at - 1));
      room.kit.push(plinth(wall, at - 1));
    }
    // Shafts on the joints between two walled bays (a doorway's frame stands alone).
    for (const joint of [-2, 0, 2])
      if (!taken(wall, joint - 1) && !taken(wall, joint + 1)) shaft(room.bag, wall, joint);
    // A cornice along the top, tying the kit's bays and the doorways together.
    course(room.bag, wall, -4, 4, HEIGHT + 0.07, 0.2);
  }
  room.kit.push(...floor("floor_03"), ...piers());
  // Candles in the far corner, by the plain bay (never in the foreground, where they hid the floor).
  candles(room, [3.25, -3.25]);
  return finish(room); // its placements: CATHEDRAL_HALL_PIECES (hall/layout.ts)
}

// ---------------------------------------------------------------------------------------------------
// A corridor (0081): a cloister walk (region-4 brief). Wall bays along the back on a stone plinth,
// shafts between them, a lancet whose coloured light falls across the floor, a cornice, candles at
// the far end; the rune-line inlaid down the middle. Room coordinates: back wall on z = −4, x from −5
// to 5.

export function cathedralCorridor(): CorridorDressing {
  const room = newRoom();
  for (const from of [-5, -3, -1, 1, 3]) {
    if (from === -1) windowBay(room, "back", from, "lancet");
    else room.kit.push(bay("wall_01", "back", from));
    room.kit.push(plinth("back", from));
  }
  for (const joint of [-3, -1, 1, 3]) shaft(room.bag, "back", joint);
  course(room.bag, "back", -5, 5, HEIGHT + 0.07, 0.2);
  candles(room, [4.1, -3.4]);
  const done = finish(room);
  return {
    placements: [{ piece: "Bricks", position: [-3.6, 0, -0.9], rotationY: 0.4, scale: 0.6 }],
    ...done,
    extras: [...corridorFloor(4, "Floor", 5401), ...done.extras],
  };
}
