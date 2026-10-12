export interface FloorInfo {
  n: number;
  name: string;
  material: string;
  /** Planned but not built yet: listed in the menu as closed. */
  planned?: boolean;
}

export const floors: Record<number, FloorInfo> = {
  [-1]: { n: -1, name: "Prologue", material: "copper and candlelight" },
  0: { n: 0, name: "The Wire", material: "copper and candlelight" },
  1: { n: 1, name: "The Switch", material: "grey slate and torch amber", planned: true },
  2: { n: 2, name: "Addresses", material: "mossy green stone", planned: true },
  3: { n: 3, name: "The Router", material: "sandstone and brass", planned: true },
};

export const lore = {
  intro:
    "Long ago a Knight walked these halls and kept them lit. Then the light went out, one corridor at a time. The Knight left notes for whoever came next. That's you.",
};
