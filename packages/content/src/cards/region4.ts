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
    title: "Crossing keeper",
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
    text: "The Scanner can listen at a door and catch everything that passes, labelled, until you stop.",
  },
  {
    // 8.4's hint 3 links it (floors/floor-8.md: "Notebook: Return path"); the spec gives it no card text,
    // so it's written from the debrief's meaning, and found through the hint rather than on arrival.
    id: "return-path",
    floor: 8,
    title: "Return path",
    text: "The way the answers come back. A reply needs a route home, just as the question needed a route there.",
  },
  {
    id: "lectern",
    floor: 8,
    title: "Keeper's desk",
    text: "Where packets wait for the keeper to decide which way they go.",
  },
  // Floor 9 · The Journey
  {
    id: "tracer",
    floor: 9,
    title: "Tracer",
    text: "Tag one packet and the Scanner catches it at every door it passes.",
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
  {
    id: "home-box",
    floor: 9,
    title: "Home box",
    text: "The box on a shelf at home: a switch for your devices, a registry that hands out addresses, and a router to the outside, all in one.",
  },
];
