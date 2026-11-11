import type { Card } from "./types";

/** Region 2's discovery cards (floors/floor-3.md, floor-4.md), word for word. */
export const REGION_2_CARDS: Card[] = [
  {
    id: "switch",
    floor: 3,
    title: "Switch",
    text: "A machine with many doors that passes frames between them. It learns where everyone is.",
  },
  {
    id: "mac-board",
    floor: 3,
    title: "MAC board",
    text: "The switch's memory: which MAC address is behind which door.",
  },
  {
    id: "keepers-desk",
    floor: 3,
    title: "Keeper's desk",
    text: "Where each frame waits while the keeper (the switch's sorting logic) decides which door it leaves by.",
  },
  {
    id: "clouded-board",
    floor: 3,
    title: "Clouded board",
    text: "Its glass has gone milky. The switch still remembers; you'll have to ask it.",
  },
  {
    id: "pinned-memory",
    floor: 4,
    title: "Pinned memory",
    text: "A line someone wrote into the switch's memory by hand. It never fades, even when it's wrong.",
  },
  { id: "span", floor: 4, title: "Span", text: "A cable between two switches. Frames cross it like any other cable." },
  {
    id: "loop",
    floor: 4,
    title: "Loop",
    text: "A circle of cables between switches. A broadcast sent into it goes round and round and never stops.",
  },
  {
    id: "peacekeeper",
    floor: 4,
    title: "Peacekeeper",
    text: "Switches that talk to each other and hold one door of every circle shut, until it's needed. Its real name is the spanning tree.",
  },
];
