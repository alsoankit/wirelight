/**
 * The room format's rules across rooms and floors (tech/room-format.md ROOM-01..09): solutions and
 * alternatives, terms in order, controls before and after the gift of the voice, pacing, floors.
 */
import { cards, commandMemories, floorTexts, roomTexts, shellContent, terms } from "@wirelight/content";
import { describe, expect, it } from "vitest";
import {
  type CommandStep,
  type Controls,
  floorDefs,
  loadRoom,
  play,
  type RoomDef,
  rooms,
  type SolutionStep,
} from "../src";

/** Every string value in a room's text (what the player can read), not its keys. */
function strings(v: unknown): string[] {
  if (typeof v === "string") return [v];
  if (Array.isArray(v)) return v.flatMap(strings);
  if (v && typeof v === "object") return Object.values(v).flatMap(strings);
  return [];
}

const place = (r: RoomDef) => r.floor * 100 + r.order;
const text = (r: RoomDef) => {
  const t = roomTexts[r.content];
  if (!t) throw new Error(`${r.id}: no text`);
  return t;
};
/** The first room where the console can be typed in: the gift of the voice (0032). */
const giftRoom = rooms.find((r) => r.controls.console === "typing");
const beforeGift = (r: RoomDef) => !giftRoom || place(r) < place(giftRoom);

/** The control a click runs through (0040), or null for a click with nothing to click. */
function controlFor(r: RoomDef, s: CommandStep): "works" | "broken" | null {
  const c: Controls = r.controls;
  if (c.sendButton && c.sendButton.line === s.line && c.sendButton.device === s.device) return "works";
  if (/^ip link show \S+$/.test(s.line)) return "works"; // reading a plate
  const sw = s.line.match(/^ip link set (\S+) (up|down)$/);
  if (sw) return c.plateSwitches?.[`${s.device}:${sw[1]}`] ?? null;
  const end = s.line.match(/^lab cable (?:plug|unplug) (\S+)$/);
  if (end) return c.cableEnds?.[`${s.device}:${end[1]}`] ?? null;
  if (/^lab send-frame\b/.test(s.line)) return s.device === "observatory" ? (c.workbench ?? null) : null;
  if (/^lab card\b/.test(s.line)) return c.card ?? null;
  if (/^bridge fdb( show)?$/.test(s.line)) return c.macBoards?.[s.device] ?? null;
  if (/^ip neigh( show)?$/.test(s.line)) return c.ledgers?.[s.device] ?? null;
  const slot = s.line.match(/^ip addr (?:add|del) \S+ dev (\S+)$/);
  if (slot) return c.addressSlots?.[`${s.device}:${slot[1]}`] ?? null;
  if (/^ip route (?:add|del|replace) /.test(s.line)) return c.routingBoards?.[s.device] ?? null;
  if (/^lab keeper /.test(s.line)) return c.desk === s.device ? "works" : null;
  if (/^tcpdump -n -i \S+$/.test(s.line)) return c.scanner?.capture ? "works" : null;
  if (/^lab scanner (?:catch|open|list)\b/.test(s.line)) return c.scanner?.catch ? "works" : null;
  if (/^lab scanner (?:trace|compare)\b/.test(s.line)) return c.scanner?.trace ? "works" : null;
  return null;
}

/** Every worn-out-able control a room has, as "kind:key" → state (for ROOM-06's seen-working rule). */
function controlStates(c: Controls): [string, "works" | "broken"][] {
  const maps: [string, Record<string, "works" | "broken"> | undefined][] = [
    ["switch", c.plateSwitches],
    ["cable", c.cableEnds],
    ["board", c.macBoards],
    ["ledger", c.ledgers],
    ["slot", c.addressSlots],
    ["routing", c.routingBoards],
  ];
  const out: [string, "works" | "broken"][] = maps.flatMap(([kind, m]) =>
    Object.values(m ?? {}).map((v) => [kind, v] as [string, "works" | "broken"]),
  );
  if (c.workbench) out.push(["workbench", c.workbench]);
  if (c.card) out.push(["card", c.card]);
  return out;
}

/** Every player action a room scripts: its solution, alternatives and detector tests. */
const scripts = (r: RoomDef): SolutionStep[][] => [
  r.solution,
  ...(r.altSolutions ?? []),
  ...r.detectorTests.map((t) => t.steps),
];

describe.each(rooms.map((r) => [r.id, r] as const))("%s", (_id, room) => {
  it("ROOM-01: every alternative solution wins too, and each solution step succeeds", () => {
    for (const alt of room.altSolutions ?? [])
      expect(room.winCondition(play(room, loadRoom(room, rooms), alt))).toBe(true);
    const f = play(room, loadRoom(room, rooms), room.solution);
    const failed = f.trace.filter(
      (e) => e.kind === "cmd.exec" && e.source !== "keeper" && e.exitCode !== 0 && e.exitCode !== null,
    );
    expect(failed.map((e) => (e.kind === "cmd.exec" ? e.line : ""))).toEqual([]);
  });

  it("ROOM-02: every health check fails at the start", () => {
    const f = play(room, loadRoom(room, rooms), [], 30_000);
    for (const h of room.healthChecks) expect(h.check(f), h.id).toBe(false);
  });

  it("ROOM-03: no detector fires on an alternative solution", () => {
    for (const alt of room.altSolutions ?? []) {
      const f = play(room, loadRoom(room, rooms), alt);
      for (const m of room.misconceptions) expect(m.detect(f), m.id).toBe(false);
    }
  });

  it("ROOM-04: the third hint links to the Codex, and voice line ids are well formed", () => {
    const t = text(room);
    expect(t.hints[2]?.codex, "hint 3").toBeTruthy();
    for (const v of [...(t.voice ?? []), ...(t.memories ?? [])]) expect(v.id).toMatch(/^(P|F\d+|CMD)-[A-Z]+(-\d+)?$/);
    if (t.building) expect(t.building.id).toMatch(/^(P|F\d+)-BLD-\d+$/);
  });

  it("ROOM-04/0015: its debrief teaches exactly the terms the room says it teaches", () => {
    expect(
      text(room)
        .debrief.terms.map((x) => x.id)
        .sort(),
    ).toEqual([...room.teaches].sort());
  });

  it("ROOM-06: every click runs through a working control; typing only once the console is there", () => {
    for (const steps of scripts(room))
      for (const s of steps) {
        if ("touch" in s) {
          // Touching a worn-out control: it must be one, on this machine.
          const [kind, iface] = s.touch.split(":");
          expect(kind).toBe("switch");
          expect(room.controls.plateSwitches?.[`${s.device}:${iface}`], s.touch).toBe("broken");
          continue;
        }
        if ((s.source ?? "typed") === "typed") expect(room.controls.console, s.line).toBe("typing");
        else expect(controlFor(room, s), `${s.device}: ${s.line}`).toBe("works");
      }
  });

  it("ROOM-06: nothing is broken before the gift of the voice, and no console", () => {
    if (!beforeGift(room)) return;
    expect(room.controls.console).toBe("hidden");
    const all = [
      ...Object.values(room.controls.plateSwitches ?? {}),
      ...Object.values(room.controls.cableEnds ?? {}),
      room.controls.workbench,
      room.controls.card,
    ];
    expect(all).not.toContain("broken");
  });

  it("ROOM-06: a worn-out control was seen working in an earlier room", () => {
    const earlier = rooms.filter((r) => place(r) < place(room));
    for (const [kind, state] of controlStates(room.controls)) {
      if (state !== "broken") continue;
      const seen = earlier.some((r) => controlStates(r.controls).some(([k, v]) => k === kind && v === "works"));
      expect(seen, `a broken ${kind} before one was seen working`).toBe(true);
    }
  });

  it("ROOM-07: at most two new terms, at most one command memory; bosses teach none", () => {
    expect(room.teaches.length).toBeLessThanOrEqual(2);
    if (room.kind === "boss") expect(room.teaches).toEqual([]);
    if (room.commandMemory) {
      const m = commandMemories[room.commandMemory];
      expect(m, room.commandMemory).toBeDefined();
      expect(m?.room).toBe(room.id);
    }
  });

  it("ROOM-09: has a key", () => {
    expect(room.key.word).toMatch(/^[a-z]+-[a-z]+$/);
  });

  it("0009: its path tag fits its kind", () => {
    if (room.kind === "boss") expect(room.pathTag).toBe("boss");
    if (room.kind === "prologue") expect(room.pathTag).toBe("all");
    if (room.pathTag === "boss") expect(room.kind).toBe("boss");
  });
});

describe("across rooms", () => {
  it("ROOM-05: no room uses a term before a room teaches it, and no term is taught twice", () => {
    // A room a path skips still teaches its terms (0009), so room order is what matters on every path.
    const taught = new Map<string, string>();
    for (const r of rooms) {
      for (const u of r.uses) expect(taught.has(u), `${r.id} uses "${u}" before it's taught`).toBe(true);
      for (const t of r.teaches) {
        expect(taught.has(t), `"${t}" taught again in ${r.id}`).toBe(false);
        taught.set(t, r.id);
      }
    }
    for (const id of taught.keys()) expect(terms[id], id).toBeDefined();
  });

  it("ROOM-05: a debrief's new word appears in no earlier room's text", () => {
    // Whole words only (and their plurals), in what the player reads: not ids, not inside other words
    // ("ping" in "stopping"). A term written "TTL (time to live)" is looked for as "TTL".
    const said = (r: RoomDef) => strings(text(r)).join("\n");
    const failures: string[] = [];
    for (const [i, r] of rooms.entries())
      for (const t of r.teaches) {
        const word = (terms[t]?.term ?? t).split(" (")[0] ?? t;
        const re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}(s|es)?\\b`, "i");
        for (const before of rooms.slice(0, i)) if (re.test(said(before))) failures.push(`${before.id} says "${word}"`);
      }
    expect(failures).toEqual([]);
  });

  it("each card opens in exactly one room, and every room's cards exist", () => {
    const seen = new Map<string, string>();
    for (const r of rooms)
      for (const c of r.cards) {
        expect(cards[c], c).toBeDefined();
        expect(seen.get(c), `card ${c} opens twice`).toBeUndefined();
        seen.set(c, r.id);
      }
  });

  it("ROOM-09: no two rooms share a key", () => {
    const seen = new Map<string, string>();
    const clashes: string[] = [];
    for (const r of rooms) {
      const other = seen.get(r.key.word);
      if (other) clashes.push(`${r.id} and ${other} both have "${r.key.word}"`);
      seen.set(r.key.word, r.id);
    }
    expect(clashes).toEqual([]);
  });

  it("detector tests name distinct misconceptions in each room", () => {
    for (const r of rooms) {
      const ids = r.detectorTests.map((t) => t.misconception);
      expect(ids.length, `${r.id}: ${ids.join(", ")}`).toBe(new Set(ids).size);
    }
  });

  it("a command memory's flags are all on its tool's man page", () => {
    const missing: string[] = [];
    for (const m of Object.values(commandMemories)) {
      const tool = m.command.split(" ")[0] ?? "";
      const page = shellContent.man(tool)?.join("\n");
      if (!page) continue;
      const lines = [...m.anatomy.map((a) => a.word), ...m.forms.map((f) => f.line)];
      for (const flag of new Set(lines.join(" ").match(/(?<=^|\s)-[a-z]\b/g) ?? []))
        if (!new RegExp(`(^|\\s)${flag}\\b`, "m").test(page)) missing.push(`${m.id}: ${flag} not in man ${tool}`);
    }
    expect(missing).toEqual([]);
  });

  it("each of ip's usage texts ends with a plain word pointing to man ip", () => {
    // The last lines of `ip help`, `ip link help` / `ip addr help`, `ip neigh help`, `ip route help`.
    const lasts = [
      "                    -c[olor]}",
      "          xfrm | virt_wifi }",
      "           permanent | probe | reachable | stale }",
      "ROUTE_GET_FLAG := [ connected | fibmatch | notify ]",
    ];
    for (const line of lasts) expect(shellContent.subtitle(line), line).toMatch(/man ip$/);
    expect(shellContent.man("ip")).toBeDefined();
  });

  it("voice line ids are unique", () => {
    const ids = rooms.flatMap((r) => {
      const t = text(r);
      return [...(t.voice ?? []), ...(t.memories ?? []), ...(t.building ? [t.building] : [])].map((v) => v.id);
    });
    expect(ids.length).toBe(new Set(ids).size);
  });

  it("0032: the console arrives with a command memory, in the room of the gift", () => {
    expect(giftRoom?.commandMemory).toBe("CMD-01");
  });

  it("0037: every non-boss room of Regions 1–2 has a building memory", () => {
    for (const r of rooms)
      if (r.region <= 2 && (r.kind === "learn" || r.kind === "break" || r.kind === "prologue"))
        expect(text(r).building, r.id).toBeDefined();
  });
});

describe.each(floorDefs.map((f) => [f.floor, f] as const))("floor %i", (_n, floor) => {
  // A secret room sits on its floor but isn't one of the floor's rooms (it's found after the boss).
  const mine = rooms.filter((r) => r.floor === floor.floor && r.kind !== "secret");

  it("ROOM-09: lists its rooms in order, ending with its boss", () => {
    expect(floor.rooms).toEqual(mine.map((r) => r.id));
    expect(floor.rooms.at(-1)).toBe(floor.boss);
    expect(mine.at(-1)?.kind).toBe("boss");
    expect(mine.filter((r) => r.kind === "boss")).toHaveLength(1);
  });

  it("ROOM-09: has a floor memory and a journal page, hidden in one of its rooms", () => {
    const t = floorTexts[floor.floor];
    expect(t, `floor ${floor.floor} text`).toBeDefined();
    expect(t?.memory.length).toBeGreaterThanOrEqual(3);
    expect(t?.journal.text.length).toBeGreaterThan(0);
    expect(floor.rooms).toContain(floor.journalRoom);
  });

  it("ROOM-09: every room is in the same region", () => {
    for (const r of mine) expect(r.region).toBe(floor.region);
  });
});

it("ROOM-09: every secret room belongs to a floor of its region, which names it", () => {
  for (const r of rooms.filter((x) => x.kind === "secret")) {
    const floor = floorDefs.find((f) => f.floor === r.floor);
    expect(floor?.secret, r.id).toBe(r.id);
    expect(floor?.region).toBe(r.region);
  }
});

it("ROOM-09: every region has one secret room (0065)", () => {
  const regions = [...new Set(rooms.filter((r) => r.kind !== "prologue").map((r) => r.region))];
  for (const region of regions)
    expect(
      rooms.filter((r) => r.region === region && r.kind === "secret").map((r) => r.id),
      `region ${region}`,
    ).toHaveLength(1);
});
// ROOM-08 runs in the difftest (pnpm difftest), not here: it needs Linux namespaces.
