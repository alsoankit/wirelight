import type { Topology } from "@wirelight/sim";
import type { DoorSlot } from "./layout";

// Doors follow the Map (decision 0111), on the far walls only (0116: the near sides stay open so the
// whole room is always in view). The floor Map lays machines out by distance from the player's machine:
// - further from the player → the back wall (deeper into the floor);
// - closer to the player (the way back) or the same distance (a branch) → the left wall.

export type Side = "back" | "left";

/** Each machine's distance from `start`, counted in cables (a breadth-first walk, as the Map does). */
export function depthsFrom(t: Topology, start: string): Map<string, number> {
  const next = new Map<string, string[]>();
  for (const l of t.links) {
    next.set(l.a.device, [...(next.get(l.a.device) ?? []), l.b.device]);
    next.set(l.b.device, [...(next.get(l.b.device) ?? []), l.a.device]);
  }
  const depth = new Map<string, number>([[start, 0]]);
  const queue = [start];
  while (queue.length) {
    const d = queue.shift() as string;
    for (const n of next.get(d) ?? [])
      if (!depth.has(n)) {
        depth.set(n, (depth.get(d) ?? 0) + 1);
        queue.push(n);
      }
  }
  for (const d of t.devices) if (!depth.has(d.id)) depth.set(d.id, 0);
  return depth;
}

/** Which side each of `here`'s doors belongs on, by the machine its cable leads to. */
export function doorSides(t: Topology, start: string, here: string): Map<string, Side> {
  const depth = depthsFrom(t, start);
  const mine = depth.get(here) ?? 0;
  const out = new Map<string, Side>();
  for (const l of t.links) {
    const end = l.a.device === here ? l.a : l.b.device === here ? l.b : undefined;
    const other = end === l.a ? l.b : l.a;
    if (!end) continue;
    const theirs = depth.get(other.device) ?? 0;
    out.set(end.iface, theirs > mine ? "back" : "left");
  }
  return out;
}

/**
 * The room's slots, in door order: each door takes the first free slot on its side; a door whose side
 * has no free slot takes the first free slot anywhere (back walls first), as rooms always did.
 */
export function slotsFor(doors: readonly string[], sides: ReadonlyMap<string, Side>, slots: readonly DoorSlot[]) {
  const free = [...slots];
  const take = (pick: (s: DoorSlot) => boolean) => {
    const i = free.findIndex(pick);
    return i < 0 ? undefined : free.splice(i, 1)[0];
  };
  const wanted = doors.map((door) => {
    const side = sides.get(door);
    return side ? take((s) => (s.wall as string) === side) : undefined;
  });
  const placed = wanted.map((slot) => slot ?? take(() => true));
  return { placed, rest: free };
}
