import type { Topology } from "@wirelight/sim";
import { describe, expect, it } from "vitest";
import { doorSides, slotsFor } from "../src/world/room/doorSides";
import type { DoorSlot } from "../src/world/room/layout";

const dev = (id: string, ifaces: string[]) => ({ id, interfaces: ifaces.map((name) => ({ name })) });
const link = (a: string, ai: string, b: string, bi: string) => ({
  id: `${a}-${b}`,
  a: { device: a, iface: ai },
  b: { device: b, iface: bi },
});

// observatory — hall — {kitchen, library}; kitchen — library too (a branch beside).
const t = {
  devices: [
    dev("observatory", ["eth0"]),
    dev("hall", ["eth0", "eth1", "eth2"]),
    dev("kitchen", ["eth0", "eth1"]),
    dev("library", ["eth0", "eth1"]),
  ],
  links: [
    link("observatory", "eth0", "hall", "eth0"),
    link("hall", "eth1", "kitchen", "eth0"),
    link("hall", "eth2", "library", "eth0"),
    link("kitchen", "eth1", "library", "eth1"),
  ],
} as unknown as Topology;

describe("doorSides", () => {
  it("puts further machines on the back wall, the way back on the near edge, neighbours on the left", () => {
    expect([...doorSides(t, "observatory", "observatory")]).toEqual([["eth0", "back"]]);
    expect(Object.fromEntries(doorSides(t, "observatory", "hall"))).toEqual({
      eth0: "front",
      eth1: "back",
      eth2: "back",
    });
    expect(Object.fromEntries(doorSides(t, "observatory", "kitchen"))).toEqual({ eth0: "front", eth1: "left" });
  });
  it("makes a corridor's two ends face each other", () => {
    const opposite = { back: "front", front: "back", left: "left" } as const;
    for (const l of t.links) {
      const a = doorSides(t, "observatory", l.a.device).get(l.a.iface);
      const b = doorSides(t, "observatory", l.b.device).get(l.b.iface);
      expect(b).toBe(a && opposite[a]);
    }
  });
});

describe("slotsFor", () => {
  const slots: DoorSlot[] = [
    { wall: "back", at: 0 },
    { wall: "left", at: 2 },
  ];
  it("gives each door a slot on its side, and the rest whatever is free, in door order", () => {
    const sides = new Map([
      ["eth0", "front" as const],
      ["eth1", "back" as const],
    ]);
    const { placed, rest } = slotsFor(["eth0", "eth1"], sides, slots);
    expect(placed).toEqual([
      { wall: "left", at: 2 },
      { wall: "back", at: 0 },
    ]);
    expect(rest).toEqual([]);
  });
});
