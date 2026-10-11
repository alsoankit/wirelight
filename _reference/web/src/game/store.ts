// REFERENCE ONLY. Keep the ideas in lines (of the original file) 35–44 (capture type), 61–81 (session, current,
// currentFacts), 139–149 (furthest, available), 345–445 (ruinOf, routes, afterEvents, saving, hints).
// The rest is tied to the old 2D view; rewrite the store around the 3D world and the worker engine.
// (These three comment lines shift the original line numbers by 3.)
/**
 * Game state. The network lives in the session's backend; React sees only small, derived pieces.
 * View state (ruin, corridor light, won) is derived from the trace and world, never set by hand (ARCH-03).
 */
import {
  type Facts,
  facts,
  type ObjectRef,
  type RoomDef,
  roomById,
  rooms,
  shellContent,
  toolsIn,
} from "@wirelight/rooms";
import { SimBackend } from "@wirelight/shell";
import type { CmdSource } from "@wirelight/sim";
import { create } from "zustand";
import { advanceHints, cardsFor, countAttempts, type HintClock, newHintClock, type Trigger } from "./learning";
import { PacketTracker } from "./packets";
import { loadProgress, type Progress, saveProgress } from "./progress";
import { forgetRoom, savedRoom, saveRoomSoon } from "./save";

export type Location = { kind: "room"; device: string } | { kind: "corridor"; link: string; from: string };

export type Focus =
  | { kind: "plate"; device: string; iface: string }
  | { kind: "workbench" }
  | { kind: "card" }
  | { kind: "keeper"; device: string }
  | { kind: "lock" }
  | { kind: "jar" }
  | { kind: "capture"; id: number }
  | null;

/** A caught copy of a frame (FR-PKT-06/07). Bytes are kept as numbers so the jar can be saved. */
export interface Capture {
  id: number;
  bytes: number[];
  /** Where it was caught, in plain words. */
  where: string;
  caughtAt: number;
}

const JAR_SIZE = 50;

export interface Wave {
  mode: "restore" | "decay";
  origin: ObjectRef;
  started: number;
}

export interface Note {
  id: string;
  text: string;
  /** Which hint this is (1–5), if it's from the hint ladder. */
  hint?: number;
  /** A Codex entry the note points to. */
  codex?: string;
}

interface Session {
  room: RoomDef;
  backend: SimBackend;
  tracker: PacketTracker;
  health: Map<string, boolean>;
  fired: Set<string>;
  dirty: boolean;
  hints: HintClock;
}

let session: Session | null = null;

export function current(): Session {
  if (!session) throw new Error("no room loaded");
  return session;
}

export function currentFacts(): Facts {
  const s = current();
  return facts(s.backend.trace(), s.backend.state());
}

interface GameState {
  progress: Progress;
  roomId: string;
  location: Location;
  focus: Focus;
  glassOpen: boolean;
  consoleOpen: boolean;
  menuOpen: boolean;
  /** Which menu page to show the next time it opens. */
  menuView: "index" | "guide" | "codex";
  speed: number;
  paused: boolean;
  reducedMotion: boolean;
  /** Bumped (at most once per frame) when the trace grows, so React re-reads derived state. */
  version: number;
  ruin: number;
  wave: Wave | null;
  won: boolean;
  /** Real time the key started flying to the lock. */
  wonAt: number | null;
  debriefOpen: boolean;
  notes: Note[];
  /** Discovery cards waiting to be shown, one at a time (FR-LEARN-03). */
  cardQueue: string[];
  /** Hints unlocked so far in this room, and how many the player has opened. */
  hintsAvailable: number;
  hintsShown: number;
  /** The capture jar: belongs to the current room, survives Reset, oldest out first. */
  jar: Capture[];
  /** The pointer is on a catchable message: time slows so it can be caught (FR-PKT-06). */
  aiming: boolean;
  /** Brief "caught!" feedback at a screen point. */
  lastCatch: { x: number; y: number; at: number } | null;
  /** The workbench keeps what you wrote while it's closed (it closes itself when you send). */
  workbenchDraft: { to: string; msg: string };

  enterRoom(id: string): void;
  go(loc: Location): void;
  setFocus(f: Focus): void;
  toggleGlass(open?: boolean): void;
  toggleConsole(open?: boolean): void;
  toggleMenu(open?: boolean): void;
  openGuide(): void;
  setSpeed(s: number): void;
  togglePause(): void;
  run(line: string, source?: CmdSource, device?: string): void;
  resetRoom(): void;
  dismissNote(id: string): void;
  catchFrame(bytes: Uint8Array, where: string, at: { x: number; y: number }): void;
  discover(trigger: Trigger): void;
  dismissCard(): void;
  showNextHint(): void;
  openCodex(): void;
  continueOn(): void;
}

/** The first room not yet cleared, or the last room. Unearned rooms redirect here (ARCH-10). */
export function furthest(p: Progress): RoomDef {
  return rooms.find((r) => !p.cleared.includes(r.id)) ?? (rooms.at(-1) as RoomDef);
}

export function available(p: Progress, id: string): boolean {
  if (p.cleared.includes(id) || furthest(p).id === id) return true;
  // Challenge the boss (FR-WORLD-11): from a floor's first room on, its boss is open.
  const room = roomById(id);
  return room?.kind === "boss" && furthest(p).floor >= room.floor;
}

/** Set at start-up from IndexedDB (main.tsx) before the first render. */
let bootProgress: Progress | null = null;
export function setBootProgress(p: Progress) {
  bootProgress = p;
  useGame.setState({ progress: p });
}

export const useGame = create<GameState>((set, get) => ({
  progress: bootProgress ?? loadProgress(),
  roomId: "",
  location: { kind: "room", device: "observatory" },
  focus: null,
  glassOpen: false,
  consoleOpen: false,
  menuOpen: false,
  menuView: "index",
  speed: 1,
  paused: false,
  reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  version: 0,
  ruin: 1,
  wave: null,
  won: false,
  wonAt: null,
  debriefOpen: false,
  notes: [],
  jar: [],
  cardQueue: [],
  hintsAvailable: 0,
  hintsShown: 0,
  aiming: false,
  lastCatch: null,
  workbenchDraft: { to: "", msg: "hello" },

  enterRoom(id) {
    const room = roomById(id) ?? furthest(get().progress);
    const backend = new SimBackend(shellContent);
    const tools = toolsIn(room, rooms);
    backend.options = () => ({ tools, subtitles: room.subtitles ?? room.floor <= 2 });
    backend.loadSync(room.topology, room.faults, room.seed);
    // Pick up where the player left off in this room (FR-PROG-01).
    const saved = savedRoom(room.id);
    if (saved && !get().progress.cleared.includes(room.id)) {
      try {
        backend.restore(saved.snapshot);
      } catch {
        forgetRoom(room.id);
      }
    }
    const tracker = new PacketTracker();
    const used = get().progress.rooms[room.id]?.hintsUsed ?? 0;
    const s: Session = {
      room,
      backend,
      tracker,
      health: new Map(),
      fired: new Set(),
      dirty: true,
      hints: newHintClock(performance.now(), used),
    };
    backend.subscribe((e) => {
      tracker.onEvent(e, performance.now());
      s.dirty = true;
    });
    const f = facts(backend.trace(), backend.state());
    for (const h of room.healthChecks) s.health.set(h.id, h.check(f));
    session = s;
    set({
      roomId: room.id,
      location: { kind: "room", device: room.playerDevice },
      focus: null,
      menuOpen: false,
      glassOpen: room.glassOpen ?? false,
      consoleOpen: false,
      ruin: ruinOf(s),
      wave: null,
      won: false,
      wonAt: null,
      debriefOpen: false,
      notes: room.notes.map((text, i) => ({ id: `intro-${i}`, text })),
      workbenchDraft: { to: "", msg: "hello" },
      hintsAvailable: used,
      hintsShown: used,
      // The jar belongs to a room; leaving the room empties it (FR-PKT-07).
      jar: get().roomId === room.id ? get().jar : (saved?.jar ?? []),
      version: get().version + 1,
    });
    get().discover("enter");
    const path = roomPath(room);
    if (window.location.pathname !== path) window.history.pushState(null, "", path);
  },

  go(location) {
    set({ location, focus: null });
  },
  setFocus: (focus) => {
    set({ focus });
    if (focus?.kind === "workbench") get().discover("workbench");
    if (focus?.kind === "capture") get().discover("open");
  },
  toggleGlass: (open) => {
    const next = open ?? !get().glassOpen;
    set({ glassOpen: next, focus: null });
    if (next) get().discover("glass");
  },
  toggleConsole: (open) => {
    const next = open ?? !get().consoleOpen;
    set({ consoleOpen: next });
    if (next) get().discover("console");
  },
  toggleMenu: (open) => set((s) => ({ menuOpen: open ?? !s.menuOpen })),
  openGuide: () => set({ menuOpen: true, menuView: "guide", focus: null, glassOpen: false }),
  setSpeed: (speed) => set({ speed }),
  togglePause: () => set((s) => ({ paused: !s.paused })),

  run(line, source = "typed", device) {
    const loc = get().location;
    const dev = device ?? (loc.kind === "room" ? loc.device : null);
    // Doing has a place (P-6): commands only run inside a machine's room.
    if (!dev) return;
    current().backend.exec(dev, line, source);
  },

  resetRoom() {
    const s = current();
    s.backend.reset();
    s.fired.clear();
    set({ focus: null, notes: [] });
  },

  dismissNote: (id) => set((s) => ({ notes: s.notes.filter((n) => n.id !== id) })),

  catchFrame(bytes, where, at) {
    const now = performance.now();
    set((s) => ({
      jar: [...s.jar, { id: (s.jar.at(-1)?.id ?? 0) + 1, bytes: Array.from(bytes), where, caughtAt: now }].slice(
        -JAR_SIZE,
      ),
      lastCatch: { ...at, at: now },
    }));
    current().hints.lastActivity = now;
    get().discover("catch");
    scheduleRoomSave();
  },

  discover(trigger) {
    const s = session;
    if (!s) return;
    const p = get().progress;
    const fresh = cardsFor(trigger, s.room).filter((c) => !p.seenCards.includes(c) && !get().cardQueue.includes(c));
    if (fresh.length === 0) return;
    const progress = { ...p, seenCards: [...p.seenCards, ...fresh] };
    saveProgress(progress);
    set({ progress, cardQueue: [...get().cardQueue, ...fresh] });
  },
  dismissCard: () => set((s) => ({ cardQueue: s.cardQueue.slice(1) })),

  showNextHint() {
    const s = current();
    const st = get();
    if (st.hintsShown >= st.hintsAvailable) return;
    const n = st.hintsShown + 1;
    const hint = s.room.hints[n - 1];
    if (!hint) return;
    const prev = st.progress.rooms[s.room.id] ?? { hintsUsed: 0, usedReveal: false };
    // Using the reveal is allowed without any warning; it's only recorded (FR-HINT-09).
    const progress = {
      ...st.progress,
      rooms: {
        ...st.progress.rooms,
        [s.room.id]: { hintsUsed: Math.max(prev.hintsUsed, n), usedReveal: prev.usedReveal || n === 5 },
      },
    };
    saveProgress(progress);
    set({
      progress,
      hintsShown: n,
      notes: [
        ...st.notes.filter((x) => !x.hint),
        { id: `hint-${n}`, text: hint.text, hint: n, ...(hint.codex ? { codex: hint.codex } : {}) },
      ],
    });
  },
  openCodex: () => set({ menuOpen: true, menuView: "codex", focus: null, glassOpen: false }),

  continueOn() {
    const s = current();
    const i = rooms.findIndex((r) => r.id === s.room.id);
    const next = rooms[i + 1];
    if (next) get().enterRoom(next.id);
    else set({ debriefOpen: false });
  },
}));

function ruinOf(s: Session): number {
  const total = s.room.healthChecks.length;
  if (total === 0) return 0;
  let failing = 0;
  for (const v of s.health.values()) if (!v) failing++;
  return failing / total;
}

export function roomPath(room: RoomDef): string {
  return `/floor/${room.floor < 0 ? "prologue" : room.floor}/room/${room.id}`;
}

export function roomFromPath(pathname: string): string | null {
  const m = /^\/floor\/[^/]+\/room\/([^/]+)$/.exec(pathname);
  return m?.[1] ?? null;
}

/**
 * Called by the clock after the trace grew: re-derive health (ruin and restoration), detectors,
 * and the win condition. Everything here reads the trace and the world; nothing is set by hand.
 */
export function afterEvents(): void {
  const s = session;
  if (!s?.dirty) return;
  s.dirty = false;
  const st = useGame.getState();
  const f = currentFacts();
  const patch: Partial<GameState> = { version: st.version + 1 };
  const trace = s.backend.trace();
  const from = s.hints.seen;
  countAttempts(s.hints, trace, performance.now(), st.won);
  for (let i = from; i < trace.length; i++) {
    const e = trace[i];
    if (e?.kind === "frame.tx") st.discover("send");
    if (e?.kind === "cmd.exec" && /^(sudo\s+)?ip\s+(link|l)\b/.test(e.line) && e.exitCode === 0) st.discover("ip-link");
  }

  for (const h of s.room.healthChecks) {
    const now = h.check(f);
    const before = s.health.get(h.id);
    if (before !== now) {
      s.health.set(h.id, now);
      patch.wave = { mode: now ? "restore" : "decay", origin: h.object, started: performance.now() };
    }
  }
  patch.ruin = ruinOf(s);

  const notes = [...st.notes];
  for (const m of s.room.misconceptions) {
    if (s.fired.has(m.id) || !m.detect(f)) continue;
    s.fired.add(m.id);
    notes.push({ id: `m-${m.id}`, text: m.note });
  }
  patch.notes = notes;

  if (!st.won && s.room.winCondition(f)) {
    // Beating a boss clears its whole floor (FR-WORLD-11).
    const floorRooms = s.room.kind === "boss" ? rooms.filter((r) => r.floor === s.room.floor).map((r) => r.id) : [];
    const progress: Progress = {
      ...st.progress,
      cleared: [...new Set([...st.progress.cleared, s.room.id, ...floorRooms])],
      keyring: [...st.progress.keyring.filter((k) => k.room !== s.room.id), { room: s.room.id, word: s.room.key.word }],
    };
    saveProgress(progress);
    forgetRoom(s.room.id);
    patch.won = true;
    patch.wonAt = performance.now();
    patch.progress = progress;
    setTimeout(() => useGame.setState({ debriefOpen: true }), 2600);
    setTimeout(() => useGame.getState().discover("key"), 1700);
  }
  useGame.setState(patch);
  if (!patch.won && !st.won) scheduleRoomSave();
}

/** Save the room in progress (debounced), so a refresh loses at most a moment (NFR-07). */
export function scheduleRoomSave(): void {
  const s = session;
  if (!s || useGame.getState().won) return;
  const id = s.room.id;
  saveRoomSoon(id, () => ({ snapshot: s.backend.snapshot(), jar: useGame.getState().jar, savedAt: Date.now() }));
}

/** Misconceptions that fired this attempt, for the debrief's "What you tried". */
export function firedMisconceptions(): string[] {
  return [...current().fired];
}

/** Called by the clock: unlock the next hint when its time has come. */
export function tickHints(now: number): void {
  const s = session;
  if (!s || useGame.getState().won) return;
  if (advanceHints(s.hints, s.room, now)) useGame.setState({ hintsAvailable: s.hints.unlocked });
}

/** The player has been idle for a minute with a hint waiting (FR-HINT-08). */
export function idleWithHint(now: number): boolean {
  const s = session;
  const st = useGame.getState();
  return !!s && st.hintsAvailable > st.hintsShown && now - s.hints.lastActivity > 60_000;
}
