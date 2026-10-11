/**
 * Local saving (FR-PROG-01, NFR-07): progress and a snapshot of the room in progress, in IndexedDB
 * via idb-keyval. Saves are debounced (≤ 2 s). Storage can be missing (private windows, blocked
 * site data): then the game simply doesn't remember, and play is never blocked.
 */
import type { WorldState } from "@wirelight/sim";
import { createStore, del, entries, set, type UseStore } from "idb-keyval";
import { EMPTY_PROGRESS, loadProgress, type Progress } from "./progress";

export interface RoomSave {
  snapshot: WorldState;
  jar: { id: number; bytes: number[]; where: string; caughtAt: number }[];
  savedAt: number;
}

let db: UseStore | null = null;
const rooms = new Map<string, RoomSave>();

function store(): UseStore | null {
  if (db) return db;
  try {
    db = createStore("wirelight", "save");
  } catch {
    db = null;
  }
  return db;
}

/** Read everything once at start-up. Falls back to the Phase 1 localStorage progress. */
export async function loadSaves(): Promise<Progress> {
  const s = store();
  if (!s) return loadProgress();
  try {
    const all = await entries<string, unknown>(s);
    let progress: Progress | null = null;
    for (const [k, v] of all) {
      if (k === "progress") progress = { ...EMPTY_PROGRESS, ...(v as Partial<Progress>) };
      else if (k.startsWith("room:")) rooms.set(k.slice(5), v as RoomSave);
    }
    return progress ?? loadProgress();
  } catch {
    return loadProgress();
  }
}

export function savedRoom(id: string): RoomSave | undefined {
  return rooms.get(id);
}

export function writeProgress(p: Progress): void {
  const s = store();
  if (!s) return;
  set("progress", p, s).catch(() => {});
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();

/** Debounced: the room is saved at most every 1.5 s while things change. */
export function saveRoomSoon(id: string, make: () => RoomSave): void {
  clearTimeout(timers.get(id));
  timers.set(
    id,
    setTimeout(() => {
      const v = make();
      rooms.set(id, v);
      const s = store();
      if (s) set(`room:${id}`, v, s).catch(() => {});
    }, 1500),
  );
}

/** A won room starts fresh next time. */
export function forgetRoom(id: string): void {
  clearTimeout(timers.get(id));
  rooms.delete(id);
  const s = store();
  if (s) del(`room:${id}`, s).catch(() => {});
}
