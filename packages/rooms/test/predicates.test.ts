import { describe, expect, it } from "vitest";
import { corridorState, facts, LIT_FOR_MS, loadRoom, play, roomById, rooms } from "../src";

const room = roomById("f2.first-light");
if (!room) throw new Error("missing room");

describe("corridor state (FR-COR-02)", () => {
  it("starts dark", () => {
    const b = loadRoom(room, rooms);
    expect(corridorState(facts(b.trace(), b.state()), "wire", b.now())).toBe("dark");
  });

  it("one-way traffic doesn't light it", () => {
    const b = loadRoom(room, rooms);
    const f = play(room, b, [{ device: "observatory", line: "lab send-frame --to 02:00:00:00:00:99" }]);
    expect(corridorState(f, "wire", b.now())).toBe("dark");
  });

  it("a message and its answer light it, and it fades after two quiet minutes", () => {
    const b = loadRoom(room, rooms);
    const f = play(room, b, room.solution);
    expect(corridorState(f, "wire", b.now())).toBe("lit");
    b.advance(b.now() + LIT_FOR_MS + 1);
    expect(corridorState(facts(b.trace(), b.state()), "wire", b.now())).toBe("dark");
  });

  it("a door switched off breaks it", () => {
    const b = loadRoom(room, rooms);
    b.world.setAdmin("lantern", "eth0", false);
    expect(corridorState(facts(b.trace(), b.state()), "wire", b.now())).toBe("broken");
  });

  it("reset forgets what happened before", () => {
    const b = loadRoom(room, rooms);
    play(room, b, room.solution);
    b.reset();
    const f = facts(b.trace(), b.state());
    expect(room.winCondition(f)).toBe(false);
    expect(corridorState(f, "wire", b.now())).toBe("dark");
  });
});

describe("the exchange tracker", () => {
  it("agrees with lastExchange on every cable, fed a little at a time", async () => {
    const { ExchangeTracker, lastExchange, roomById: byId } = await import("../src");
    for (const id of ["f2.who-are-you", "f3.keepers-memory", "f8.across-the-street"]) {
      const r = byId(id);
      if (!r) throw new Error(id);
      const f = play(r, loadRoom(r, rooms), r.solution);
      const t = new ExchangeTracker();
      for (let i = 0; i < f.trace.length; i += 37) t.feed(f.trace.slice(i, i + 37));
      for (const l of r.topology.links) expect(t.last(l.id), `${id} ${l.id}`).toBe(lastExchange(f.trace, l.id));
    }
  });
});
