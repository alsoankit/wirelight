/** Regions and floors (floors/overview.md). Floor 0 is the Prologue. First release: Regions 1–4 (0035). */
export interface RegionInfo {
  n: number;
  name: string;
  speaker: string;
}

export interface FloorInfo {
  n: number;
  region: number;
  name: string;
  /** Planned but not built yet: listed in the menu as closed. */
  planned?: boolean;
}

export const regions: Record<number, RegionInfo> = {
  1: { n: 1, name: "The Overgrown Halls", speaker: "you" },
  2: { n: 2, name: "The Sorting Works", speaker: "you" },
  3: { n: 3, name: "The Lantern Town", speaker: "you" },
  4: { n: 4, name: "The Cathedral of Crossings", speaker: "you" },
};

export const floors: Record<number, FloorInfo> = {
  0: { n: 0, region: 1, name: "Prologue" },
  1: { n: 1, region: 1, name: "The Wire" },
  2: { n: 2, region: 1, name: "Names on the Wire" },
  3: { n: 3, region: 2, name: "The Switch", planned: true },
  4: { n: 4, region: 2, name: "Memory and Loops", planned: true },
  5: { n: 5, region: 3, name: "Addresses", planned: true },
  6: { n: 6, region: 3, name: "Envelopes", planned: true },
  7: { n: 7, region: 3, name: "Neighbourhoods", planned: true },
  8: { n: 8, region: 4, name: "Crossings", planned: true },
  9: { n: 9, region: 4, name: "The Journey", planned: true },
};

export const lore = {
  intro:
    "You are a repair robot. You've just switched back on in a palace whose machines stopped talking to each other years ago. Getting them talking again is your job.",
};
