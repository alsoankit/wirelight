import { describe, expect, it } from "vitest";
import { corridorState, facts, LIT_FOR_MS, loadRoom, play, roomById, rooms } from "../src";

const room = roomById("f0.r1-first-light");
if (!room) throw new Error("missing room");

describe("corridor state (FR-COR-02)", () => {
  it("starts dark", () => {
    const b = loadRoom(room, rooms);
    expect(corridorState(facts(b.trace(), b.state()), "wire", b.now())).toBe("dark");
  });

  it("one-way traffic doesn't light it", () => {
    const b = loadRoom(room, rooms);
    const f = play(b, [{ device: "observatory", line: "lab send-frame --to 02:00:00:00:00:99" }]);
    expect(corridorState(f, "wire", b.now())).toBe("dark");
  });

  it("a message and its answer light it, and it fades after two quiet minutes", () => {
    const b = loadRoom(room, rooms);
    const f = play(b, room.solution);
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
    play(b, room.solution);
    b.reset();
    const f = facts(b.trace(), b.state());
    expect(room.winCondition(f)).toBe(false);
    expect(corridorState(f, "wire", b.now())).toBe("dark");
  });
});
