import type { Card } from "./types";

/** Region 3's discovery cards (floors/floor-5.md, floor-6.md, floor-7.md), word for word. */
export const REGION_3_CARDS: Card[] = [
  {
    id: "ip-address",
    floor: 5,
    title: "IP address",
    text: "A machine's address on the network, like 10.0.1.7. In the town, it's the house's address.",
  },
  { id: "register", floor: 5, title: "The register", text: "The list of every house on the street, and its address." },
  {
    id: "address-slot",
    floor: 5,
    title: "Address slot",
    text: "The line on your plate where your house address is written.",
  },
  { id: "echo", floor: 5, title: "Echo", text: "A ping is a question; the echo is the answer." },
  {
    id: "scanner",
    floor: 6,
    title: "The Scanner",
    text: "Your scanner. It keeps every message you catch, labelled, and opens them one layer at a time.",
  },
  {
    id: "packet",
    floor: 6,
    title: "Packet",
    text: "The message inside the frame. It carries IP addresses: who sent it, and who it's for.",
  },
  {
    id: "neighbour-ledger",
    floor: 6,
    title: "Neighbour ledger",
    text: "Your machine's list of which MAC address goes with which IP address on your street (`ip neigh`).",
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
  {
    id: "thirty-two-bits",
    floor: 7,
    title: "Thirty-two bits",
    text: "An address is 32 bits: four numbers of 8. The `/` counts how many bits, from the left, are the street; the rest are the house.",
  },
];
