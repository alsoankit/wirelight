import type { Path } from "@wirelight/rooms";
import { del, get, set } from "idb-keyval";
import { useEffect, useState } from "react";
import { create } from "zustand";
import { createJSONStorage, persist, type StateStorage } from "zustand/middleware";

// The player's progress, saved in this browser (ONB-22, idb-keyval): what's been seen (the gifts,
// the path, the tour), rooms cleared, keys, discovery cards, memories, notes and hints. If storage
// isn't available the game simply plays without saving; it's never blocked.

export type RoomRecord = {
  /** Won with no detector firing and no hint opened. */
  firstTry: boolean;
  hintsOpened: number;
  revealed: boolean;
  key: string;
};

/** Settings (UI-17), kept with progress so they come back with the player. */
export type Settings = {
  volumes: { master: number; music: number; effects: number; voices: number };
  /** Voices: On, or Text only (0047). */
  voices: "on" | "text";
  /** Error subtitles (UI-08): by floor (on through Floor 7), or always on / off. */
  subtitles: "auto" | "on" | "off";
  /** Text size, 1 = 100% (UI-22: up to 150%). */
  textSize: 1 | 1.25 | 1.5;
  /** Reduced motion (UI-23): follow the system, or on / off. */
  motion: "system" | "reduced" | "full";
  /** Graphics quality (0020): automatic, or a tier chosen by hand. */
  quality: "auto" | "high" | "medium" | "low" | "simple";
};

export const DEFAULT_SETTINGS: Settings = {
  volumes: { master: 0.8, music: 0.6, effects: 0.7, voices: 0.9 },
  voices: "on",
  subtitles: "auto",
  textSize: 1,
  motion: "system",
  quality: "auto",
};

type Progress = {
  settings: Settings;
  setSettings(patch: Partial<Settings>): void;
  sightGiven: boolean;
  path: Path | null;
  tourDone: boolean;
  voiceGiven: boolean;
  /** The room to come back to (ONB-20). */
  current: string | null;
  cleared: Record<string, RoomRecord>;
  keys: string[];
  cardsSeen: string[];
  memoriesSeen: string[];
  journalPages: number[];
  floorMemoriesSeen: number[];
  /** Hints opened per room (kept through Reset, HELP-03). */
  hints: Record<string, number>;

  giveSight(): void;
  choosePath(path: Path): void;
  finishTour(): void;
  giveVoice(): void;
  setCurrent(roomId: string): void;
  clear(roomId: string, record: RoomRecord): void;
  seeCard(id: string): void;
  seeMemory(id: string): void;
  findJournalPage(page: number): void;
  seeFloorMemory(floor: number): void;
  openHint(roomId: string): void;
  /** Settings: Replay intro (ONB-21). */
  replayIntro(): void;
};

const idb: StateStorage = {
  getItem: async (name) => (await get<string>(name).catch(() => undefined)) ?? null,
  setItem: async (name, value) => {
    await set(name, value).catch(() => undefined);
  },
  removeItem: async (name) => {
    await del(name).catch(() => undefined);
  },
};

const add = <T>(list: T[], x: T): T[] => (list.includes(x) ? list : [...list, x]);

export const useProgress = create<Progress>()(
  persist(
    (setState) => ({
      settings: DEFAULT_SETTINGS,
      setSettings: (patch) => setState((s) => ({ settings: { ...s.settings, ...patch } })),
      sightGiven: false,
      path: null,
      tourDone: false,
      voiceGiven: false,
      current: null,
      cleared: {},
      keys: [],
      cardsSeen: [],
      memoriesSeen: [],
      journalPages: [],
      floorMemoriesSeen: [],
      hints: {},

      giveSight: () => setState({ sightGiven: true }),
      choosePath: (path) => setState({ path }),
      finishTour: () => setState({ tourDone: true }),
      giveVoice: () => setState({ voiceGiven: true }),
      setCurrent: (current) => setState({ current }),
      clear: (roomId, record) =>
        setState((s) => ({
          // A replay keeps the first record (first try stays first try).
          cleared: s.cleared[roomId] ? s.cleared : { ...s.cleared, [roomId]: record },
          keys: add(s.keys, record.key),
        })),
      seeCard: (id) => setState((s) => ({ cardsSeen: add(s.cardsSeen, id) })),
      seeMemory: (id) => setState((s) => ({ memoriesSeen: add(s.memoriesSeen, id) })),
      findJournalPage: (page) => setState((s) => ({ journalPages: add(s.journalPages, page) })),
      seeFloorMemory: (floor) => setState((s) => ({ floorMemoriesSeen: add(s.floorMemoriesSeen, floor) })),
      openHint: (roomId) =>
        setState((s) => ({ hints: { ...s.hints, [roomId]: Math.min(5, (s.hints[roomId] ?? 0) + 1) } })),
      replayIntro: () => setState({ sightGiven: false, tourDone: false }),
    }),
    { name: "wirelight-progress", version: 1, storage: createJSONStorage(() => idb) },
  ),
);

/** True once the saved progress has been read (or found missing), so first-visit flows don't flash. */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(() => useProgress.persist.hasHydrated());
  useEffect(() => {
    const stop = useProgress.persist.onFinishHydration(() => setHydrated(true));
    // It may have finished between the first render and now.
    if (useProgress.persist.hasHydrated()) setHydrated(true);
    return stop;
  }, []);
  return hydrated;
}
