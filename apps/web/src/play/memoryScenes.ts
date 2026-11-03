import type { memoryText } from "@wirelight/content";

// What each memory chapter shows (0066): a short picture built step by step on the room's map,
// following its words and the specs' "Shown" notes. Machines appear, cables are laid end to end, plates
// and lights are set by doors, messages move. A chapter that says "nothing between them" draws no
// cable. "What's next" chapters pull back to the world map, the next floor in mist. Times are in
// milliseconds from the chapter's start; reduced motion shows the finished picture, still.

export type Label = keyof typeof memoryText.scene;
/** A label and its values: `@door:dev:iface`, `@addr:dev`, `@mac:dev:iface` are read from the map. */
export type Tag = Label | [Label, Record<string, string>];

/** A message's way: machines in order (the cable between each pair), or a cable list from a machine. */
export type Way = string[] | { from: string; links: string[] };

export type Look = "dot" | "frame" | "broadcast" | "packet" | "framed" | "question" | "answer";
export type Glyph = "plate" | "light" | "switch" | "ledger" | "console" | "address" | "sign" | "registry" | "board";

export type Beat =
  | { at: number; show: string[] }
  | { at: number; lay: string[]; ms?: number; weavers?: boolean; drawn?: boolean }
  | {
      at: number;
      send: Way[];
      look?: Look;
      fate?: "in" | "fell";
      /** Milliseconds per cable. */
      hop?: number;
      /** Sent again every `repeat` ms. */
      repeat?: number;
      tag?: Tag;
      /** A tag per cable crossed (the countdown). */
      tags?: string[];
    }
  | { at: number; mark: string; iface?: string; glyph: Glyph; label?: Tag; text?: string; off?: boolean }
  | { at: number; ledger: string; line: string; brass?: boolean; fadeAt?: number }
  | { at: number; glow: string[] }
  | { at: number; dim: string[] }
  | { at: number; call: string; repeat?: number }
  | { at: number; tag: string; label: Tag; below?: boolean; lift?: number };

export type Scene = {
  /** Machines and cables never shown in this chapter. */
  hide?: string[];
  /** Machines drawn as something else. */
  looks?: Record<string, "junction" | "switch" | "router" | "house">;
  beats: Beat[];
  /** Show the world map instead, floors up to this one restored (the next one in mist). */
  world?: number;
};

const door = (dev: string, iface = "eth0") => `@door:${dev}:${iface}`;

export const scenes: Record<string, Scene> = {
  // -- The Prologue and Floor 1: the thread. --
  "P-BLD-01": {
    beats: [
      { at: 0, show: ["observatory", "kitchen"] },
      { at: 0, dim: ["observatory", "kitchen"] },
      { at: 600, lay: ["wire"], ms: 3200, weavers: true },
      { at: 4000, glow: ["observatory", "kitchen"] },
      { at: 4600, send: [["observatory", "kitchen"]], look: "dot", fate: "in", repeat: 3200 },
    ],
  },
  "F1-BLD-01": {
    beats: [
      { at: 400, mark: "observatory", glyph: "plate", label: "name" },
      { at: 1800, mark: "kitchen", glyph: "plate", label: "name" },
    ],
  },
  "F1-BLD-02": {
    beats: [
      { at: 0, lay: ["wire"], ms: 0 },
      { at: 0, mark: "observatory", glyph: "light", off: true },
      { at: 0, mark: "kitchen", glyph: "light", off: true },
      { at: 300, lay: ["wire"], ms: 1800 },
      { at: 2300, mark: "observatory", glyph: "light", label: "light" },
      { at: 2300, mark: "kitchen", glyph: "light" },
      { at: 3000, send: [["kitchen", "observatory"]], look: "dot", fate: "in", repeat: 3000 },
    ],
  },
  "F1-BLD-03": {
    beats: [
      { at: 400, mark: "observatory", glyph: "switch", label: "switch" },
      { at: 1400, mark: "kitchen", glyph: "switch", off: true, label: "resting" },
      { at: 2400, send: [["observatory", "kitchen"]], look: "dot", fate: "fell", repeat: 3400 },
    ],
  },
  "F1-FM-01": {
    hide: ["wire"],
    beats: [
      { at: 300, show: ["observatory"] },
      { at: 1200, show: ["kitchen"] },
      { at: 2000, call: "observatory", repeat: 3600 },
      { at: 3800, call: "kitchen", repeat: 3600 },
      { at: 2400, tag: "observatory|kitchen", label: "nothing" },
    ],
  },
  "F1-FM-02": {
    beats: [
      { at: 300, lay: ["wire"], ms: 2600, weavers: true },
      { at: 3100, mark: "observatory", glyph: "plate", label: "name" },
      { at: 3100, mark: "kitchen", glyph: "plate" },
      { at: 4200, mark: "observatory", glyph: "light", label: "light" },
      { at: 4200, mark: "kitchen", glyph: "light" },
      { at: 5300, mark: "kitchen", glyph: "switch", label: "switch" },
      { at: 5300, mark: "observatory", glyph: "switch" },
      { at: 6400, send: [["kitchen", "observatory"]], look: "dot", fate: "in", repeat: 3200 },
    ],
  },
  "F1-FM-04": {
    beats: [{ at: 400, send: [["observatory", "kitchen"]], look: "dot", fate: "in", repeat: 3600, tag: "forWhom" }],
  },

  // -- Floor 2: names on the wire. --
  "F2-BLD-01": {
    beats: [
      { at: 300, tag: "observatory", label: "message" },
      { at: 1600, mark: "kitchen", glyph: "plate" },
      {
        at: 1600,
        send: [["observatory", "kitchen"]],
        look: "frame",
        fate: "in",
        repeat: 3600,
        tag: ["to", { door: door("kitchen") }],
      },
    ],
  },
  "F2-BLD-02": {
    beats: [
      { at: 0, mark: "kitchen", glyph: "plate" },
      {
        at: 500,
        send: [["observatory", "kitchen"]],
        look: "frame",
        fate: "in",
        repeat: 6400,
        tag: ["to", { door: door("kitchen") }],
      },
      { at: 3700, send: [["observatory", "kitchen"]], look: "frame", fate: "fell", repeat: 6400, tag: "someoneElse" },
    ],
  },
  "F2-BLD-03": {
    beats: [
      {
        at: 400,
        send: [["observatory", "kitchen"]],
        look: "frame",
        fate: "in",
        tag: ["from", { door: door("observatory") }],
      },
      {
        at: 3000,
        send: [
          ["observatory", "kitchen"],
          ["observatory", "library"],
        ],
        look: "broadcast",
        fate: "in",
        repeat: 3600,
        tag: "everyone",
      },
    ],
  },
  "F2-BLD-04": {
    beats: [
      { at: 500, mark: "observatory", glyph: "console", label: "voice" },
      { at: 1500, glow: ["observatory"] },
    ],
  },
  "F2-FM-01": {
    beats: [
      { at: 0, show: ["observatory", "kitchen"] },
      { at: 1400, show: ["cellar"] },
      { at: 1400, lay: ["root"], ms: 1400 },
      {
        at: 3200,
        send: [["observatory", "kitchen"]],
        look: "dot",
        fate: "in",
        repeat: 4200,
        tag: ["meantFor", { who: "cellar" }],
      },
    ],
  },
  "F2-FM-02": {
    beats: [
      { at: 300, mark: "kitchen", glyph: "plate", label: "name" },
      { at: 300, mark: "cellar", glyph: "plate" },
      { at: 300, mark: "observatory", iface: "eth0", glyph: "plate" },
      { at: 300, mark: "observatory", iface: "eth1", glyph: "plate" },
      {
        at: 1500,
        send: [["observatory", "kitchen"]],
        look: "frame",
        fate: "in",
        tag: ["to", { door: door("kitchen") }],
      },
      {
        at: 4300,
        send: [
          ["observatory", "kitchen"],
          ["observatory", "cellar"],
        ],
        look: "broadcast",
        fate: "in",
        repeat: 5600,
        tag: "everyone",
      },
    ],
  },
  "F2-FM-04": { world: 2, beats: [] },
  "F2-BYE-01": { world: 2, beats: [] },

  // -- Floor 3: the switch. --
  "F3-BLD-01": {
    beats: [
      { at: 300, mark: "hall", glyph: "ledger", label: "ledger" },
      { at: 600, ledger: "hall", line: "observatory → eth0" },
      { at: 900, ledger: "hall", line: "library → eth2" },
      { at: 1200, ledger: "hall", line: "forge → eth3" },
      { at: 1800, send: [["observatory", "hall", "library"]], look: "frame", fate: "in", repeat: 6000, tag: "known" },
      { at: 4800, send: [["observatory", "hall", "forge"]], look: "frame", fate: "in", repeat: 6000 },
    ],
  },
  "F3-BLD-02": {
    beats: [
      { at: 200, mark: "hall", glyph: "ledger", label: "ledger" },
      { at: 600, send: [["pantry", "hall"]], look: "frame", fate: "in" },
      { at: 1700, ledger: "hall", line: "pantry → eth1" },
      { at: 2400, send: [["attic", "hall"]], look: "frame", fate: "in" },
      { at: 3500, ledger: "hall", line: "attic → eth2" },
      { at: 4200, send: [["gate", "hall"]], look: "frame", fate: "in" },
      { at: 5300, ledger: "hall", line: "gate → eth3" },
      { at: 6000, send: [["observatory", "hall"]], look: "frame", fate: "in" },
      { at: 7100, ledger: "hall", line: "observatory → eth0" },
    ],
  },
  "F3-BLD-03": {
    beats: [
      { at: 200, mark: "hall", glyph: "ledger", label: "ledger" },
      { at: 0, show: ["observatory", "hall"] },
      { at: 600, show: ["bakery"] },
      { at: 600, lay: ["hall-eth1"], ms: 900 },
      { at: 1600, send: [["bakery", "hall", "observatory"]], look: "broadcast", fate: "in", hop: 900 },
      { at: 2500, ledger: "hall", line: "bakery → eth1" },
      { at: 3800, show: ["larder"] },
      { at: 3800, lay: ["hall-eth2"], ms: 900 },
      {
        at: 4800,
        send: [
          ["larder", "hall", "observatory"],
          ["larder", "hall", "bakery"],
        ],
        look: "broadcast",
        fate: "in",
        hop: 900,
      },
      { at: 5700, ledger: "hall", line: "larder → eth2" },
      { at: 7000, show: ["chapel"] },
      { at: 7000, lay: ["hall-eth3"], ms: 900 },
      {
        at: 8000,
        send: [
          ["chapel", "hall", "observatory"],
          ["chapel", "hall", "bakery"],
          ["chapel", "hall", "larder"],
        ],
        look: "broadcast",
        fate: "in",
        hop: 900,
      },
      { at: 8900, ledger: "hall", line: "chapel → eth3" },
    ],
  },
  "F3-FM-01": {
    looks: { hall: "junction" },
    beats: [
      {
        at: 400,
        send: [
          ["observatory", "hall", "pantry"],
          ["observatory", "hall", "laundry"],
          ["observatory", "hall", "attic"],
        ],
        look: "frame",
        fate: "in",
        hop: 1500,
        repeat: 3600,
      },
      {
        at: 1600,
        send: [
          ["attic", "hall", "observatory"],
          ["attic", "hall", "pantry"],
          ["attic", "hall", "laundry"],
        ],
        look: "frame",
        fate: "in",
        hop: 1500,
        repeat: 3600,
      },
      {
        at: 2800,
        send: [
          ["pantry", "hall", "observatory"],
          ["pantry", "hall", "laundry"],
          ["pantry", "hall", "attic"],
        ],
        look: "frame",
        fate: "in",
        hop: 1500,
        repeat: 3600,
      },
    ],
  },
  "F3-FM-02": {
    beats: [
      { at: 300, mark: "hall", glyph: "ledger", label: "ledger" },
      { at: 500, ledger: "hall", line: "attic → eth3" },
      { at: 1000, send: [["observatory", "hall", "attic"]], look: "frame", fate: "in", hop: 1300, tag: "known" },
      { at: 2300, ledger: "hall", line: "observatory → eth0" },
      {
        at: 4800,
        send: [
          ["observatory", "hall", "pantry"],
          ["observatory", "hall", "laundry"],
          ["observatory", "hall", "attic"],
        ],
        look: "frame",
        fate: "fell",
        hop: 1300,
        tag: "unknown",
      },
    ],
  },
  "F3-FM-04": { world: 3, beats: [] },

  // -- Floor 4: memory and loops. --
  "F4-BLD-01": {
    beats: [
      { at: 0, mark: "hall", glyph: "ledger", label: "ledger" },
      { at: 0, ledger: "hall", line: "alcove → eth1", fadeAt: 1600 },
      { at: 0, ledger: "hall", line: "library → eth2", fadeAt: 3200 },
      { at: 0, ledger: "hall", line: "kitchen → eth3", brass: true },
      { at: 3800, tag: "hall", label: "brass", below: true },
    ],
  },
  "F4-BLD-02": {
    beats: [
      { at: 400, lay: ["span"], ms: 1600, weavers: true },
      { at: 2000, tag: "hall-b", label: "span" },
      {
        at: 2600,
        send: [
          ["observatory", "hall-a", "pantry"],
          ["observatory", "hall-a", "attic"],
          ["observatory", "hall-a", "hall-b", "forge"],
          ["observatory", "hall-a", "hall-b", "chapel"],
          ["observatory", "hall-a", "hall-b", "bakery"],
        ],
        look: "broadcast",
        fate: "in",
        hop: 1100,
        repeat: 5000,
        tag: "everyone",
      },
    ],
  },
  "F4-BLD-03": {
    beats: [
      { at: 0, lay: ["span-2"], ms: 0 },
      { at: 900, lay: ["span-2"], ms: 2600, drawn: true },
      { at: 3600, tag: "hall-a|hall-b", label: "secondSpan", lift: 62 },
    ],
  },
  "F4-FM-01": {
    beats: [
      { at: 0, mark: "hall-a", glyph: "ledger" },
      { at: 0, ledger: "hall-a", line: "pantry → eth1", fadeAt: 1400 },
      { at: 0, ledger: "hall-a", line: "attic → eth2", fadeAt: 1400 },
      { at: 1600, show: ["hall-b", "forge", "chapel", "laundry"] },
      { at: 1600, lay: ["span"], ms: 1400 },
      { at: 3600, lay: ["span-2"], ms: 1800, drawn: true },
      { at: 5000, tag: "hall-a|hall-b", label: "secondSpan", lift: 62 },
    ],
  },
  "F4-FM-02": {
    beats: [
      { at: 300, send: [["observatory", "hall-a"]], look: "broadcast", hop: 900 },
      {
        at: 1200,
        send: [{ from: "hall-a", links: ["span", "span-2", "span", "span-2", "span", "span-2"] }],
        look: "broadcast",
        hop: 900,
        repeat: 1800,
      },
      {
        at: 1200,
        send: [{ from: "hall-a", links: ["span-2", "span", "span-2", "span", "span-2", "span"] }],
        look: "broadcast",
        hop: 900,
        repeat: 1800,
      },
      {
        at: 2100,
        send: [
          ["hall-b", "forge"],
          ["hall-b", "chapel"],
          ["hall-b", "laundry"],
        ],
        look: "broadcast",
        fate: "in",
        hop: 900,
        repeat: 900,
      },
      {
        at: 2100,
        send: [
          ["hall-a", "pantry"],
          ["hall-a", "attic"],
          ["hall-a", "observatory"],
        ],
        look: "broadcast",
        fate: "in",
        hop: 900,
        repeat: 900,
      },
    ],
  },
  "F4-FM-04": { world: 4, beats: [] },
  "F4-BYE-01": { world: 4, beats: [] },

  // -- Floor 5: addresses. --
  "F5-FM-01": {
    beats: [
      { at: 0, mark: "kitchen", glyph: "plate", text: "02:00:00:00:00:07" },
      { at: 1600, mark: "kitchen", glyph: "plate", text: "02:00:00:00:00:17" },
      { at: 1600, tag: "kitchen", label: "replaced", below: true },
      {
        at: 2800,
        send: [["observatory", "square", "kitchen"]],
        look: "frame",
        fate: "fell",
        repeat: 4200,
        tag: ["oldName", { mac: "02:00:00:00:00:07" }],
      },
    ],
  },
  "F5-FM-02": {
    beats: [
      { at: 300, mark: "observatory", glyph: "address", label: "address" },
      { at: 900, mark: "kitchen", glyph: "address" },
      { at: 1300, mark: "library", glyph: "address" },
      { at: 1700, mark: "forge", glyph: "address" },
      {
        at: 2600,
        send: [["observatory", "square", "kitchen"]],
        look: "packet",
        fate: "in",
        repeat: 4000,
        tag: ["houseLetter", { ip: "@addr:kitchen" }],
      },
    ],
  },
  "F5-FM-04": { world: 5, beats: [] },

  // -- Floor 6: envelopes. --
  "F6-FM-01": {
    beats: [
      { at: 300, mark: "observatory", glyph: "address" },
      { at: 300, mark: "kitchen", glyph: "address" },
      {
        at: 900,
        send: [["observatory", "square"]],
        look: "packet",
        fate: "fell",
        hop: 1400,
        repeat: 4000,
        tag: ["houseLetter", { ip: "@addr:kitchen" }],
      },
      { at: 2300, tag: "observatory|square", label: "understood" },
    ],
  },
  "F6-FM-02": {
    beats: [
      { at: 0, mark: "observatory", glyph: "ledger", label: "ledger" },
      {
        at: 600,
        send: [
          ["observatory", "square", "kitchen"],
          ["observatory", "square", "library"],
          ["observatory", "square", "forge"],
          ["observatory", "square", "chapel"],
        ],
        look: "question",
        fate: "in",
        tag: ["question", { ip: "@addr:kitchen" }],
      },
      {
        at: 3000,
        send: [["kitchen", "square", "observatory"]],
        look: "answer",
        fate: "in",
        tag: ["answer", { ip: "@addr:kitchen", mac: "@mac:kitchen:eth0" }],
      },
      { at: 5300, ledger: "observatory", line: "10.0.1.7 → …:17" },
      {
        at: 6000,
        send: [["observatory", "square", "kitchen"]],
        look: "framed",
        fate: "in",
        repeat: 3600,
        tag: "folded",
      },
    ],
  },
  "F6-FM-04": { world: 6, beats: [] },

  // -- Floor 7: neighbourhoods. --
  "F7-FM-01": {
    beats: [
      { at: 0, show: ["observatory", "square", "kitchen"] },
      { at: 600, show: ["library"] },
      { at: 1100, show: ["forge"] },
      { at: 1600, show: ["chapel"] },
      { at: 2100, show: ["cellar"] },
      { at: 2600, show: ["registry"] },
      {
        at: 3000,
        send: [
          ["library", "square", "observatory"],
          ["library", "square", "kitchen"],
          ["library", "square", "forge"],
          ["library", "square", "chapel"],
          ["library", "square", "cellar"],
          ["library", "square", "registry"],
        ],
        look: "question",
        fate: "in",
        repeat: 2400,
      },
      {
        at: 4200,
        send: [
          ["cellar", "square", "observatory"],
          ["cellar", "square", "kitchen"],
          ["cellar", "square", "forge"],
          ["cellar", "square", "chapel"],
          ["cellar", "square", "library"],
          ["cellar", "square", "registry"],
        ],
        look: "question",
        fate: "in",
        repeat: 2400,
      },
      { at: 3000, tag: "observatory|square", label: "asking" },
    ],
  },
  "F7-FM-02": {
    beats: [
      { at: 300, mark: "observatory", glyph: "sign", label: "sign", text: "10.0.1.0/24" },
      { at: 1000, mark: "observatory", glyph: "address" },
      { at: 1200, mark: "kitchen", glyph: "address" },
      { at: 1400, mark: "library", glyph: "address" },
      { at: 1600, mark: "forge", glyph: "address" },
      { at: 1800, mark: "chapel", glyph: "address" },
      { at: 2000, mark: "cellar", glyph: "address" },
      { at: 3000, mark: "registry", glyph: "registry", label: "registry" },
      { at: 3000, glow: ["registry"] },
    ],
  },
  "F7-FM-04": { world: 7, beats: [] },
  "F7-BYE-01": { world: 7, beats: [] },

  // -- Floor 8: crossings. --
  "F8-FM-01": {
    beats: [
      { at: 0, show: ["observatory", "nave", "gallery", "cloister", "belfry", "tower"] },
      { at: 0, lay: ["nave-observatory", "cloister-gallery", "tower-belfry"], ms: 0 },
      { at: 600, tag: "nave", label: "island" },
      { at: 1200, send: [["observatory", "nave"]], look: "framed", fate: "fell", hop: 1300, repeat: 3600 },
      { at: 1800, send: [["gallery", "cloister"]], look: "framed", fate: "fell", hop: 1300, repeat: 3600 },
      { at: 2400, send: [["belfry", "tower"]], look: "framed", fate: "fell", hop: 1300, repeat: 3600 },
    ],
  },
  "F8-FM-02": {
    beats: [
      { at: 300, show: ["crossing"] },
      { at: 300, lay: ["nave-crossing", "cloister-crossing"], ms: 1300 },
      { at: 1700, show: ["arch"] },
      { at: 1700, lay: ["cloister-arch", "tower-arch"], ms: 1300 },
      { at: 3000, mark: "crossing", glyph: "board", label: "board" },
      { at: 3800, tag: "observatory", label: "giveIt" },
      {
        at: 4600,
        send: [["observatory", "nave", "crossing", "cloister", "gallery"]],
        look: "framed",
        fate: "in",
        hop: 1000,
        repeat: 6000,
      },
    ],
  },
  "F8-FM-04": { world: 8, beats: [] },

  // -- Floor 9: the journey. --
  "F9-FM-01": {
    beats: [
      {
        at: 400,
        send: [
          [
            "observatory",
            "nave",
            "crossing",
            "cloister",
            "arch",
            "tower",
            "spire",
            "tower",
            "arch",
            "tower",
            "spire",
            "tower",
            "arch",
          ],
        ],
        look: "framed",
        hop: 800,
        repeat: 10800,
        tag: "wandering",
      },
    ],
  },
  "F9-FM-02": {
    beats: [
      {
        at: 400,
        send: [["observatory", "nave", "crossing", "cloister", "arch", "tower", "spire", "window", "loft"]],
        look: "framed",
        fate: "in",
        hop: 900,
        tags: ["64", "64", "63", "63", "62", "62", "61", "61"],
      },
      {
        at: 8800,
        send: [["observatory", "nave", "crossing", "cloister", "arch"]],
        look: "framed",
        fate: "fell",
        hop: 900,
        tags: ["2", "2", "1", "1"],
      },
      { at: 12400, tag: "arch", label: "stops" },
      {
        at: 12800,
        send: [["arch", "cloister", "crossing", "nave", "observatory"]],
        look: "answer",
        fate: "in",
        hop: 800,
        tag: "writesHome",
      },
    ],
  },
  "F9-FM-04": { world: 9, beats: [] },
};
