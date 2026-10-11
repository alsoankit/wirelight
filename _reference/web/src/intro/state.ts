/**
 * The way in (DESIGN_NOTES D20): title → (roll up) → short tour → the room. The Seer's gift is shown
 * once ever, the first time the player is in the Observatory, and is never skipped.
 * What the player has seen is kept in localStorage (per browser); blocked storage just means seeing it again.
 */
import { create } from "zustand";

export type IntroStage = "title" | "rolling" | "tour" | "done";

/**
 * The descent (D23): the title, a band of earth and rock, and the room move up as one strip,
 * so the player sinks through the ground into the dungeon.
 */
export const DESCENT = {
  /** Height of the earth-and-rock band between the title and the room, in vh. */
  band: 55,
  slow: 1.8,
  /** Skip intro still descends, just quicker. */
  fast: 0.8,
  ease: [0.65, 0, 0.35, 1] as const,
};

interface Seen {
  tourDismissed: boolean;
  seerSeen: boolean;
}

const KEY = "wirelight.intro.v1";

function load(): Seen {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { tourDismissed: false, seerSeen: false, ...(JSON.parse(raw) as Partial<Seen>) };
  } catch {
    // Storage blocked: treat as a first visit.
  }
  return { tourDismissed: false, seerSeen: false };
}

function save(s: Seen) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Not fatal.
  }
}

interface IntroState extends Seen {
  stage: IntroStage;
  /** This descent came from Skip intro: quicker, and no tour after it. */
  skipping: boolean;
  /** Start the roll-up from the title. */
  explore(): void;
  /** The roll-up finished: show the tour unless it was dismissed for good. */
  rolled(): void;
  /** Skip intro: straight into the room (the Seer's gift still comes if it's never been seen). */
  skip(): void;
  finishTour(dontShowAgain: boolean): void;
  acceptSight(): void;
}

export const useIntro = create<IntroState>((set, get) => ({
  ...load(),
  // A link straight to a room skips the title screen.
  stage: /^\/floor\//.test(window.location.pathname) ? "done" : "title",
  skipping: false,
  explore: () => set({ stage: "rolling", skipping: false }),
  rolled: () => set({ stage: get().skipping || get().tourDismissed ? "done" : "tour" }),
  skip: () => set(get().stage === "title" ? { stage: "rolling", skipping: true } : { stage: "done" }),
  finishTour(dontShowAgain) {
    const next = { tourDismissed: get().tourDismissed || dontShowAgain, seerSeen: get().seerSeen };
    save(next);
    set({ ...next, stage: "done" });
  },
  acceptSight() {
    const next = { tourDismissed: get().tourDismissed, seerSeen: true };
    save(next);
    set(next);
  },
}));
