import { floorTexts, roomTexts } from "@wirelight/content";
import { floorDefs, loadRoom, play, roomById, rooms } from "@wirelight/rooms";
import type { SimEvent } from "@wirelight/sim";
import { describe, expect, it } from "vitest";
import { MEMORY_RULES, matchingRoom, memoriesDue, questionOpen, readEvents, readView } from "../src/play/momentRules";

const room = (id: string) => {
  const r = roomById(id);
  if (!r) throw new Error(id);
  return r;
};

const traceOf = (id: string) => play(room(id), loadRoom(room(id), rooms), room(id).solution).trace;

/** Moments the trace or the interface can give (momentRules.ts), beside each room's detector ids. */
const MOMENTS = new Set(["caught", "caught-announcement", "opened-catch", "broadcast-sent", "sent-frame", "plugged"]);

describe("moments read from the trace", () => {
  it("sees the player call out to everyone (2.3's broadcast)", () => {
    const out = new Set<string>();
    readEvents(traceOf("f2.who-are-you"), "observatory", out);
    expect(out.has("broadcast-sent")).toBe(true);
    expect(out.has("sent-frame")).toBe(true);
  });

  it("tells a caught announcement from a caught letter", () => {
    const trace = traceOf("f2.who-are-you");
    const everyone = trace.find((e) => e.kind === "link.enter" && e.bytes[0] === 0xff);
    const letter = trace.find((e) => e.kind === "link.enter" && e.bytes[0] !== 0xff);
    if (everyone?.kind !== "link.enter" || letter?.kind !== "link.enter") throw new Error("no frames");
    const caught = (frameId: number): SimEvent => ({
      kind: "scanner.catch",
      t: 0,
      n: 1,
      device: "observatory",
      iface: "eth0",
      dir: "in",
      frameId,
      traced: false,
    });
    const a = new Set<string>();
    readEvents([...trace, caught(letter.frameId)], "observatory", a);
    expect(a.has("caught") && !a.has("caught-announcement")).toBe(true);
    const b = new Set<string>();
    readEvents([...trace, caught(everyone.frameId)], "observatory", b);
    expect(b.has("caught-announcement")).toBe(true);
  });

  it("sees the cable plugged back in (1.2) and a keeper taught by hand (3.1)", () => {
    const plug = new Set<string>();
    readEvents(traceOf("f1.loose-cable"), "observatory", plug);
    expect(plug.has("plugged")).toBe(true);
    const hand = new Set<string>();
    readEvents(traceOf("f3.many-doors"), "observatory", hand);
    expect(hand.has("remembered")).toBe(true);
  });
});

describe("moments read from the interface", () => {
  it("knows your own plate, a plate's switch, walking, and time sped up then back", () => {
    const r = room("f1.both-ends");
    const out = new Set<string>();
    const view = { here: "kitchen", speed: 4, voiceGiven: false, detectors: ["replugging"] };
    readView({ ...view, panel: { kind: "plate", device: "observatory", iface: "eth0" } }, r, new Set(), out);
    expect([...out].sort()).toEqual(["own-plate", "replugging", "speed-fast", "switch-seen", "walked"]);
    readView({ ...view, speed: 1, panel: null }, r, out, out);
    expect(out.has("speed-back")).toBe(true);
  });
});

describe("Knight's Memories (0008): every one has a moment to play", () => {
  it("plays each memory by a rule, and each action can be seen done", () => {
    for (const r of rooms)
      for (const m of roomTexts[r.content]?.memories ?? []) {
        expect(MEMORY_RULES[m.id], m.id).toBeDefined();
        if (m.action) expect(MEMORY_RULES[m.id]?.done, m.id).toBeDefined();
      }
  });

  it("plays 1.1's plates on entering, then its doorway once your plate is read", () => {
    const r = room("f1.two-rooms");
    const ctx = (h: string[]) => ({ happened: new Set(h), room: r, elapsedMs: 0, moving: 0 });
    expect(memoriesDue(r, [], ctx([])).map((m) => m.id)).toEqual(["F1-MEM-01"]);
    expect(memoriesDue(r, ["F1-MEM-01"], ctx([])).map((m) => m.id)).toEqual([]);
    expect(memoriesDue(r, ["F1-MEM-01"], ctx(["own-plate"])).map((m) => m.id)).toEqual(["F1-MEM-02"]);
  });

  it("plays 2.2's catching when a message moves, and opening after the first catch", () => {
    const r = room("f2.wrong-name");
    const ctx = (h: string[], moving: number) => ({ happened: new Set(h), room: r, elapsedMs: 0, moving });
    expect(memoriesDue(r, [], ctx([], 0))).toEqual([]);
    expect(memoriesDue(r, [], ctx([], 1)).map((m) => m.id)).toEqual(["F2-MEM-02"]);
    expect(memoriesDue(r, ["F2-MEM-02"], ctx(["caught"], 0)).map((m) => m.id)).toEqual(["F2-MEM-03"]);
  });
});

describe("Guardian questions that open later (CORE-43, CORE-44)", () => {
  it("names only things that can happen: a room's detector, or a moment read from the trace", () => {
    for (const r of rooms)
      for (const g of roomTexts[r.content]?.guardian ?? [])
        if (g.after) {
          const detector = !!roomTexts[r.content]?.detectors[g.after];
          expect(detector || MOMENTS.has(g.after), `${r.id}: ${g.after}`).toBe(true);
        }
  });

  it("opens when it happened, or once the floor is cleared", () => {
    expect(questionOpen(undefined, new Set(), false)).toBe(true);
    expect(questionOpen("own-name", new Set(), false)).toBe(false);
    expect(questionOpen("own-name", new Set(["own-name"]), false)).toBe(true);
    expect(questionOpen("own-name", new Set(), true)).toBe(true);
  });
});

describe("the gentle way back (HELP-12)", () => {
  it("offers the room a fired detector comes from, else the floor's first room", () => {
    const boss1 = room("f1.boss-dark-corridor");
    expect(matchingRoom(boss1, ["replugging"])?.id).toBe("f1.both-ends");
    expect(matchingRoom(boss1, ["replugging", "blaming-kitchen"])?.id).toBe("f1.loose-cable");
    expect(matchingRoom(boss1, [])?.id).toBe("f1.two-rooms");
    expect(matchingRoom(room("f2.boss-silent-line"), ["card-to-self"])?.id).toBe("f2.wrong-name");
  });

  it("finds an earlier room for every boss", () => {
    for (const f of floorDefs) {
      const target = matchingRoom(room(f.boss), []);
      expect(target?.floor, f.boss).toBe(f.floor);
      expect(target?.id, f.boss).not.toBe(f.boss);
    }
  });
});

describe("journal pages (CORE-45): where each lies", () => {
  it("can be reached in every journal room (the registry's room is open in 7.2)", () => {
    for (const f of floorDefs) {
      const where = floorTexts[f.floor]?.journal.where ?? "";
      if (/registry's room/.test(where)) expect(room(f.journalRoom).access.registry?.state).toBe("enterable");
    }
  });
});
