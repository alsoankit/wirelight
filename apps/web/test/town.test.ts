import { loadRoom, play, roomById, rooms } from "@wirelight/rooms";
import { describe, expect, it } from "vitest";
import { secretHere, secretInCorridor } from "../src/world/room/secretPlaces";
import { answered, census, houseNumber, register, squareStreet, streetOf, streetStart } from "../src/world/town/street";

// The Lantern Town's readable things come from the room (decision 0072), never hard-coded.
const room = (id: string) => {
  const r = roomById(id);
  if (!r) throw new Error(id);
  return r;
};

describe("the town square's readable things", () => {
  it("the register lists each house at its own address, not the player's house", () => {
    const rows = register(room("f5.where-not-who"));
    expect(rows.map((h) => [h.id, h.address])).toEqual([
      ["kitchen", "10.0.1.7"],
      ["library", "10.0.1.12"],
      ["forge", "10.0.1.10"],
    ]);
  });

  it("keeps a house's own address while it uses another (7.B: chapel .18, cellar .14)", () => {
    const r = room("f7.boss-census");
    const byId = Object.fromEntries(register(r).map((h) => [h.id, h.address]));
    expect(byId.chapel).toBe("10.0.1.18");
    expect(byId.cellar).toBe("10.0.1.14");
    expect(byId.registry).toBe("10.0.1.2");
    expect(
      census(r)
        .map((h) => h.id)
        .sort(),
    ).toEqual(["cellar", "chapel", "forge", "kitchen", "library"]);
  });

  it("the street sign reads the square's street, even when the player's house is on another", () => {
    expect(squareStreet(room("f7.same-street"))).toBe("10.0.1.0/24");
    expect(squareStreet(room("f7.secret-binary"))).toBe("10.0.1.0/24");
    expect(streetOf("10.0.1.200", 25)).toBe("10.0.1.128/25");
    expect(streetStart("10.0.1.0/24")).toBe("10.0.1.");
    expect(houseNumber(room("f7.boss-census"), "kitchen")).toBe("7");
  });
});

describe("the census board", () => {
  it("lights every house once the census is won, and none before", () => {
    const r = room("f7.boss-census");
    const houses = census(r);
    const macs = new Set(r.topology.devices.find((d) => d.id === "observatory")?.interfaces.map((i) => i.mac));
    const start = play(r, loadRoom(r, rooms), []).trace;
    expect(answered(start, "observatory", macs, houses).size).toBe(0);
    const end = play(r, loadRoom(r, rooms), r.solution).trace;
    expect([...answered(end, "observatory", macs, houses)].sort()).toEqual(houses.map((h) => h.id).sort());
  });
});

describe("secret doors (0072)", () => {
  it("show only once the floor's boss is cleared, in the named place", () => {
    const census = room("f7.boss-census");
    expect(secretHere(census, "square", {}, false)).toBeUndefined();
    expect(secretHere(census, "square", {}, true)).toBe("f7.secret-binary");
    expect(secretHere(census, "observatory", {}, true)).toBeUndefined();
    const cleared = { "f2.boss-silent-line": {} };
    // 2.2's door is in its corridor's wall (floor-2.md, 0081), not its Observatory.
    expect(secretHere(room("f2.wrong-name"), "observatory", cleared, false)).toBeUndefined();
    expect(secretInCorridor(room("f2.wrong-name"), cleared, false)).toBe("f2.secret-48-bits");
    expect(secretInCorridor(room("f2.wrong-name"), {}, false)).toBeUndefined();
    expect(secretInCorridor(room("f2.who-are-you"), cleared, false)).toBeUndefined();
    expect(secretHere(room("f2.boss-silent-line"), "observatory", {}, true)).toBe("f2.secret-48-bits");
    expect(secretHere(room("f4.boss-storm"), "hall-b", {}, true)).toBe("f4.secret-peacekeeper");
    expect(secretHere(room("f9.boss-crossing"), "spire", {}, true)).toBe("f9.secret-home-router");
  });
});
