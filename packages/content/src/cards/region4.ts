import type { Card } from "./types";

/** Region 4's discovery cards (floors/floor-8.md, floor-9.md), word for word. */
export const REGION_4_CARDS: Card[] = [
  // Floor 8 · Crossings
  {
    id: "router",
    floor: 8,
    title: "Router",
    text: "A machine with doors on more than one street, that passes packets from one street to another.",
  },
  {
    id: "navigator",
    floor: 8,
    title: "Navigator",
    text: "The router's keeper. It reads where each packet is going and sends it the right way.",
  },
  {
    id: "routing-board",
    floor: 8,
    title: "Routing board",
    text: "Every machine's list of which way to send packets, street by street.",
  },
  {
    id: "default-gateway",
    floor: 8,
    title: "Default gateway",
    text: "Where your house sends anything that isn't for its own street.",
  },
  {
    id: "specific-route",
    floor: 8,
    title: "Specific route",
    text: "A line for one particular street: 'for the bell tower, go via arch'.",
  },
  {
    id: "capture",
    floor: 8,
    title: "Capture",
    text: "The Slate can listen at a door and catch everything that passes, labelled, until you stop.",
  },
  {
    id: "lectern",
    floor: 8,
    title: "Lectern",
    text: "Where packets wait for the navigator to decide which way they go.",
  },
  // Floor 9 · The Journey
  {
    id: "tracer",
    floor: 9,
    title: "Tracer",
    text: "Tag one packet and the Slate catches it at every door it passes.",
  },
  {
    id: "compare",
    floor: 9,
    title: "Compare",
    text: "Two catches side by side. What changed glows.",
  },
  {
    id: "hop",
    floor: 9,
    title: "Hop",
    text: "One step of the journey: from one machine to the next across one street.",
  },
  {
    id: "ttl",
    floor: 9,
    title: "TTL",
    text: "A countdown on every packet. Each router takes one off; at zero, the packet dies.",
  },
  {
    id: "icmp-note",
    floor: 9,
    title: "ICMP note",
    text: "A small message the network writes back: 'unreachable', 'time exceeded', or a ping's echo.",
  },
  {
    id: "routing-loop",
    floor: 9,
    title: "Routing loop",
    text: "Two routers each think the other knows the way. The packet goes back and forth until its countdown runs out.",
  },
];
