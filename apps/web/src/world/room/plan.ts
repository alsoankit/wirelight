import type { Topology } from "@wirelight/sim";
import type { DoorSlot, Wall } from "./layout";

// One left-to-right flow for the whole floor (decision 0118). On screen the back wall is the room's
// right half and the left wall its left half, so every cable reads left to right: if B is to the
// right of A, A's door to B is on A's back wall and B's door to A is on B's left wall. Along either
// wall, a door nearer the corner is higher on screen, so the room behind it is higher on the Map.
//
// Each floor's network is a tree (twin cables between two machines go the same way). Every cable is
// pointed away from the player's machine (deeper = further right) unless the room's wall on that
// side is full; then it goes the other way. The Map, the rooms, the corridors and the bird's-eye
// view all read this one plan.

export type RoomKind = "observatory" | "hall" | "house";
export type Side = "right" | "left";

export type DevicePlan = {
  kind: RoomKind;
  /** Doors on each far wall, from the corner outward (top of the screen first); empty ports included. */
  back: string[];
  left: string[];
  /** A house whose one door is on the left wall: the house mirrored across its diagonal (x ↔ z). */
  mirrored: boolean;
  /** Map column (0 = leftmost) and height (0 = top … 1 = bottom), before spreading within a column. */
  column: number;
  y: number;
};

export type FloorPlan = { devices: Map<string, DevicePlan>; columns: number };

/** How many doors each far wall can hold. */
const CAPACITY: Record<RoomKind, (doors: number) => { back: number; left: number }> = {
  // One door: the back arch. Two: one on each wall (observatory/layout.ts).
  observatory: (n) => (n > 1 ? { back: 1, left: 1 } : { back: 1, left: 0 }),
  // One door, on either wall (the left one by mirroring).
  house: () => ({ back: 1, left: 1 }),
  hall: () => ({ back: 4, left: 4 }),
};

export function kindOf(t: Topology, start: string, device: string): RoomKind {
  if (device === start) return "observatory";
  const spec = t.devices.find((d) => d.id === device);
  const ports = spec?.interfaces.filter((i) => i.name !== "lo").length ?? 0;
  return spec?.bridges?.length || ports > 1 ? "hall" : "house";
}

const cache = new WeakMap<Topology, Map<string, FloorPlan>>();

/** The floor's plan, seen from the player's machine `start`. */
export function floorPlan(t: Topology, start: string): FloorPlan {
  const byStart = cache.get(t) ?? new Map<string, FloorPlan>();
  cache.set(t, byStart);
  const known = byStart.get(start);
  if (known) return known;
  const plan = makePlan(t, start);
  byStart.set(start, plan);
  return plan;
}

type Edge = { here: string; iface: string; other: string; otherIface: string };

function makePlan(t: Topology, start: string): FloorPlan {
  // Each machine's cables, in its own door order (eth0 first).
  const edges = new Map<string, Edge[]>();
  for (const d of t.devices) edges.set(d.id, []);
  for (const l of t.links) {
    edges.get(l.a.device)?.push({ here: l.a.device, iface: l.a.iface, other: l.b.device, otherIface: l.b.iface });
    edges.get(l.b.device)?.push({ here: l.b.device, iface: l.b.iface, other: l.a.device, otherIface: l.a.iface });
  }
  for (const list of edges.values()) list.sort((a, b) => a.iface.localeCompare(b.iface, "en", { numeric: true }));

  const kind = new Map(t.devices.map((d) => [d.id, kindOf(t, start, d.id)]));
  const room = (id: string) => ({
    back: [] as string[],
    left: [] as string[],
    cap: CAPACITY[kind.get(id) ?? "hall"]((edges.get(id) ?? []).length),
  });
  const rooms = new Map(t.devices.map((d) => [d.id, room(d.id)]));
  // Where each machine is relative to the one it was reached from, and its offset on the Map.
  const side = new Map<string, Side>([[start, "right"]]);
  const column = new Map<string, number>([[start, 0]]);
  const y = new Map<string, number>([[start, 0]]);
  const spread = new Map<string, number>([[start, 1]]);

  const parent = new Map<string, string>();
  const order = [start];
  const seen = new Set([start]);
  for (let k = 0; k < order.length; k++) {
    const u = order[k] as string;
    const r = rooms.get(u);
    if (!r) continue;
    // Its neighbours not yet placed, twin cables grouped (they share one direction).
    const groups = new Map<string, Edge[]>();
    for (const e of edges.get(u) ?? []) {
      if (seen.has(e.other) && !groups.has(e.other)) continue;
      groups.set(e.other, [...(groups.get(e.other) ?? []), e]);
    }
    const outward = side.get(u) ?? "right";
    for (const [other, group] of groups) {
      const fits = (s: Side) =>
        s === "right" ? r.back.length + group.length <= r.cap.back : r.left.length + group.length <= r.cap.left;
      const flipped: Side = outward === "right" ? "left" : "right";
      const s: Side = fits(outward) || !fits(flipped) ? outward : flipped;
      const theirs = rooms.get(other);
      for (const e of group) {
        (s === "right" ? r.back : r.left).push(e.iface);
        (s === "right" ? theirs?.left : theirs?.back)?.push(e.otherIface);
      }
      side.set(other, s);
      parent.set(other, u);
      column.set(other, (column.get(u) ?? 0) + (s === "right" ? 1 : -1));
      seen.add(other);
      order.push(other);
    }
  }
  // Machines no cable reaches stand beside the player's machine.
  for (const d of t.devices) if (!column.has(d.id)) column.set(d.id, 0);

  // Empty ports (a hall's spare doors) take the emptier wall.
  for (const d of t.devices) {
    const r = rooms.get(d.id);
    if (!r) continue;
    const linked = new Set([...r.back, ...r.left]);
    for (const i of d.interfaces) {
      if (i.name === "lo" || linked.has(i.name)) continue;
      (r.back.length < r.cap.back || r.left.length >= r.cap.left ? r.back : r.left).push(i.name);
    }
  }

  // Order along each wall, from the corner (top) outward: doors in door order, except that the way
  // back (to the machine this one was reached from) sits in the middle of its wall, so the Map can
  // put the other neighbours on that side above and below it.
  for (const [id, r] of rooms) {
    const up = parent.get(id);
    if (!up) continue;
    const wall = side.get(id) === "right" ? r.left : r.back;
    const back = (edges.get(id) ?? []).filter((e) => e.other === up).map((e) => e.iface);
    const rest = wall.filter((i) => !back.includes(i));
    rest.splice(Math.floor(rest.length / 2), 0, ...back);
    wall.splice(0, wall.length, ...rest);
  }

  // Heights: each neighbour offset from its machine by its place along the wall, halving each step.
  for (const u of order) {
    const r = rooms.get(u);
    if (!r) continue;
    const step = spread.get(u) ?? 1;
    for (const wall of [r.back, r.left]) {
      const others: string[] = [];
      for (const iface of wall) {
        const e = (edges.get(u) ?? []).find((x) => x.iface === iface);
        if (e && !others.includes(e.other)) others.push(e.other);
      }
      const up = parent.get(u);
      const anchor = up ? others.indexOf(up) : -1;
      const centre = anchor >= 0 ? anchor : (others.length - 1) / 2;
      others.forEach((o, i) => {
        if (o === up || y.has(o)) return;
        y.set(o, (y.get(u) ?? 0) + (i - centre) * step);
        spread.set(o, step / 2);
      });
    }
  }

  const min = Math.min(...column.values());
  const columns = Math.max(...column.values()) - min + 1;
  const ys = [...y.values()];
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  const devices = new Map<string, DevicePlan>();
  for (const d of t.devices) {
    const r = rooms.get(d.id) ?? room(d.id);
    const k = kind.get(d.id) ?? "hall";
    devices.set(d.id, {
      kind: k,
      back: r.back,
      left: r.left,
      mirrored: k === "house" && r.left.length > 0,
      column: (column.get(d.id) ?? 0) - min,
      y: hi > lo ? ((y.get(d.id) ?? 0) - lo) / (hi - lo) : 0.5,
    });
  }
  return { devices, columns };
}

/** A hall's arch positions along one wall, from the corner outward, for `n` doors on it. */
const HALL_AT: Record<number, number[]> = { 0: [], 1: [1], 2: [-1, 3], 3: [-1, 1, 3], 4: [-3, -1, 1, 3] };

/** The far-wall slot each of a machine's doors takes (decision 0118), by door name. */
export function slotsOf(p: DevicePlan): Map<string, DoorSlot> {
  const out = new Map<string, DoorSlot>();
  const put = (wall: Wall, ifaces: string[], at: number[], plate?: DoorSlot["plate"]) =>
    ifaces.forEach((iface, i) => {
      const a = at[i];
      if (a !== undefined) out.set(iface, plate ? { wall, at: a, plate } : { wall, at: a });
    });
  if (p.kind === "hall") {
    put("back", p.back, HALL_AT[p.back.length] ?? HALL_AT[4] ?? [], "above");
    put("left", p.left, HALL_AT[p.left.length] ?? HALL_AT[4] ?? [], "above");
  } else if (p.kind === "observatory") {
    // observatory/layout.ts: the back arch at x = 0, the left wall's arch at z = 2.
    put("back", p.back, [0]);
    put("left", p.left, [2]);
  } else {
    // A house's one arch is its back arch; mirrored, that arch is on the left wall (see `MIRROR`).
    put("back", [...p.back, ...p.left], [0]);
  }
  return out;
}

/** A short name for the layout (pictures, bakes): halls by doors per wall, mirrored houses marked. */
export function layoutKey(region: number, p: DevicePlan): string {
  if (p.kind === "hall") return `r${region}-hall-b${p.back.length}l${p.left.length}`;
  if (p.kind === "observatory") return `r${region}-observatory-d${p.back.length + p.left.length > 1 ? 2 : 1}`;
  return `r${region}-house-d1${p.mirrored ? "-m" : ""}`;
}

/** The diagonal mirror (x ↔ z): the back wall becomes the left wall; the camera's diagonal is unchanged. */
export const MIRROR = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1] as const;

/** One machine's plan (undefined if it isn't on the floor). */
export function planOf(t: Topology, start: string, device: string): DevicePlan | undefined {
  return floorPlan(t, start).devices.get(device);
}

/** A hall's arches for `device` (for hallLayout), from the plan. */
export function hallSlots(t: Topology, start: string, device: string): DoorSlot[] {
  const p = planOf(t, start, device);
  return p ? [...slotsOf(p).values()] : [];
}
