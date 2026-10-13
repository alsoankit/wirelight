import { loadRoom, play, roomById, rooms } from "@wirelight/rooms";
import { describe, expect, it } from "vitest";
import { journey, winningFrame } from "../src/engine/journey";

const run = (id: string) => {
  const room = roomById(id);
  if (!room) throw new Error(id);
  return play(room, loadRoom(room, rooms), room.solution).trace;
};

describe("a message's journey (CORE-23)", () => {
  it("follows the winning answer back through the switch, hop by hop", () => {
    const trace = run("f3.keepers-memory");
    const won = winningFrame(trace, "observatory");
    expect(won).not.toBeNull();
    const hops = journey(trace, won as number);
    // gate → hall → observatory: two cables, and the hall's keeper decided on the way.
    expect(hops.map((h) => `${h.from}>${h.to}`)).toEqual(["gate>hall", "hall>observatory"]);
    expect(hops[0]?.decision?.decision).toBe("forward");
  });

  it("crosses streets through a router, its decision on each hop", () => {
    const trace = run("f8.across-the-street");
    const hops = journey(trace, winningFrame(trace, "observatory") as number);
    expect(hops.length).toBeGreaterThanOrEqual(4);
    expect(hops.some((h) => h.decision?.layer === "l3" && h.decision.decision === "forward")).toBe(true);
  });
});
