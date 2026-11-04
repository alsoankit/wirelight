import type { Batch, RoomStatus } from "@wirelight/engine";
import { roomById, rooms } from "@wirelight/rooms";
import type { CmdSource, ScannerCatch, ScannerLayerName, ScannerOpen, SimEvent } from "@wirelight/sim";
import { create } from "zustand";
import { useProgress } from "../progress/progress";
import { type Crossing, nextNetworkTime } from "./clock";
import { startEngine } from "./connect";

// The session store (tech/architecture.md): the events the engine has sent, the room's status, and
// what's derived from them. Nothing here is set by hand: every field changes only by applying a batch
// from the engine, or by the clock's own pause and speed.

/** A reading panel open over the room (UI-03). */
export type Panel =
  | { kind: "plate"; device: string; iface: string }
  | { kind: "workbench" }
  | { kind: "card" }
  | { kind: "jar"; open?: number }
  | { kind: "board"; device: string; board: "mac" | "ledger" | "routes"; execId?: number }
  | { kind: "desk"; device: string }
  | { kind: "scanner" }
  | { kind: "keeper"; device: string }
  | { kind: "notes" }
  | { kind: "ask" }
  | { kind: "menu"; tab?: "dungeon" | "codex" | "guide" | "keys" | "settings" };

/** What reached one door lately (see Session.arrivals). */
/** A corridor the player is in (0081): which cable, from which machine, and where they're gliding to. */
export type Corridor = { link: string; from: string; through?: string };

export type Arrival = { t: number; frameId: number; bytes: Uint8Array; count: number; ignored: number };

type Session = {
  roomId: string | null;
  /** The machine whose room the player is standing in (CORE-10); commands run there (UI-11). */
  here: string | null;
  /**
   * In a corridor (0081): its cable and the machine the player came from (`here` stays that machine, so
   * the console still runs there). With `through`, the player is gliding on to that machine's room.
   */
  corridor: Corridor | null;
  panel: Panel | null;
  /** When the room was loaded or reset (screen time, ms): hints count from here (HELP-09). */
  startedAt: number;
  /** Back to the room's faulted start (HELP-03). */
  reset(): Promise<void>;
  /** Reset was pressed: the room's command memory plays again, as on a first visit (until it's shown). */
  guidesAgain: boolean;
  guidesShown(): void;
  /** The console bar is slid up (UI-06): ` or a click toggles it; it opens by itself after the gift. */
  consoleOpen: boolean;
  setConsoleOpen(open: boolean): void;
  /** The gift of the voice has been given (0032): the console exists from then on. */
  voiceGiven: boolean;
  giveVoice(): void;
  events: SimEvent[];
  /** How many of the oldest events were let go (so positions in the whole trace stay countable). */
  dropped: number;
  status: RoomStatus | null;
  /** Messages on a cable now (link.enter not yet followed by link.exit). */
  onCables: Crossing[];
  /** Where messages died lately (CORE-17): a faded mark at that door for about ten seconds of screen time. */
  marks: { door: string; at: number; frameId: number }[];
  /**
   * What reached each door lately (keyed `device:iface`): the last message that arrived, how many have
   * arrived since the room began, and how many of them the door ignored (not for it). So an answer can
   * be read without catching it in flight, and ignored marks can be counted.
   */
  arrivals: Record<string, Arrival>;
  /**
   * The Scanner's Capture (`tcpdump -n -i <door>`, 0043): it listens in the background, so the console
   * stays free; `running` until it's stopped. Kept here so the Scanner remembers it when reopened.
   */
  capture: { device: string; door: string; execId: number; running: boolean } | null;
  startCapture(device: string, door: string): Promise<void>;
  /** A message whose journey is being replayed in the Glass (CORE-23), or null. */
  replay: number | null;
  setReplay(frameId: number | null): void;
  paused: boolean;
  speed: number;
  load(roomId: string): Promise<void>;
  /** Walks through a door to the machine at the other end (the caller checks it can be entered). */
  goTo(device: string): void;
  /** Steps into a corridor and stops there (0081): clicking the cable, or a key. */
  enterCorridor(link: string, from: string): void;
  /** Goes through a doorway: glides along its corridor into the room at the other end (0081). */
  passThrough(link: string, from: string, to: string): void;
  openPanel(panel: Panel): void;
  closePanel(): void;
  /** Runs a command line; resolves with its exec id and exit code (null while it keeps running). */
  exec(device: string, line: string, source: CmdSource): Promise<{ execId: number; exitCode: number | null }>;
  /** Ctrl+C on a command that keeps running. */
  interrupt(device: string, execId: number): Promise<void>;
  /** Touches a worn-out control (0040). */
  touch(device: string, control: string): Promise<void>;
  /** The jar (CORE-19): every catch so far, newest last. */
  jar: ScannerCatch[];
  /** Catches a copy of a message in flight (CORE-18). */
  catchFrame(frameId: number): Promise<void>;
  /** Opens catch `n` down to a layer; resolves with what it shows. */
  openCatch(device: string, n: number, layer: ScannerLayerName): Promise<ScannerOpen>;
  /** Called every rendered frame with the screen time that passed. */
  tick(screenMs: number): void;
  setPaused(paused: boolean): void;
  setSpeed(speed: number): void;
};

const { engine } = startEngine();
/** The store keeps at most this many trace events, trimming down to KEEP_EVENTS when it's reached. */
const MAX_EVENTS = 40_000;
const KEEP_EVENTS = 30_000;

/**
 * Drops that aren't a message lost: a broadcast nobody listens for, and a switch rightly not sending a
 * frame back the way it came. They leave no mark.
 */
const NOT_LOST = new Set(["no-listener", "fdb-filter"]);

/** How long a lost message's mark stays (CORE-17), screen ms. */
export const MARK_MS = 10_000;

// One request to the worker at a time, in order. Player actions queue first-come, first-served, and a
// frame's tick gives way while any are waiting, so a click never waits behind a run of ticks.
let busy = false;
let waiting = 0;
let lock: Promise<unknown> = Promise.resolve();

/** The room of the gift of the voice: the first whose console can be typed in (0032). */
export const giftRoom = rooms.find((r) => r.controls.console === "typing");

function afterGift(roomId: string): boolean {
  const room = roomById(roomId);
  if (!room || !giftRoom) return false;
  return room.floor * 100 + room.order > giftRoom.floor * 100 + giftRoom.order;
}

/** Runs one request on the worker once every earlier one has finished. */
function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  waiting++;
  const run = lock.then(async () => {
    waiting--;
    busy = true;
    try {
      return await fn();
    } finally {
      busy = false;
    }
  });
  lock = run.catch(() => undefined);
  return run;
}

/** Questions for the worker that change nothing: history and Tab completion (UI-09). */
export const ask = {
  history: (device: string) => engine.history(device),
  complete: (device: string, line: string) => engine.complete(device, line),
  tools: () => engine.tools(),
  /** Settings → Error subtitles: always on, off, or the room's rule (null). */
  setSubtitles: (on: boolean | null) => engine.setSubtitles(on),
};

/** A batch caught something (the Scanner by command, 0043): the jar's list is fetched again. */
function refreshJarIfCaught(batch: Batch): void {
  if (!batch.events.some((e) => e.kind === "scanner.catch")) return;
  void engine.catches().then((jar) => useSession.setState({ jar }));
}

/** A packet's identity (IPv4 from, to, protocol and id: unchanged hop to hop), or null for other frames. */
function packetKey(b: Uint8Array): string | null {
  if (b.length < 34 || b[12] !== 0x08 || b[13] !== 0x00) return null;
  return [b[18], b[19], b[23], ...b.subarray(26, 34)].join(".");
}
/** How many crossings each packet has made (a loop, 9.4). */
const hopsOf = new Map<string, number>();

/** Messages on a cable, by frame and cable: the door they're heading for and their bytes. */
const heading = new Map<string, { door: string; bytes: Uint8Array }>();

function apply(state: Session, batch: Batch): Partial<Session> {
  refreshJarIfCaught(batch);
  let onCables = state.onCables;
  let arrivals = state.arrivals;
  const arrive = (door: string, change: (a: Arrival | undefined) => Arrival) => {
    if (arrivals === state.arrivals) arrivals = { ...arrivals };
    arrivals[door] = change(arrivals[door]);
  };
  for (const e of batch.events) {
    if (e.kind === "link.enter")
      heading.set(`${e.frameId}:${e.link}:${e.dir}`, { door: `${e.to.device}:${e.to.iface}`, bytes: e.bytes });
    else if (e.kind === "link.exit") {
      const h = heading.get(`${e.frameId}:${e.link}:${e.dir}`);
      heading.delete(`${e.frameId}:${e.link}:${e.dir}`);
      if (h)
        arrive(h.door, (a) => ({
          t: e.t,
          frameId: e.frameId,
          bytes: h.bytes,
          count: (a?.count ?? 0) + 1,
          ignored: a?.ignored ?? 0,
        }));
    } else if (e.kind === "frame.drop" && e.reason === "not-for-me" && e.iface) {
      const a = arrivals[`${e.device}:${e.iface}`];
      if (a) arrive(`${e.device}:${e.iface}`, () => ({ ...a, ignored: a.ignored + 1 }));
    } else if (e.kind === "world.reset") {
      heading.clear();
      arrivals = {};
    }
  }
  let capture = state.capture;
  for (const e of batch.events)
    if (capture?.running && e.kind === "proc.exit" && e.execId === capture.execId)
      capture = { ...capture, running: false };
    else if (e.kind === "world.reset") capture = null;
  for (const e of batch.events) {
    if (e.kind === "link.enter")
      onCables = [
        ...onCables,
        {
          frameId: e.frameId,
          link: e.link,
          dir: e.dir,
          from: e.from.device,
          to: e.to.device,
          enter: e.t,
          arriveAt: e.arriveAt,
          summary: e.summary,
          bytes: e.bytes,
          hops: (() => {
            const k = packetKey(e.bytes);
            if (!k) return 1;
            const n = (hopsOf.get(k) ?? 0) + 1;
            hopsOf.set(k, n);
            return n;
          })(),
        },
      ];
    else if (e.kind === "link.exit") onCables = onCables.filter((c) => c.frameId !== e.frameId);
    else if (e.kind === "world.reset") {
      onCables = [];
      hopsOf.clear();
    }
  }
  // A message that died at a door leaves a mark there (it never says why).
  const now = performance.now();
  let marks = state.marks.filter((m) => now - m.at < MARK_MS);
  for (const e of batch.events)
    if (e.kind === "frame.drop" && e.iface && !NOT_LOST.has(e.reason))
      marks = [...marks, { door: `${e.device}:${e.iface}`, at: now, frameId: e.frameId }];
  // Long sessions (a storm makes thousands of events a second) keep the most recent ones only.
  let events = [...state.events, ...batch.events];
  let dropped = state.dropped;
  if (events.length > MAX_EVENTS) {
    const cut = events.length - KEEP_EVENTS;
    events = events.slice(cut);
    dropped += cut;
  }
  return { events, dropped, status: batch.status, onCables, marks, arrivals, capture };
}

export const useSession = create<Session>((set, get) => ({
  roomId: null,
  here: null,
  corridor: null,
  panel: null,
  startedAt: 0,
  guidesAgain: false,
  guidesShown: () => set({ guidesAgain: false }),
  voiceGiven: false,
  consoleOpen: false,
  setConsoleOpen: (consoleOpen) => set({ consoleOpen }),
  giveVoice: () => {
    useProgress.getState().giveVoice();
    set({ voiceGiven: true, consoleOpen: true });
  },
  events: [],
  dropped: 0,
  status: null,
  onCables: [],
  marks: [],
  arrivals: {},
  capture: null,
  async startCapture(device, door) {
    const batch = await exclusive(() => engine.exec(device, `tcpdump -n -i ${door}`, "click"));
    // One update: the console sees the command and knows it's the Scanner's at the same moment.
    set((s) => ({
      ...apply(s, batch),
      capture: { device, door, execId: batch.execId, running: batch.exitCode === null },
    }));
  },
  replay: null,
  setReplay: (replay) => set({ replay, panel: null }),
  paused: false,
  speed: 1,

  async load(roomId) {
    const batch = await exclusive(() => engine.loadRoom(roomId));
    // The voice, once given, stays (saved); a room after the gift's room has it even if this browser never saw the gift.
    const voiceGiven = useProgress.getState().voiceGiven || afterGift(roomId);
    heading.clear();
    hopsOf.clear();
    set({
      roomId,
      here: roomById(roomId)?.playerDevice ?? null,
      corridor: null,
      panel: null,
      jar: [],
      events: [],
      dropped: 0,
      onCables: [],
      arrivals: {},
      capture: null,
      voiceGiven,
      guidesAgain: false,
      startedAt: performance.now(),
    });
    set((s) => apply(s, batch));
  },

  async exec(device, line, source) {
    const batch = await exclusive(() => engine.exec(device, line, source));
    set((s) => apply(s, batch));
    return { execId: batch.execId, exitCode: batch.exitCode };
  },

  async interrupt(device, execId) {
    const batch = await exclusive(() => engine.interrupt(device, execId));
    set((s) => apply(s, batch));
  },

  async touch(device, control) {
    const batch = await exclusive(() => engine.touch(device, control));
    set((s) => apply(s, batch));
  },

  jar: [],

  async catchFrame(frameId) {
    const batch = await exclusive(() => engine.catchFrame(frameId));
    const jar = await exclusive(() => engine.catches());
    set((s) => ({ ...apply(s, batch), jar }));
  },

  async openCatch(device, n, layer) {
    const batch = await exclusive(() => engine.openCatch(device, n, layer));
    set((s) => apply(s, batch));
    return batch.open;
  },

  tick(screenMs) {
    const s = get();
    if (busy || waiting > 0 || s.paused || !s.status) return;
    busy = true;
    const target = nextNetworkTime(s.status.now, s.onCables, screenMs, s.speed);
    lock = engine
      .advanceTo(target, "cable")
      .then((batch) => set((st) => apply(st, batch)))
      .catch(() => undefined)
      .finally(() => {
        busy = false;
      });
  },

  goTo: (device) => set({ here: device, corridor: null, panel: null }),
  enterCorridor: (link, from) => set({ corridor: { link, from }, here: from, panel: null }),
  passThrough: (link, from, to) => set({ corridor: { link, from, through: to }, here: from, panel: null }),

  async reset() {
    const batch = await exclusive(() => engine.reset());
    set((s) => ({ ...apply(s, batch), panel: null, guidesAgain: true }));
  },
  openPanel: (panel) => set({ panel }),
  closePanel: () => set({ panel: null }),

  setPaused: (paused) => set({ paused }),
  setSpeed: (speed) => set({ speed }),
}));
