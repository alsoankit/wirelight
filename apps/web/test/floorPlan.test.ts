import { rooms } from "@wirelight/rooms";
import { describe, expect, it } from "vitest";
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
