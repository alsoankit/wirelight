/** Room validation (tech/room-format.md). `pnpm rooms:validate` runs this file. */
import { cardIds, guide, placeholders, type RoomText, roomTexts } from "@wirelight/content";
import { describe, expect, it } from "vitest";
import { loadRoom, play, type RoomDef, rooms } from "../src";

function textOf(room: RoomDef): RoomText {
  const text = roomTexts[room.content];
  if (!text) throw new Error(`${room.id}: no text "${room.content}" in packages/content`);
  return text;
}

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
    const { mission, debrief } = textOf(room);
    expect(mission.length).toBeLessThanOrEqual(220);
    const sentences = mission.split(/(?<=[.!?])\s+/).filter(Boolean);
    expect(sentences.length).toBeLessThanOrEqual(2);
    for (const t of debrief.terms) expect(mission.toLowerCase()).not.toContain(t.term.toLowerCase());
    expect(mission).not.toMatch(/\b(thee|thou|thy|hath|doth)\b/i);
  });

  it("references cards that exist, and has a full room (e, ROOM-05)", () => {
    const text = textOf(room);
    for (const c of room.cards) expect(cardIds).toContain(c);
    for (const h of text.hints) if (h.codex) expect(cardIds).toContain(h.codex);
    expect(text.hints).toHaveLength(5);
    if (room.kind === "learn" || room.kind === "break") expect(room.misconceptions.length).toBeGreaterThan(0);
    if (room.kind === "prologue") expect(room.misconceptions).toHaveLength(0);
    expect(text.debrief.happened.length).toBeGreaterThan(0);
    expect(room.access[room.playerDevice]).toEqual({ state: "enterable" });
  });

  it("has all its text, and no more (ROOM-04)", () => {
    const text = textOf(room);
    expect(text.title.length).toBeGreaterThan(0);
    // Every detector has its note and "What you tried" line, and the text has none for detectors the room lacks.
    expect(Object.keys(text.detectors).sort()).toEqual(room.misconceptions.map((m) => m.id).sort());
    for (const d of Object.values(text.detectors)) {
      expect(d.note.length).toBeGreaterThan(0);
      expect(d.tried.length).toBeGreaterThan(0);
    }
    // Every placeholder has a value from the room.
    for (const name of placeholders(text)) expect(room.vars ?? {}, `{${name}}`).toHaveProperty(name);
    // A machine the player can't enter says why.
    for (const [device, access] of Object.entries(room.access))
      if (access.state !== "enterable") expect(text.access?.[device], device).toBeTruthy();
  });
});

it("every room's text belongs to a room", () => {
  expect(Object.keys(roomTexts).sort()).toEqual(rooms.map((r) => r.content).sort());
});

it("room ids are unique and rooms are in order", () => {
  expect(new Set(rooms.map((r) => r.id)).size).toBe(rooms.length);
  const order = rooms.map((r) => r.floor * 100 + r.order);
  expect([...order].sort((a, b) => a - b)).toEqual(order);
});

describe("field guide", () => {
  it("topics unlock only in rooms that exist", () => {
    const ids = new Set(rooms.map((r) => r.id));
    for (const t of guide) if (t.from) expect(ids.has(t.from), t.id).toBe(true);
    expect(new Set(guide.map((t) => t.id)).size).toBe(guide.length);
  });

  it("never names an idea before the room that teaches it (P-9)", () => {
    // A term a debrief introduces may only appear in topics that open in or after that room.
    const order = new Map(rooms.map((r, i) => [r.id, i]));
    for (const r of rooms)
      for (const term of textOf(r).debrief.terms)
        for (const t of guide) {
          if (!t.body.join(" ").toLowerCase().includes(term.term.toLowerCase())) continue;
          const opens = t.from ? (order.get(t.from) ?? 0) : -1;
          expect(opens, `"${term.term}" in guide topic ${t.id}`).toBeGreaterThanOrEqual(order.get(r.id) ?? 0);
        }
  });
});
