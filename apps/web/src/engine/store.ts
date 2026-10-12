import type { Batch, RoomStatus } from "@wirelight/engine";
import type { CmdSource, SimEvent } from "@wirelight/sim";
import { create } from "zustand";
import { type Crossing, nextNetworkTime } from "./clock";
import { startEngine } from "./connect";

// The session store (tech/architecture.md): the events the engine has sent, the room's status, and
// what's derived from them. Nothing here is set by hand: every field changes only by applying a batch
// from the engine, or by the clock's own pause and speed.

type Session = {
  roomId: string | null;
  events: SimEvent[];
  status: RoomStatus | null;
  /** Messages on a cable now (link.enter not yet followed by link.exit). */
  onCables: Crossing[];
  paused: boolean;
  speed: number;
  load(roomId: string): Promise<void>;
  exec(device: string, line: string, source: CmdSource): Promise<void>;
  /** Called every rendered frame with the screen time that passed. */
  tick(screenMs: number): void;
  setPaused(paused: boolean): void;
  setSpeed(speed: number): void;
};

const { engine } = startEngine();
let busy = false; // one request to the worker at a time; frames in between just wait

function apply(state: Session, batch: Batch): Partial<Session> {
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
  events: [],
  status: null,
  onCables: [],
  paused: false,
  speed: 1,

  async load(roomId) {
    busy = true;
    const batch = await engine.loadRoom(roomId);
    set({ roomId, events: [], onCables: [] });
    set((s) => apply(s, batch));
    busy = false;
  },

  async exec(device, line, source) {
    while (busy) await new Promise((r) => setTimeout(r, 4));
    busy = true;
    const batch = await engine.exec(device, line, source);
    set((s) => apply(s, batch));
    busy = false;
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

  setPaused: (paused) => set({ paused }),
  setSpeed: (speed) => set({ speed }),
}));
