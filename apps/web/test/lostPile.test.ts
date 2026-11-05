import { describe, expect, it } from "vitest";
import { addToPile, type Scrap } from "../src/world/room/lostPile";

const DOOR = "hall:eth1";
const MAX = 10;
const STAY = 30_000;
/** `n` messages lost at the door, one every 300 ms (4.1 at 16×: about 30 in the store's 10 s). */
const lost = (n: number, from = 0) =>
  Array.from({ length: n }, (_, i) => ({ door: DOOR, at: (from + i) * 300, frameId: 100 + from + i }));

describe("the scraps where messages died at a door (CORE-17)", () => {
  it("takes the door's new marks, the latest ten of them", () => {
    const marks = [...lost(30), { door: "kitchen:eth0", at: 0, frameId: 7 }];
    const next = addToPile([], new Set(), marks, DOOR, 9_000, MAX, STAY);
    expect(next?.pile.map((s) => s.frameId)).toEqual(
      lost(30)
        .slice(-10)
        .map((m) => m.frameId),
    );
  });

  it("takes nothing again when the store's list is new but its marks aren't (no swap between two sets)", () => {
    const first = addToPile([], new Set(), lost(30), DOOR, 9_000, MAX, STAY);
    if (!first) throw new Error("the first marks were not taken");
    // The store makes a new list on every tick: the same 30 marks, in a new array.
    expect(addToPile(first.pile, first.taken, [...lost(30)], DOOR, 9_100, MAX, STAY)).toBeNull();
  });

  it("adds a new mark on top, and the oldest scrap leaves", () => {
    const first = addToPile([], new Set(), lost(30), DOOR, 9_000, MAX, STAY);
    if (!first) throw new Error("the first marks were not taken");
    const next = addToPile(first.pile, first.taken, lost(31), DOOR, 9_300, MAX, STAY);
    const pile = next?.pile ?? ([] as Scrap[]);
    expect(pile).toHaveLength(10);
    expect(pile.at(-1)?.frameId).toBe(130);
    expect(pile[0]?.frameId).toBe(121);
  });

  it("forgets what the store has forgotten, and doesn't take it back", () => {
    const first = addToPile([], new Set(), lost(30), DOOR, 9_000, MAX, STAY);
    if (!first) throw new Error("the first marks were not taken");
    const later = lost(30).slice(20);
    const next = addToPile(first.pile, first.taken, [...later, ...lost(1, 30)], DOOR, 10_000, MAX, STAY);
    expect(next?.taken.size).toBe(11);
    expect(next && addToPile(next.pile, next.taken, [...later, ...lost(1, 30)], DOOR, 10_100, MAX, STAY)).toBeNull();
  });
});
