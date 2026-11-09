import type { Topology } from "@wirelight/sim";
import { floorPlan, slotsOf } from "./plan";

// The floor as it really lies (decision 0118, 0120): every room an 8 × 8 m square with its back wall to
// the north (−z) and its left wall to the west (−x), as the room view shows it. A machine one Map column
// to the right is one step north-east (screen-right from the room camera, which looks from the south-
// east); one row down is one step south-east (toward the camera). A cable is an L between its two doors:
// out of the left room's back-wall door to the north, then east into the right room's left-wall door.
// The Map draws this from the camera's angle; the bird's-eye view builds it.

export type P2 = { x: number; z: number };
export type MapRoom = { id: string; centre: P2; column: number };
export type MapCable = { id: string; a: string; b: string; points: P2[] };
export type PalaceMap = { rooms: Map<string, MapRoom>; cables: Map<string, MapCable> };

const HALF = 4;
const R = { x: Math.SQRT1_2, z: -Math.SQRT1_2 }; // one column right: north-east
const D = { x: Math.SQRT1_2, z: Math.SQRT1_2 }; // one row down: south-east
/** Rows in the same column never overlap: a row step this long clears an 8 m room with a margin. */
const ROW = 13;
/** Corridor beyond each door before it turns, at least. */
const MARGIN = 2.5;

const cache = new WeakMap<Topology, Map<string, PalaceMap>>();

export function palaceMap(t: Topology, start: string): PalaceMap {
  const byStart = cache.get(t) ?? new Map<string, PalaceMap>();
  cache.set(t, byStart);
  const known = byStart.get(start);
  if (known) return known;
  const made = build(t, start);
  byStart.set(start, made);
  return made;
}

/** Where a door really is: its wall (a mirrored house's back arch is on its left wall) and offset. */
function doorOf(t: Topology, start: string, device: string, iface: string) {
  const p = floorPlan(t, start).devices.get(device);
  const slot = p ? slotsOf(p).get(iface) : undefined;
  if (!p || !slot) return { wall: "back" as const, at: 0 };
  if (p.mirrored) return { wall: slot.wall === "back" ? ("left" as const) : ("back" as const), at: slot.at };
  return { wall: slot.wall, at: slot.at };
}

function build(t: Topology, start: string): PalaceMap {
  const plan = floorPlan(t, start);
  // Rows: each column in the plan's order, at least one row apart, centred on where the plan put them.
  const row = new Map<string, number>();
  const columns = new Map<number, string[]>();
  for (const d of t.devices) {
    const c = plan.devices.get(d.id)?.column ?? 0;
    columns.set(c, [...(columns.get(c) ?? []), d.id]);
  }
  const tallest = Math.max(...[...columns.values()].map((ids) => ids.length));
  for (const ids of columns.values()) {
    ids.sort((a, b) => (plan.devices.get(a)?.y ?? 0) - (plan.devices.get(b)?.y ?? 0));
    const wanted = ids.map((id) => (plan.devices.get(id)?.y ?? 0.5) * Math.max(1, tallest - 1));
    const placed: number[] = [];
    for (const [i, w] of wanted.entries()) placed.push(i === 0 ? w : Math.max(w, (placed[i - 1] as number) + 1));
    const shift = wanted.reduce((s, w) => s + w, 0) / wanted.length - placed.reduce((s, v) => s + v, 0) / placed.length;
    for (const [i, id] of ids.entries()) row.set(id, (placed[i] as number) + shift);
  }

  // Each cable, its left and right ends.
  const ends = t.links.map((l) => {
    const ca = plan.devices.get(l.a.device)?.column ?? 0;
    const cb = plan.devices.get(l.b.device)?.column ?? 0;
    const [left, right] = ca <= cb ? [l.a, l.b] : [l.b, l.a];
    return { id: l.id, left, right };
  });

  // The column step: long enough that every L clears both rooms (see the inequalities below).
  let step = 2 * HALF + 2 * MARGIN;
  for (const { left, right } of ends) {
    const dv = ((row.get(right.device) ?? 0) - (row.get(left.device) ?? 0)) * ROW;
    const a = doorOf(t, start, left.device, left.iface).at;
    const b = doorOf(t, start, right.device, right.iface).at;
    // The turn north of the left room: (dv − step)/√2 + b < −HALF − MARGIN.
    step = Math.max(step, dv + Math.SQRT2 * (HALF + MARGIN + b));
    // …and west of the right room: (step + dv)/√2 > a + HALF + MARGIN.
    step = Math.max(step, Math.SQRT2 * (a + HALF + MARGIN) - dv);
  }

  const rooms = new Map<string, MapRoom>();
  for (const d of t.devices) {
    const u = (plan.devices.get(d.id)?.column ?? 0) * step;
    const v = (row.get(d.id) ?? 0) * ROW;
    rooms.set(d.id, {
      id: d.id,
      column: plan.devices.get(d.id)?.column ?? 0,
      centre: { x: u * R.x + v * D.x, z: u * R.z + v * D.z },
    });
  }

  const cables = new Map<string, MapCable>();
  for (const { id, left, right } of ends) {
    const A = rooms.get(left.device)?.centre ?? { x: 0, z: 0 };
    const B = rooms.get(right.device)?.centre ?? { x: 0, z: 0 };
    const da = doorOf(t, start, left.device, left.iface);
    const db = doorOf(t, start, right.device, right.iface);
    // The left end's door is on its back wall, the right end's on its left wall (0118).
    const pa: P2 = da.wall === "back" ? { x: A.x + da.at, z: A.z - HALF } : { x: A.x - HALF, z: A.z + da.at };
    const pb: P2 = db.wall === "left" ? { x: B.x - HALF, z: B.z + db.at } : { x: B.x + db.at, z: B.z - HALF };
    const turn: P2 = { x: pa.x, z: pb.z };
    cables.set(id, { id, a: left.device, b: right.device, points: [pa, turn, pb] });
  }
  return { rooms, cables };
}

/** The room's floor corners (back-left, back-right, front-right, front-left). */
export function corners(c: P2): P2[] {
  return [
    { x: c.x - HALF, z: c.z - HALF },
    { x: c.x + HALF, z: c.z - HALF },
    { x: c.x + HALF, z: c.z + HALF },
    { x: c.x - HALF, z: c.z + HALF },
  ];
}

/** Seen from the room camera (VIEW_DIRECTION (1, 0.9, 1)): screen x, and screen y (down). */
export function onScreen(p: P2): { x: number; y: number } {
  return { x: (p.x - p.z) * Math.SQRT1_2, y: (p.x + p.z) * Math.SQRT1_2 * 0.54 };
}

/** A point `t` (0…1) along a polyline, by length. */
export function alongPath<T extends { x: number; y: number }>(points: T[], t: number): { x: number; y: number } {
  const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - (points[i] as T).x, p.y - (points[i] as T).y));
  let d = Math.max(0, Math.min(1, t)) * lengths.reduce((s, l) => s + l, 0);
  for (let i = 0; i < lengths.length; i++) {
    const len = lengths[i] as number;
    const a = points[i] as T;
    const b = points[i + 1] as T;
    if (d <= len || i === lengths.length - 1) {
      const k = len === 0 ? 0 : Math.min(1, d / len);
      return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k };
    }
    d -= len;
  }
  return { x: points[0]?.x ?? 0, y: points[0]?.y ?? 0 };
}
