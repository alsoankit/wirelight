import type { Batch, RoomStatus } from "@wirelight/engine";
import { roomById, rooms } from "@wirelight/rooms";
import type { CmdSource, SimEvent, SlateCatch, SlateLayerName, SlateOpen } from "@wirelight/sim";
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
  | { kind: "slate" }
  | { kind: "notes" }
  | { kind: "ask" }
  | { kind: "menu"; tab?: "dungeon" | "codex" | "guide" | "keys" | "settings" };

type Session = {
  roomId: string | null;
  /** The machine whose room the player is standing in (CORE-10); commands run there (UI-11). */
  here: string | null;
  panel: Panel | null;
  /** When the room was loaded or reset (screen time, ms): hints count from here (HELP-09). */
  startedAt: number;
  /** Back to the room's faulted start (HELP-03). */
  reset(): Promise<void>;
  /** The console bar is slid up (UI-06): ` or a click toggles it; it opens by itself after the gift. */
  consoleOpen: boolean;
  setConsoleOpen(open: boolean): void;
  /** The gift of the voice has been given (0032): the console exists from then on. */
  voiceGiven: boolean;
  giveVoice(): void;
  events: SimEvent[];
  status: RoomStatus | null;
  /** Messages on a cable now (link.enter not yet followed by link.exit). */
  onCables: Crossing[];
  paused: boolean;
  speed: number;
  load(roomId: string): Promise<void>;
  /** Walks through a door to the machine at the other end (the caller checks it can be entered). */
  goTo(device: string): void;
  openPanel(panel: Panel): void;
  closePanel(): void;
  /** Runs a command line; resolves with its exec id and exit code (null while it keeps running). */
  exec(device: string, line: string, source: CmdSource): Promise<{ execId: number; exitCode: number | null }>;
  /** Ctrl+C on a command that keeps running. */
  interrupt(device: string, execId: number): Promise<void>;
  /** Touches a worn-out control (0040). */
  touch(device: string, control: string): Promise<void>;
  /** The jar (CORE-19): every catch so far, newest last. */
  jar: SlateCatch[];
  /** Catches a copy of a message in flight (CORE-18). */
  catchFrame(frameId: number): Promise<void>;
  /** Opens catch `n` down to a layer; resolves with what it shows. */
  openCatch(device: string, n: number, layer: SlateLayerName): Promise<SlateOpen>;
  /** Called every rendered frame with the screen time that passed. */
  tick(screenMs: number): void;
  setPaused(paused: boolean): void;
  setSpeed(speed: number): void;
};

const { engine } = startEngine();
let busy = false; // one request to the worker at a time; frames in between just wait

/** The room of the gift of the voice: the first whose console can be typed in (0032). */
export const giftRoom = rooms.find((r) => r.controls.console === "typing");

function afterGift(roomId: string): boolean {
  const room = roomById(roomId);
  if (!room || !giftRoom) return false;
  return room.floor * 100 + room.order > giftRoom.floor * 100 + giftRoom.order;
}

/** Waits for the worker to be free, then runs one request on it. */
async function exclusive<T>(fn: () => Promise<T>): Promise<T> {
  while (busy) await new Promise((r) => setTimeout(r, 4));
  busy = true;
  try {
    return await fn();
  } finally {
    busy = false;
  }
}

/** Questions for the worker that change nothing: history and Tab completion (UI-09). */
export const ask = {
  history: (device: string) => engine.history(device),
  complete: (device: string, line: string) => engine.complete(device, line),
};

/** A batch caught something (the Slate by command, 0043): the jar's list is fetched again. */
function refreshJarIfCaught(batch: Batch): void {
  if (!batch.events.some((e) => e.kind === "slate.catch")) return;
  void engine.catches().then((jar) => useSession.setState({ jar }));
}

function apply(state: Session, batch: Batch): Partial<Session> {
  refreshJarIfCaught(batch);
  let onCables = state.onCables;
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
        },
      ];
    else if (e.kind === "link.exit") onCables = onCables.filter((c) => c.frameId !== e.frameId);
    else if (e.kind === "world.reset") onCables = [];
  }
  return { events: [...state.events, ...batch.events], status: batch.status, onCables };
}

export const useSession = create<Session>((set, get) => ({
  roomId: null,
  here: null,
  panel: null,
  startedAt: 0,
  voiceGiven: false,
  consoleOpen: false,
  setConsoleOpen: (consoleOpen) => set({ consoleOpen }),
  giveVoice: () => {
    useProgress.getState().giveVoice();
    set({ voiceGiven: true, consoleOpen: true });
  },
  events: [],
  status: null,
  onCables: [],
  paused: false,
  speed: 1,

  async load(roomId) {
    busy = true;
    const batch = await engine.loadRoom(roomId);
    // The voice, once given, stays (saved); a room after the gift's room has it even if this browser never saw the gift.
    const voiceGiven = useProgress.getState().voiceGiven || afterGift(roomId);
    set({
      roomId,
      here: roomById(roomId)?.playerDevice ?? null,
      panel: null,
      jar: [],
      events: [],
      onCables: [],
      voiceGiven,
      startedAt: performance.now(),
    });
    set((s) => apply(s, batch));
    busy = false;
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
    if (busy || s.paused || !s.status) return;
    busy = true;
    const target = nextNetworkTime(s.status.now, s.onCables, screenMs, s.speed);
    engine
      .advanceTo(target, "cable")
      .then((batch) => set((st) => apply(st, batch)))
      .finally(() => {
        busy = false;
      });
  },

  goTo: (device) => set({ here: device, panel: null }),

  async reset() {
    const batch = await exclusive(() => engine.reset());
    set((s) => ({ ...apply(s, batch), panel: null }));
  },
  openPanel: (panel) => set({ panel }),
  closePanel: () => set({ panel: null }),

  setPaused: (paused) => set({ paused }),
  setSpeed: (speed) => set({ speed }),
}));
