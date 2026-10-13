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

type Progress = {
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
