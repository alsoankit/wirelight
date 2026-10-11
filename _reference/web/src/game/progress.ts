/**
 * Progress: rooms cleared and keys found. Phase 1 keeps it in localStorage; Phase 2 moves it to
 * IndexedDB with mid-room snapshots (FR-PROG-01). Storage can be missing or throw; play never depends on it.
 */
import { writeProgress } from "./save";

export interface Progress {
  cleared: string[];
  keyring: { room: string; word: string }[];
  /** Discovery cards seen, which fill the Codex (FR-LEARN-05). */
  seenCards: string[];
  /** Per room: how many hints were opened, and whether the reveal was used (FR-HINT-09). */
  rooms: Record<string, { hintsUsed: number; usedReveal: boolean }>;
}

export const EMPTY_PROGRESS: Progress = { cleared: [], keyring: [], seenCards: [], rooms: {} };

const KEY = "wirelight.progress.v1";

export function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as Partial<Progress>;
      return { ...EMPTY_PROGRESS, ...p };
    }
  } catch {
    // Private windows and blocked storage: start fresh.
  }
  return { ...EMPTY_PROGRESS };
}

export function saveProgress(p: Progress): void {
  // IndexedDB is the store from Phase 2 (save.ts); localStorage stays as a fallback copy.
  writeProgress(p);
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Not fatal; this session just won't be remembered.
  }
}
