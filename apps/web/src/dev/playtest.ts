import type { SimEvent } from "@wirelight/sim";
import { create } from "zustand";
import { useSession } from "../engine/store";
import { useProgress } from "../progress/progress";

// Playtest log (not part of the game): with `?playtest=1` in the address, each room visit is recorded
// for a human playtest: how long it took, whether it was won, the commands that failed, hints opened,
// Ask and keeper "why?" uses, and the mistakes the room caught. It stays in memory and in this browser
// (no server) and downloads as JSON from the button (PlaytestButton.tsx).

export type FailedCommand = { at: string; device: string; line: string; exitCode: number };

export type RoomVisit = {
  roomId: string;
  start: string;
  /** Last moment seen in the room; equals `start` until something happens. */
  end: string;
  seconds: number;
  won: boolean;
  wonAt: string | null;
  commands: number;
  failed: FailedCommand[];
  hints: number;
  asks: number;
  whys: number;
  /** Detector ids (misconceptions the room caught), in the order they fired. */
  mistakes: string[];
  resets: number;
  /** True once the player left this room (another room loaded); false for where they stopped. */
  left: boolean;
};

export type PlaytestLog = { version: 1; began: string; visits: RoomVisit[] };

const KEY = "wirelight.playtest.log";

export function emptyLog(now: Date): PlaytestLog {
  return { version: 1, began: now.toISOString(), visits: [] };
}

function touch(v: RoomVisit, now: Date): void {
  v.end = now.toISOString();
  v.seconds = Math.round((now.getTime() - Date.parse(v.start)) / 1000);
}

/** Starts a visit to `roomId`, closing the one before it. */
export function startVisit(log: PlaytestLog, roomId: string, now: Date): RoomVisit {
  const last = log.visits.at(-1);
  if (last && !last.left) {
    touch(last, now);
    last.left = true;
  }
  const v: RoomVisit = {
    roomId,
    start: now.toISOString(),
    end: now.toISOString(),
    seconds: 0,
    won: false,
    wonAt: null,
    commands: 0,
    failed: [],
    hints: 0,
    asks: 0,
    whys: 0,
    mistakes: [],
    resets: 0,
    left: false,
  };
  log.visits.push(v);
  return v;
}

/**
 * Reads new trace events into a visit: every typed or clicked command counts, and one that ended with
 * a non-zero exit code is kept (at once from `cmd.exec`, or at its `proc.exit` for a streaming one).
 * `running` holds commands still running (execId → line), across calls.
 */
export function readEvents(
  v: RoomVisit,
  events: readonly SimEvent[],
  running: Map<number, { device: string; line: string }>,
  now: Date,
): void {
  for (const e of events) {
    if (e.kind === "cmd.exec") {
      v.commands++;
      if (e.exitCode === null) running.set(e.execId, { device: e.device, line: e.line });
      else if (e.exitCode !== 0)
        v.failed.push({ at: now.toISOString(), device: e.device, line: e.line, exitCode: e.exitCode });
    } else if (e.kind === "proc.exit") {
      const r = running.get(e.execId);
      running.delete(e.execId);
      if (r && e.exitCode !== 0)
        v.failed.push({ at: now.toISOString(), device: r.device, line: r.line, exitCode: e.exitCode });
    } else if (e.kind === "world.reset") {
      v.resets++;
    }
  }
  touch(v, now);
}

/** Adds detectors not yet recorded for this visit (the room's list restarts on reset, so keep the union). */
export function readMistakes(v: RoomVisit, detectors: readonly string[]): void {
  for (const d of detectors) if (!v.mistakes.includes(d)) v.mistakes.push(d);
}

export function exportName(now: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `wirelight-playtest-${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}.json`;
}

/** How many different rooms the log has visited. */
export function roomCount(log: PlaytestLog): number {
  return new Set(log.visits.map((v) => v.roomId)).size;
}

export function playtestOn(): boolean {
  try {
    return new URLSearchParams(window.location.search).get("playtest") === "1";
  } catch {
    return false;
  }
}

function loadLog(): PlaytestLog {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const log = JSON.parse(raw) as PlaytestLog;
      if (log?.version === 1 && Array.isArray(log.visits)) {
        // A visit left open by a closed tab ends where it was last seen.
        const last = log.visits.at(-1);
        if (last) last.left = true;
        return log;
      }
    }
  } catch {
    // Storage blocked or the saved log unreadable: start a new one.
  }
  return emptyLog(new Date());
}

function saveLog(log: PlaytestLog): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(log));
  } catch {
    // Storage full or blocked: the log still lives in memory and exports from there.
  }
}

/** The log as the button shows it (a fresh object after each change, so the button re-renders). */
export const usePlaytest = create<{ log: PlaytestLog | null }>(() => ({ log: null }));

let installed: (() => void) | null = null;

/** Starts recording (once); returns a function that stops it. */
export function installPlaytest(): () => void {
  if (installed) return installed;
  const log = loadLog();
  let visit: RoomVisit | null = null;
  let seen = 0;
  let hintBase = 0;
  const running = new Map<number, { device: string; line: string }>();

  const commit = () => {
    saveLog(log);
    usePlaytest.setState({ log: { ...log, visits: [...log.visits] } });
  };

  const onSession = (s: ReturnType<typeof useSession.getState>, prev: ReturnType<typeof useSession.getState>) => {
    const now = new Date();
    let changed = false;
    if (s.roomId && s.roomId !== visit?.roomId) {
      visit = startVisit(log, s.roomId, now);
      seen = 0;
      running.clear();
      hintBase = useProgress.getState().hints[s.roomId] ?? 0;
      changed = true;
    }
    if (!visit) return;
    // Events are counted across the whole trace (`dropped` + kept), so a trimmed trace isn't re-read.
    const total = s.dropped + s.events.length;
    if (total < seen) seen = 0; // the trace was cleared (room reloaded)
    if (total > seen) {
      const fresh = s.events.slice(Math.max(0, s.events.length - (total - seen)));
      readEvents(visit, fresh, running, now);
      seen = total;
      changed = true;
    }
    if (s.status?.roomId === visit.roomId) {
      if (s.status.won && !visit.won) {
        visit.won = true;
        visit.wonAt = now.toISOString();
        changed = true;
      }
      const before = visit.mistakes.length;
      readMistakes(visit, s.status.detectors);
      if (visit.mistakes.length !== before) changed = true;
    }
    if (s.panel !== prev.panel) {
      if (s.panel?.kind === "ask" && prev.panel?.kind !== "ask") visit.asks++;
      if (s.panel?.kind === "keeper" && prev.panel?.kind !== "keeper") visit.whys++;
      changed = true;
    }
    if (changed) commit();
  };

  const onProgress = (p: ReturnType<typeof useProgress.getState>) => {
    if (!visit) return;
    const hints = Math.max(0, (p.hints[visit.roomId] ?? 0) - hintBase);
    if (hints !== visit.hints) {
      visit.hints = hints;
      touch(visit, new Date());
      commit();
    }
  };

  const offSession = useSession.subscribe(onSession);
  const offProgress = useProgress.subscribe(onProgress);
  const onHide = () => {
    if (visit) touch(visit, new Date());
    saveLog(log);
  };
  window.addEventListener("pagehide", onHide);
  onSession(useSession.getState(), useSession.getState());
  commit();

  installed = () => {
    offSession();
    offProgress();
    window.removeEventListener("pagehide", onHide);
    installed = null;
  };
  return installed;
}

/** Downloads the log as `wirelight-playtest-YYYY-MM-DD.json`. */
export function downloadPlaytest(log: PlaytestLog): void {
  const now = new Date();
  const last = log.visits.at(-1);
  const out = { ...log, exported: now.toISOString(), stoppedIn: last?.roomId ?? null, rooms: roomCount(log) };
  const url = URL.createObjectURL(new Blob([JSON.stringify(out, null, 2)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = exportName(now);
  a.click();
  URL.revokeObjectURL(url);
}
