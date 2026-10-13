import type { Card } from "./types";

/** Region 3's discovery cards (floors/floor-5.md, floor-6.md, floor-7.md), word for word. */
export const REGION_3_CARDS: Card[] = [
  {
    id: "ip-address",
    floor: 5,
    title: "IP address",
    text: "Where a machine lives: its house address in the town, like 10.0.1.7.",
  },
  { id: "register", floor: 5, title: "The register", text: "The Lamplighter's list of every house on the street." },
  {
    id: "address-slot",
    floor: 5,
    title: "Address slot",
    text: "The line on your plate where your house address is written.",
  },
  { id: "echo", floor: 5, title: "Echo", text: "A ping is a question; the echo is the answer." },
  {
    id: "slate",
    floor: 6,
    title: "The Slate",
    text: "The Knight's tablet. It keeps every message you catch, labelled, and opens them one layer at a time.",
  },
  {
    id: "packet",
    floor: 6,
    title: "Packet",
    text: "The letter inside the frame. It carries house addresses: who wrote it, and who it's for.",
  },
  {
    id: "neighbour-ledger",
    floor: 6,
    title: "Neighbour ledger",
    text: "Your house's list of which door name goes with which house address on your street.",
  },
  {
    id: "arp-question",
    floor: 6,
    title: "ARP question",
    text: "'Who has this address?', asked of everyone on the street. Only the owner answers.",
  },
  {
    id: "two-answers",
    floor: 6,
    title: "Two answers",
    text: "Two houses answered the same question. Only one of them can be right.",
  },
  { id: "street-sign", floor: 7, title: "Street sign", text: "Shows which street this is: `10.0.1.0/24`." },
  {
    id: "prefix",
    floor: 7,
    title: "Prefix",
    text: "The `/24` after an address. It says how much of the address is the street.",
  },
  { id: "registry", floor: 7, title: "Registry", text: "The machine that hands out addresses on this street." },
  { id: "lease", floor: 7, title: "Lease", text: "An address on loan, for a while. It's renewed before it runs out." },
];
