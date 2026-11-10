import { rooms } from "@wirelight/rooms";
import { describe, expect, it } from "vitest";
import { palaceMap } from "../src/world/room/palaceMap";
import { floorPlan, slotsOf } from "../src/world/room/plan";

// Decision 0118: one left-to-right flow. A cable's left end is on its machine's back wall, its right
// end on the other machine's left wall, and the left machine is in a lower Map column.
describe("floor plan", () => {
  for (const room of rooms)
    it(`${room.id}: every cable reads left to right, and every door has its own far-wall slot`, () => {
      const plan = floorPlan(room.topology, room.playerDevice);
      for (const l of room.topology.links) {
        const a = plan.devices.get(l.a.device);
        const b = plan.devices.get(l.b.device);
        if (!a || !b) throw new Error("missing machine");
        const [left, right, leftIface, rightIface] =
          a.column < b.column ? [a, b, l.a.iface, l.b.iface] : [b, a, l.b.iface, l.a.iface];
        expect(right.column).toBe(left.column + 1);
        expect(left.back).toContain(leftIface);
        expect(right.left).toContain(rightIface);
      }
      for (const d of room.topology.devices) {
        const p = plan.devices.get(d.id);
        if (!p) throw new Error("missing machine");
        const ports = d.interfaces.filter((i) => i.name !== "lo").map((i) => i.name);
        const slots = slotsOf(p);
        // Every port has a slot, and no two share one.
        expect([...slots.keys()].sort()).toEqual([...ports].sort());
        const at = [...slots.values()].map((s) => `${s.wall}${s.at}`);
        expect(new Set(at).size).toBe(at.length);
        if (p.kind === "house") expect(p.mirrored).toBe(p.left.length === 1);
      }
    });
});

// Decision 0120: the floor as it really lies. Each cable is an L from the left room's back-wall door
// (north) to the right room's left-wall door (east); its turn is outside both rooms, and no two rooms overlap.
describe("palace map", () => {
  for (const room of rooms)
    it(`${room.id}: every corridor's L clears both rooms, and rooms don't overlap`, () => {
      const map = palaceMap(room.topology, room.playerDevice);
      const inside = (p: { x: number; z: number }, c: { x: number; z: number }) =>
        Math.abs(p.x - c.x) < 3.99 && Math.abs(p.z - c.z) < 3.99;
      for (const cable of map.cables.values()) {
        const a = map.rooms.get(cable.a)?.centre;
        const b = map.rooms.get(cable.b)?.centre;
        const [pa, turn, pb] = cable.points;
        if (!a || !b || !pa || !turn || !pb) throw new Error("missing");
        expect(pa.z).toBeCloseTo(a.z - 4); // on the left room's back wall
        expect(pb.x).toBeCloseTo(b.x - 4); // on the right room's left wall
        expect(turn.z).toBeLessThan(pa.z); // out to the north…
        expect(turn.x).toBeLessThan(pb.x); // …then east into the right room
        for (const r of map.rooms.values()) expect(inside(turn, r.centre)).toBe(false);
      }
      const all = [...map.rooms.values()];
      for (const [i, r] of all.entries())
        for (const s of all.slice(i + 1))
          expect(Math.abs(r.centre.x - s.centre.x) >= 8 || Math.abs(r.centre.z - s.centre.z) >= 8).toBe(true);
    });
});
