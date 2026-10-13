import { roomTexts } from "@wirelight/content";
import { floorDefs, type RoomDef, roomById } from "@wirelight/rooms";
import type { SimEvent } from "@wirelight/sim";
import { create } from "zustand";
import type { Panel } from "../engine/store";

// Game-feel moments (core-loop.md CORE-36, CORE-43..45; failure-and-hints.md HELP-12; 0008): what
// has happened in this visit to a room, read from the trace and from the interface, and the rules
// that turn it into a Knight's memory starting, its action being done, a Guardian question opening,
// a journal page glowing, or the Knight offering a gentle way back. Everything here is derived: the
// trace says what the network did; the interface notes only what the trace can't see (a hover, the
// up arrow in the console, the Glass opening).

/**
 * Things that can have happened in this visit. From the trace: `caught`, `caught-announcement`,
 * `opened-catch`, `broadcast-sent`, `sent-frame`, `plugged`, `trace-armed`, `remembered`, and each
 * detector that fired, by its id. From the interface: `own-plate`, `switch-seen`, `board-open`,
 * `slate-open`, `walked`, `near-doorway`, `near-cable`, `hover-message`, `glass-open`,
 * `workbench-message`, `history-up`, `voice-given`, `speed-fast`, `speed-back`.
 */
export type Happened = ReadonlySet<string>;

const BROADCAST = 0xff;

/** Whether a frame's bytes are addressed to everyone (ff:ff:ff:ff:ff:ff). */
function toEveryone(bytes: Uint8Array): boolean {
  if (bytes.length < 6) return false;
  for (let i = 0; i < 6; i++) if (bytes[i] !== BROADCAST) return false;
  return true;
}

/**
 * Reads trace events into what happened. `everyone` remembers which frames were broadcasts, so a
 * catch (which names only the frame) can tell an announcement from a letter. Pure; adds to `out`.
 */
export function readEvents(
  events: readonly SimEvent[],
  player: string,
  out: Set<string>,
  everyone: Set<number> = new Set(),
): void {
  for (const e of events) {
    switch (e.kind) {
      case "frame.tx":
        if (toEveryone(e.bytes)) {
          everyone.add(e.frameId);
          if (e.device === player && e.origin === "command") out.add("broadcast-sent");
        }
        break;
      case "link.enter":
        if (toEveryone(e.bytes)) everyone.add(e.frameId);
        break;
      case "slate.catch":
        out.add("caught");
        if (everyone.has(e.frameId)) out.add("caught-announcement");
        break;
      case "slate.open":
        out.add("opened-catch");
        break;
      case "slate.arm":
        if (e.what === "trace") out.add("trace-armed");
        break;
      case "keeper.step":
        if (e.action === "learn") out.add("remembered");
        break;
      case "cmd.exec":
        if (/^lab send-frame\b/.test(e.line)) out.add("sent-frame");
        if (/^lab cable plug\b/.test(e.line)) out.add("plugged");
        break;
    }
  }
}

/** What the interface shows right now, noted as things that happened (the trace can't see these). */
export function readView(
  v: { panel: Panel | null; here: string | null; speed: number; voiceGiven: boolean; detectors: readonly string[] },
  room: RoomDef,
  had: Happened,
  out: Set<string>,
): void {
  const p = v.panel;
  if (p?.kind === "plate") {
    if (p.device === room.playerDevice) out.add("own-plate");
    if (room.controls.plateSwitches?.[`${p.device}:${p.iface}`]) out.add("switch-seen");
  }
  if (p?.kind === "board") out.add("board-open");
  if (p?.kind === "slate") out.add("slate-open");
  if (p?.kind === "jar" && p.open !== undefined) out.add("opened-catch");
  if (v.here && v.here !== room.playerDevice) out.add("walked");
  if (v.voiceGiven) out.add("voice-given");
  if (v.speed > 1) out.add("speed-fast");
  else if (v.speed === 1 && (had.has("speed-fast") || out.has("speed-fast"))) out.add("speed-back");
  for (const d of v.detectors) out.add(d);
}

/** What a memory's rule sees: what happened, how long the player has been in the room, what's moving. */
export type MemoryContext = { happened: Happened; room: RoomDef; elapsedMs: number; moving: number };

type Rule = {
  /** When the memory plays (its trigger in the floor spec). */
  when(c: MemoryContext): boolean;
  /** When its action is done (no rule: the memory has no action, or it can't be seen). */
  done?(c: MemoryContext): boolean;
};

const has =
  (...what: string[]) =>
  (c: MemoryContext) =>
    what.some((w) => c.happened.has(w));
const entering = () => true;

/**
 * Each Knight's Memory (0008), by id: its trigger and its action, as the floor specs give them.
 * A memory not listed here plays on entering when its trigger says so ("on entering", "first visit").
 */
export const MEMORY_RULES: Record<string, Rule> = {
  // Prologue: the first time the Glass opens; action: hover the moving message.
  "P-MEM-01": { when: has("glass-open"), done: has("hover-message") },
  // 1.1: on entering; action: click your own plate.
  "F1-MEM-01": { when: entering, done: has("own-plate") },
  // 1.1: first time near the doorway (pointing at it, or once the plate is read); action: step into the corridor.
  "F1-MEM-02": { when: has("near-doorway", "own-plate", "walked"), done: has("walked") },
  // 1.2: the corridor is broken when you arrive; action: look at the cable where it meets your door.
  "F1-MEM-03": { when: entering, done: has("near-cable", "plugged", "own-plate") },
  // 1.3: first time a plate's switch is seen; no action.
  "F1-MEM-04": { when: has("switch-seen") },
  // 2.1: first visit; action: drag a word into the Message slot.
  "F2-MEM-01": { when: entering, done: has("workbench-message", "sent-frame") },
  // 2.2: first time a message moves while the jar is ready; action: catch one message.
  "F2-MEM-02": { when: (c) => !!c.room.controls.catching && c.moving > 0, done: has("caught") },
  // 2.2: after the first catch; action: open the catch.
  "F2-MEM-03": { when: has("caught"), done: has("opened-catch") },
  // 2.4: right after CMD-01 (the voice is given); action: press the up arrow once.
  "F2-MEM-04": { when: has("voice-given"), done: has("history-up") },
  // 3.1: on entering; action: press Remember on the waiting frame.
  "F3-MEM-01": { when: entering, done: has("remembered") },
  // 4.1: first time the time control is needed (reading the hall's memory, or a while in the room);
  // action: set time to fast, then back to normal.
  "F4-MEM-01": { when: (c) => c.happened.has("board-open") || c.elapsedMs > 45_000, done: has("speed-back") },
  // 6.1: when the Slate is picked up (first opened); action: catch one message with the Slate.
  "F6-MEM-01": { when: has("slate-open"), done: has("caught") },
  // 9.1: first use of the Slate's tracer (the Slate opened where it has one); action: press Trace.
  "F9-MEM-01": { when: has("slate-open"), done: has("trace-armed") },
};

/** The rule for a memory: its own, or "on entering" when its trigger says so, or never. */
export function ruleFor(id: string, trigger: string): Rule {
  return MEMORY_RULES[id] ?? { when: /enter|first visit/i.test(trigger) ? entering : () => false };
}

/** The memories of a room that should play now: not seen yet, and their trigger has happened. */
export function memoriesDue(room: RoomDef, seen: readonly string[], c: MemoryContext) {
  return (roomTexts[room.content]?.memories ?? []).filter(
    (m) => !seen.includes(m.id) && ruleFor(m.id, m.trigger).when(c),
  );
}

/**
 * A Guardian question that opens later (CORE-43) is shown once its `after` has happened in this
 * visit (a detector by its id, or a moment read from the trace), or once the floor is cleared
 * (CORE-44: after the floor memory, the whole floor's questions open). The `after` values in the
 * content: `own-name` (2.1's detector), `caught-announcement` (2.2: a broadcast caught in the jar),
 * `broadcast-sent` (2.3: the player sent a frame to everyone).
 */
export function questionOpen(after: string | undefined, happened: Happened, floorCleared: boolean): boolean {
  return !after || floorCleared || happened.has(after);
}

/** Whether a floor's boss has been won. */
export function floorCleared(floor: number, cleared: Record<string, unknown>): boolean {
  const boss = floorDefs.find((f) => f.floor === floor)?.boss;
  return !!boss && !!cleared[boss];
}

/**
 * The gentle way back (HELP-12): the floor's earlier room that matches what the player is stuck on.
 * A boss inherits its detectors from the rooms that teach each idea, so the most recent detector
 * that fired names the room; with none, the floor's first room (where its idea starts).
 */
export function matchingRoom(boss: RoomDef, fired: readonly string[]): RoomDef | undefined {
  const floor = floorDefs.find((f) => f.floor === boss.floor);
  const earlier = (floor?.rooms ?? [])
    .filter((id) => id !== boss.id)
    .map((id) => roomById(id))
    .filter((r): r is RoomDef => !!r && r.kind !== "secret");
  for (const d of [...fired].reverse()) {
    const r = earlier.find((x) => roomTexts[x.content]?.detectors[d]);
    if (r) return r;
  }
  return earlier[0];
}

/**
 * Where a floor's journal page lies (CORE-45, the floor specs' "where"), and when it shows: after the
 * win ("glows after the win"), when the corridor has been walked (1.2), in the registry's room (7.2),
 * or from the start (5.2's notice board).
 */
export function journalShows(where: string, c: { won: boolean; here: string | null; player: string }): boolean {
  if (/after the win/i.test(where)) return c.won;
  if (/walk the corridor/i.test(where)) return c.won || (!!c.here && c.here !== c.player);
  if (/registry's room/i.test(where)) return c.here === "registry";
  return true;
}

type Moments = {
  roomId: string | null;
  happened: string[];
  /** The keys on the keyring when this room was entered (so the key's flight knows if it's new). */
  keysBefore: string[];
  /** Bosses whose way-back offer was answered (Go there or Stay): it isn't offered again this session. */
  wayBackAnswered: string[];
  /** A new key on its way to the keyring (it's counted once it lands), or null. */
  flight: string | null;
  /** The keyring glows for a moment when a key lands. */
  landed: boolean;
  /** The first release's ending is playing (after 9.B's floor memory). */
  ending: boolean;
  enter(roomId: string, keys: string[]): void;
  note(...what: string[]): void;
  answerWayBack(bossId: string): void;
  fly(word: string | null): void;
  land(): void;
  setEnding(on: boolean): void;
};

export const useMoments = create<Moments>((set, get) => ({
  roomId: null,
  happened: [],
  keysBefore: [],
  wayBackAnswered: [],
  flight: null,
  landed: false,
  ending: false,
  enter: (roomId, keys) => set({ roomId, happened: [], keysBefore: keys, flight: null }),
  note: (...what) => {
    const had = get().happened;
    const fresh = what.filter((w) => !had.includes(w));
    if (fresh.length) set({ happened: [...had, ...fresh] });
  },
  answerWayBack: (bossId) => set((s) => ({ wayBackAnswered: [...s.wayBackAnswered, bossId] })),
  fly: (flight) => set({ flight, landed: false }),
  land: () => {
    if (get().flight === null && get().landed) return;
    set({ flight: null, landed: true });
    setTimeout(() => set({ landed: false }), 1400);
  },
  setEnding: (ending) => set({ ending }),
}));

/** Notes something the interface saw (a hover, a key, a panel), for the moments of this room. */
export function noteMoment(what: string): void {
  useMoments.getState().note(what);
}
