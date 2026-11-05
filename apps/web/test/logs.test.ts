import type { SimEvent } from "@wirelight/sim";
import { describe, expect, it, vi } from "vitest";
import {
  enqueue,
  entryId,
  entryOf,
  type LogsDeps,
  MAX_COMMANDS,
  MAX_LINE,
  MAX_QUEUE,
  OPEN_KEY,
  payloadOf,
  playLogs,
  QUEUE_KEY,
} from "../src/account/logs";
import type { Consent, Device, Entry, SendResult } from "../src/account/types";
import { emptyLog, type RoomVisit, readEvents, readMistakes, startVisit } from "../src/dev/playtest";

// The visits come from the playtest log's own recorder; its stores start the engine worker, so they stay out.
vi.mock("../src/engine/store", () => ({ useSession: {} }));
vi.mock("../src/progress/progress", () => ({ useProgress: {} }));

const device: Device = { tier: "medium", auto: true, frameMs: 16.7 };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

// Each visit starts ten minutes after the last, so every visit has its own start (and so its own id).
let clock = 0;
const at = (s: number) => new Date(Date.UTC(2026, 10, 5, 10, 0, s));

type Run = { line: string; source?: "typed" | "click"; exitCode?: number };

/** A visit to `roomId` as the recorder keeps it: these lines run (typed, unless said), then a minute in the room. */
function visit(roomId: string, lines: (string | Run)[] = ["ip link"]): RoomVisit {
  const start = clock;
  clock += 600;
  const v = startVisit(emptyLog(at(start)), roomId, at(start));
  const events = lines.map((l, i) => {
    const { line, source = "typed", exitCode = 0 } = typeof l === "string" ? { line: l } : l;
    return { kind: "cmd.exec", t: i, device: "pc1", execId: i + 1, line, source, exitCode };
  }) as unknown as SimEvent[];
  readEvents(v, events, new Map(), at(start + 60));
  return v;
}

/** A Map standing in for localStorage. */
function fakeStorage() {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      items.set(key, value);
    },
    removeItem: (key: string) => {
      items.delete(key);
    },
  };
}

/** Storage that refuses everything (private mode, blocked site data). */
const blocked = {
  getItem(): string | null {
    throw new Error("storage blocked");
  },
  setItem(): void {
    throw new Error("storage blocked");
  },
  removeItem(): void {
    throw new Error("storage blocked");
  },
};

type Timer = { run: () => void; ms: number; cancelled: boolean };

/**
 * A page with the play logs wired to fakes: who is signed in, the network, the timers and the server.
 * The server answers each send with the next of `results` ("throw" rejects), then "sent".
 */
function page(opts: { consent?: Consent; storage?: LogsDeps["storage"] } = {}) {
  const w = {
    consent: opts.consent ?? ({ userId: "u1", on: true } as Consent),
    online: true,
    results: [] as (SendResult | "throw")[],
    /** Every send waits for this before the server answers. */
    hold: Promise.resolve(),
    sent: [] as Entry[],
    timers: [] as Timer[],
    waiting: [] as number[],
  };
  const logs = playLogs({
    consent: () => w.consent,
    send: async (entry) => {
      w.sent.push(entry);
      await w.hold;
      const result = w.results.shift() ?? "sent";
      if (result === "throw") throw new Error("network down");
      return result;
    },
    storage: opts.storage === undefined ? fakeStorage() : opts.storage,
    online: () => w.online,
    later: (run, ms) => {
      const timer = { run, ms, cancelled: false };
      w.timers.push(timer);
      return () => {
        timer.cancelled = true;
      };
    },
    onQueue: (waiting) => {
      w.waiting.push(waiting);
    },
  });
  return { w, logs };
}

/** Lets every pending promise run. */
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("play logs", () => {
  it.each([
    ["while the switch is off", { userId: "u1", on: false }],
    ["while signed out, even with the switch left on", { userId: null, on: true }],
  ] as [string, Consent][])("sends and keeps nothing %s", async (_, consent) => {
    // Records left by an earlier page (when the switch was on) are forgotten, not sent.
    const storage = fakeStorage();
    const old = entryOf(visit("0.1"), "u1", device);
    storage.setItem(QUEUE_KEY, JSON.stringify([old]));
    storage.setItem(OPEN_KEY, JSON.stringify(entryOf(visit("0.2"), "u1", device)));

    const { w, logs } = page({ consent, storage });
    logs.start();
    logs.ended(visit("1.1"), device);
    logs.keep(visit("1.2"), device);
    await logs.flush();
    const next = page({ consent, storage });
    next.logs.start();
    await next.logs.flush();

    expect([...w.sent, ...next.w.sent]).toEqual([]);
    expect(logs.queued()).toEqual([]);
    expect(storage.items.size).toBe(0);
    expect(w.timers).toEqual([]);
    expect(w.waiting.every((n) => n === 0)).toBe(true);
  });

  it("sends a room's record once when it ends with the switch on", async () => {
    const storage = fakeStorage();
    const { w, logs } = page({ storage });
    logs.start();
    const v = visit("1.1");
    logs.ended(v, device);
    await logs.flush();
    await logs.flush();
    expect(w.sent).toHaveLength(1);
    expect(w.sent[0]).toMatchObject({ id: entryId("u1", "1.1", v.start), userId: "u1", roomId: "1.1" });
    expect(logs.queued()).toEqual([]);
    expect(storage.items.size).toBe(0);
    expect(w.waiting.at(-1)).toBe(0);
  });

  it("sends exactly the payload fields, and of the typed lines only the commands", async () => {
    const storage = fakeStorage();
    const { w, logs } = page({ storage });
    const lines: Run[] = [
      { line: "ip link" },
      { line: "my name is Ana", exitCode: 127 },
      { line: "ana@example.com", exitCode: 127 },
      { line: "sudo ip addr add 10.0.0.2/24 dev eth0" },
      { line: "ping 10.9.9.9", source: "click", exitCode: 1 },
    ];
    const v = visit("1.1", lines);
    readMistakes(v, ["wrong-door"]);
    // The visit keeps the failed lines, the private ones included; the record mustn't.
    expect(v.failed.map((f) => f.line)).toEqual(["my name is Ana", "ana@example.com", "ping 10.9.9.9"]);

    logs.ended(v, { ...device, gpu: "Ana's laptop" } as Device);
    await logs.flush();
    // A room kept mid-room takes the other road to the server (storage, then the next page).
    logs.keep(visit("1.2", lines), device);
    expect([...storage.items.values()].join("")).not.toMatch(/Ana|example\.com/);
    const next = page({ storage });
    next.logs.start();
    await next.logs.flush();

    const sent = [...w.sent, ...next.w.sent];
    expect(sent).toHaveLength(2);
    expect(Object.keys(sent[0] ?? {}).sort()).toEqual(["id", "payload", "roomId", "userId"]);
    expect(sent[0]?.payload).toStrictEqual({
      v: 1,
      roomId: "1.1",
      seconds: 60,
      won: false,
      hints: 0,
      mistakes: ["wrong-door"],
      commands: ["ip link", "sudo ip addr add 10.0.0.2/24 dev eth0"],
      device: { tier: "medium", auto: true, frameMs: 16.7 },
    });
    expect(sent[1]?.payload.commands).toEqual(["ip link", "sudo ip addr add 10.0.0.2/24 dev eth0"]);
    expect(JSON.stringify(sent)).not.toMatch(/Ana|example\.com|10\.9\.9\.9/);
  });

  it("keeps a room's first 100 commands, each cut to 160 characters", () => {
    const long = `ping ${"1".repeat(300)}`;
    const lines = [long, ...Array.from({ length: MAX_COMMANDS + 20 }, (_, i) => `ip link show eth${i}`)];
    const { commands } = payloadOf(visit("1.1", lines), device);
    expect(commands).toHaveLength(MAX_COMMANDS);
    expect(commands[0]).toBe(long.slice(0, MAX_LINE));
    expect(commands.at(-1)).toBe(`ip link show eth${MAX_COMMANDS - 2}`);
    // Other text doesn't use up the count.
    const chatty = payloadOf(visit("1.1", [...Array(MAX_COMMANDS).fill("hello"), "ip link"]), device);
    expect(chatty.commands).toEqual(["ip link"]);
  });

  it("queues records in order while offline and sends them once back online", async () => {
    const storage = fakeStorage();
    const { w, logs } = page({ storage });
    w.online = false;
    logs.start();
    for (const room of ["1.1", "1.2", "1.3"]) logs.ended(visit(room), device);
    await logs.flush();
    expect(w.sent).toEqual([]);
    expect(w.timers).toEqual([]); // offline isn't a failure: the page's 'online' event flushes
    expect(logs.queued().map((e) => e.roomId)).toEqual(["1.1", "1.2", "1.3"]);
    expect(JSON.parse(storage.items.get(QUEUE_KEY) ?? "[]")).toEqual(logs.queued());
    expect(w.waiting.at(-1)).toBe(3);

    w.online = true;
    await logs.flush();
    expect(w.sent.map((e) => e.roomId)).toEqual(["1.1", "1.2", "1.3"]);
    expect(logs.queued()).toEqual([]);
    expect(storage.items.has(QUEUE_KEY)).toBe(false);
    expect(w.waiting.at(-1)).toBe(0);
  });

  it("tries a failed send again after 30 s, then 60 s, and loses nothing", async () => {
    const { w, logs } = page();
    w.results = ["retry", "throw"]; // the server is busy, then the network drops
    const v = visit("1.1");
    logs.ended(v, device);
    await logs.flush();
    expect(w.sent).toHaveLength(1);
    expect(w.timers.map((t) => t.ms)).toEqual([30_000]);
    expect(logs.queued()).toHaveLength(1);

    w.timers[0]?.run();
    await logs.flush();
    expect(w.sent).toHaveLength(2);
    expect(w.timers.map((t) => t.ms)).toEqual([30_000, 60_000]);
    expect(logs.queued()).toHaveLength(1);

    w.timers[1]?.run();
    await logs.flush();
    expect(w.sent).toHaveLength(3);
    expect(new Set(w.sent.map((e) => e.id))).toEqual(new Set([entryId("u1", "1.1", v.start)]));
    expect(logs.queued()).toEqual([]);
    expect(w.timers).toHaveLength(2);
  });

  it("waits at most 15 minutes between tries, and 30 s again once everything is sent", async () => {
    const { w, logs } = page();
    w.results = Array(8).fill("retry");
    logs.ended(visit("1.1"), device);
    await logs.flush();
    for (let i = 0; i < 8; i++) {
      w.timers.at(-1)?.run();
      await logs.flush();
    }
    expect(w.timers.map((t) => t.ms / 1000)).toEqual([30, 60, 120, 240, 480, 900, 900, 900]);
    expect(logs.queued()).toEqual([]);

    // One try is scheduled at most: a failure while one waits replaces it.
    w.results = ["retry", "retry"];
    logs.ended(visit("1.2"), device);
    await logs.flush();
    logs.ended(visit("1.3"), device);
    await logs.flush();
    expect(w.timers.slice(-2).map((t) => [t.ms, t.cancelled])).toEqual([
      [30_000, true],
      [60_000, false],
    ]);
  });

  it("drops a record the server will never take and still sends the next", async () => {
    const { w, logs } = page();
    w.online = false;
    logs.ended(visit("1.1"), device);
    logs.ended(visit("1.2"), device);
    w.online = true;
    w.results = ["drop"];
    await logs.flush();
    expect(w.sent.map((e) => e.roomId)).toEqual(["1.1", "1.2"]);
    expect(logs.queued()).toEqual([]);
    expect(w.timers).toEqual([]);
  });

  it.each([
    ["switching off", { userId: "u1", on: false }],
    ["signing out", { userId: null, on: false }],
  ] as [string, Consent][])("forgets the records not yet sent and the kept room on %s", async (_, off) => {
    const storage = fakeStorage();
    const { w, logs } = page({ storage });
    w.online = false;
    logs.ended(visit("1.1"), device);
    logs.keep(visit("1.2"), device);
    expect([...storage.items.keys()].sort()).toEqual([OPEN_KEY, QUEUE_KEY]);

    w.consent = off;
    logs.sync();
    expect(logs.queued()).toEqual([]);
    expect(storage.items.size).toBe(0);
    expect(w.waiting.at(-1)).toBe(0);
    w.online = true;
    await logs.flush();

    // Switching back on (or signing in again) doesn't bring them back.
    w.consent = { userId: "u1", on: true };
    logs.sync();
    const next = page({ storage });
    next.logs.start();
    await Promise.all([logs.flush(), next.logs.flush()]);
    expect([...w.sent, ...next.w.sent]).toEqual([]);
  });

  it("drops the last player's records when another signs in, and never sends them", async () => {
    const { w, logs } = page();
    w.online = false;
    logs.ended(visit("1.1"), device);
    w.consent = { userId: "u2", on: true };
    w.online = true;
    await logs.flush(); // even before sync(), only the signed-in player's records go
    expect(w.sent).toEqual([]);
    logs.sync();
    expect(logs.queued()).toEqual([]);

    logs.ended(visit("1.2"), device);
    await logs.flush();
    expect(w.sent.map((e) => [e.userId, e.roomId])).toEqual([["u2", "1.2"]]);
    w.consent = { userId: "u1", on: true };
    logs.sync();
    await logs.flush();
    expect(w.sent).toHaveLength(1);
  });

  it("sends a room kept when the page closed mid-room from the next page, if it's the same player's", async () => {
    const storage = fakeStorage();
    const before = page({ storage });
    const v = visit("2.1");
    before.logs.keep(v, device);
    expect(before.w.sent).toEqual([]); // kept, not sent: the room isn't over unless the page closes

    const after = page({ storage });
    after.logs.start();
    await after.logs.flush();
    expect(after.w.sent).toHaveLength(1);
    expect(after.w.sent[0]).toMatchObject({ id: entryId("u1", "2.1", v.start), userId: "u1", roomId: "2.1" });
    expect(storage.items.size).toBe(0);

    // Another player's kept room is thrown away: not sent for this one, nor later for its own.
    page({ storage }).logs.keep(visit("2.2"), device);
    const other = page({ storage, consent: { userId: "u2", on: true } });
    other.logs.start();
    await other.logs.flush();
    const again = page({ storage });
    again.logs.start();
    await again.logs.flush();
    expect([...other.w.sent, ...again.w.sent]).toEqual([]);
    expect(storage.items.size).toBe(0);
  });

  it("doesn't send a kept room again once it has ended on the same page", async () => {
    const storage = fakeStorage();
    const { w, logs } = page({ storage });
    const v = visit("2.3");
    logs.keep(v, device); // the tab was hidden...
    logs.ended(v, device); // ...came back, and the room ended
    await logs.flush();
    const next = page({ storage });
    next.logs.start();
    await next.logs.flush();
    expect(w.sent).toHaveLength(1);
    expect(next.w.sent).toEqual([]);
  });

  it("sends each record once when flush is called again during a send", async () => {
    const { w, logs } = page();
    w.online = false;
    logs.ended(visit("1.1"), device);
    logs.ended(visit("1.2"), device);
    w.online = true;
    let answer = () => {};
    w.hold = new Promise<void>((resolve) => {
      answer = () => resolve();
    });
    const first = logs.flush();
    const second = logs.flush();
    expect(second).toBe(first);
    await tick();
    expect(w.sent).toHaveLength(1); // one at a time: the first waits for the server
    logs.ended(visit("1.3"), device); // a room ends meanwhile: the loop under way picks it up
    expect(logs.flush()).toBe(first);
    answer();
    await first;
    expect(w.sent.map((e) => e.roomId)).toEqual(["1.1", "1.2", "1.3"]);
  });

  it("replaces a record with the same id and keeps only the newest MAX_QUEUE", () => {
    const entry = (id: string, roomId = "1.1"): Entry => ({
      id,
      userId: "u1",
      roomId,
      payload: payloadOf(visit(roomId), device),
    });
    const queue = enqueue(enqueue([], entry("a")), entry("b"));
    expect(enqueue(queue, entry("a", "1.9")).map((e) => [e.id, e.roomId])).toEqual([
      ["b", "1.1"],
      ["a", "1.9"],
    ]);
    expect(queue.map((e) => e.id)).toEqual(["a", "b"]); // the queue given is left as it was

    let full: Entry[] = [];
    for (let i = 0; i < MAX_QUEUE + 5; i++) full = enqueue(full, entry(`e${i}`));
    expect(full).toHaveLength(MAX_QUEUE);
    expect(full[0]?.id).toBe("e5");
    expect(full.at(-1)?.id).toBe(`e${MAX_QUEUE + 4}`);
    expect(enqueue(queue, entry("c"), 2).map((e) => e.id)).toEqual(["b", "c"]);
  });

  it("gives a visit the same UUID-shaped id every time, and other visits other ids", () => {
    const start = "2026-11-05T10:00:00.000Z";
    const id = entryId("u1", "1.1", start);
    expect(entryId("u1", "1.1", start)).toBe(id);
    const ids = [
      id,
      entryId("u2", "1.1", start),
      entryId("u1", "1.2", start),
      entryId("u1", "1.1", "2026-11-05T10:00:01.000Z"),
    ];
    expect(new Set(ids).size).toBe(4);
    for (let i = 0; i < 200; i++) ids.push(entryId("u1", `room${i}`, start));
    for (const x of ids) expect(x).toMatch(UUID);
    const v = visit("1.1");
    expect(entryOf(v, "u1", device).id).toBe(entryId("u1", "1.1", v.start));
  });

  it.each([
    ["throws on every call", blocked],
    ["is missing", null],
  ] as [string, LogsDeps["storage"]][])(
    "keeps the queue in memory when storage %s, and nothing throws",
    async (_, storage) => {
      const { w, logs } = page({ storage });
      w.online = false;
      expect(() => {
        logs.start();
        logs.ended(visit("1.1"), device);
        logs.ended(visit("1.2"), device);
        logs.keep(visit("1.3"), device);
        logs.sync();
      }).not.toThrow();
      expect(logs.queued().map((e) => e.roomId)).toEqual(["1.1", "1.2"]);
      w.online = true;
      await logs.flush();
      expect(w.sent.map((e) => e.roomId)).toEqual(["1.1", "1.2"]);
      expect(logs.queued()).toEqual([]);
    },
  );

  it("never throws, even when every callback does", async () => {
    const fail = () => {
      throw new Error("broken");
    };
    const lost = playLogs({ consent: fail, send: fail, storage: blocked, online: fail, later: fail, onQueue: fail });
    expect(() => {
      lost.start();
      lost.sync();
      lost.ended(visit("1.1"), device);
      lost.keep(visit("1.2"), device);
    }).not.toThrow();
    await expect(lost.flush()).resolves.toBeUndefined();
    expect(lost.queued()).toEqual([]); // no one known to send for: nothing kept

    const shaky = playLogs({
      consent: () => ({ userId: "u1", on: true }),
      send: fail,
      storage: null,
      online: fail,
      later: fail,
      onQueue: fail,
    });
    expect(() => shaky.ended(visit("1.1"), device)).not.toThrow();
    await expect(shaky.flush()).resolves.toBeUndefined();
    expect(shaky.queued()).toHaveLength(1); // kept for a later try
  });
});
