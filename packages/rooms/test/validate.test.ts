/** Room validation (SRS ROOM-03). `pnpm rooms:validate` runs this file. */
import { describe, expect, it } from "vitest";
import { cardIds, loadRoom, play, rooms } from "../src";

describe.each(rooms.map((r) => [r.id, r] as const))("%s", (_id, room) => {
  it("does not start already won (a)", () => {
    const f = play(loadRoom(room, rooms), [], 30_000);
    expect(room.winCondition(f)).toBe(false);
  });

  it("its solution wins within a bounded network time (b)", () => {
    const f = play(loadRoom(room, rooms), room.solution);
    expect(room.winCondition(f)).toBe(true);
  });

  it("the solution passes every health check (restored at the end)", () => {
    const f = play(loadRoom(room, rooms), room.solution);
    for (const h of room.healthChecks) expect(h.check(f), h.id).toBe(true);
  });

  it("every misconception detector fires on its test script, and not on the solution (c)", () => {
    for (const m of room.misconceptions) {
      const tests = room.detectorTests.filter((t) => t.misconception === m.id);
      expect(tests.length, `${m.id} has no test`).toBeGreaterThan(0);
      for (const t of tests) expect(m.detect(play(loadRoom(room, rooms), t.steps)), `${m.id}`).toBe(true);
      expect(m.detect(play(loadRoom(room, rooms), room.solution)), `${m.id} fires on the solution`).toBe(false);
    }
    for (const t of room.detectorTests) expect(room.misconceptions.some((m) => m.id === t.misconception)).toBe(true);
  });

  it("follows the voice rules for missions (d)", () => {
    expect(room.mission.length).toBeLessThanOrEqual(220);
    const sentences = room.mission.split(/(?<=[.!?])\s+/).filter(Boolean);
    expect(sentences.length).toBeLessThanOrEqual(2);
    for (const t of room.debrief.terms) expect(room.mission.toLowerCase()).not.toContain(t.term.toLowerCase());
    expect(room.mission).not.toMatch(/\b(thee|thou|thy|hath|doth)\b/i);
  });

  it("references cards that exist, and has a full room (e, ROOM-05)", () => {
    for (const c of room.cards) expect(cardIds).toContain(c);
    for (const h of room.hints) if (h.codex) expect(cardIds).toContain(h.codex);
    expect(room.hints).toHaveLength(5);
    if (room.kind === "learn" || room.kind === "break") expect(room.misconceptions.length).toBeGreaterThan(0);
    if (room.kind === "prologue") expect(room.misconceptions).toHaveLength(0);
    expect(room.debrief.happened.length).toBeGreaterThan(0);
    expect(room.access[room.playerDevice]).toEqual({ state: "enterable" });
  });
});

it("room ids are unique and rooms are in order", () => {
  expect(new Set(rooms.map((r) => r.id)).size).toBe(rooms.length);
  const order = rooms.map((r) => r.floor * 100 + r.order);
  expect([...order].sort((a, b) => a - b)).toEqual(order);
});

describe("field guide", () => {
  it("topics unlock only in rooms that exist", async () => {
    const { guide } = await import("../src");
    const ids = new Set(rooms.map((r) => r.id));
    for (const t of guide) if (t.from) expect(ids.has(t.from), t.id).toBe(true);
    expect(new Set(guide.map((t) => t.id)).size).toBe(guide.length);
  });

  it("never names an idea before the room that teaches it (P-9)", async () => {
    const { guide } = await import("../src");
    // A term a debrief introduces may only appear in topics that open in or after that room.
    const order = new Map(rooms.map((r, i) => [r.id, i]));
    for (const r of rooms)
      for (const term of r.debrief.terms)
        for (const t of guide) {
          if (!t.body.join(" ").toLowerCase().includes(term.term.toLowerCase())) continue;
          const opens = t.from ? (order.get(t.from) ?? 0) : -1;
          expect(opens, `"${term.term}" in guide topic ${t.id}`).toBeGreaterThanOrEqual(order.get(r.id) ?? 0);
        }
  });
});
