import { HOUSE_LOCKED } from "./floor5";
import type { FloorText, RoomText } from "./types";

/** floors/floor-7.md, word for word. The Lantern Town's last floor. */

export const sameStreet: RoomText = {
  title: "Moved House",
  mission: "Your machine got a new address, and now nobody on the square can hear you. Find out why.",
  access: { kitchen: HOUSE_LOCKED, library: HOUSE_LOCKED, forge: HOUSE_LOCKED },
  notes: [],
  hints: [
    // Kitchen's house is locked, so its address is read on the register in the square.
    { text: "Compare your plate with kitchen's address on the square's register." },
    { text: "The street sign on the square says which street this is." },
    {
      text: "An address is a street and a house number; the `/24` says the street is the first three numbers. Only same-street houses talk directly.",
      codex: "street-sign",
    },
    { text: "Move your house onto the square's street with a free house number." },
    {
      text: "Remove `10.0.2.5/24` and add `10.0.1.5/24` (the slot, or `ip addr del` then `ip addr add`), then ping kitchen.",
    },
  ],
  detectors: {
    "right-street-wrong-prefix": {
      note: "Your house number is fine. Look at the `/` part on everyone else's plate.",
      tried: "You moved onto the right street, but with a different `/` from everyone else's.",
    },
    "take-lanterns-house": {
      note: "That's kitchen's house. Two houses, one address doesn't work.",
      tried: "You took kitchen's address for your own house.",
    },
    "ping-the-lane": {
      note: "That's your own street, the lane. Who lives on kitchen's?",
      tried: "You pinged houses on the lane, your old street, instead of the square's.",
    },
  },
  debrief: {
    // The spec's third new words, "network part / host part", are named here and folded into the prefix
    // length's meaning: a room teaches at most two terms (ROOM-07).
    happened:
      "Your address was on street `10.0.2`, and kitchen's on `10.0.1`. A machine talks directly only to its own street, its subnet. The `/24`, the prefix length, says the first three numbers are the street (the network part) and the last is the house (the host part). Moving onto the square's street put you next door to kitchen again.",
    terms: [
      { id: "subnet", term: "subnet", meaning: "a street: all the addresses that share the same network part" },
      {
        id: "prefix-length",
        term: "prefix length",
        meaning:
          "the `/24`: how much of the address is the street (the network part); the rest is the house number (the host part)",
      },
    ],
  },
  questions: [
    {
      q: "Why doesn't my machine even try?",
      a: "It only talks directly to its own street. For anywhere else, it needs directions. And it has none, yet.",
    },
    {
      q: "What does `/24` count?",
      a: "Bits, for the long answer. The short answer: three numbers of street, one of house.",
    },
    {
      q: "Could I be on two streets?",
      a: "A door can have more than one address. One is enough here.",
    },
  ],
  fieldGuide: ["Streets and house numbers", "Plates (street colours)"],
  voice: [
    {
      id: "F7-SIGN-01",
      speaker: "You",
      text: "So that's what the `/24` means. An address is four numbers. The `/24` says the first three are the street, and the last one is the house. So `10.0.1.7/24` is on street `10.0.1` at house number 7. I'm on `10.0.2`: a different street altogether.",
    },
  ],
};

export const askForAnAddress: RoomText = {
  title: "Ask for an Address",
  mission:
    "You need an address on the square, but you don't know which ones are free. The town has a registry that hands them out.",
  access: {
    kitchen: HOUSE_LOCKED,
    library: HOUSE_LOCKED,
    forge: HOUSE_LOCKED,
    chapel: HOUSE_LOCKED,
  },
  notes: ["Don't guess numbers. Ask the registry."],
  hints: [
    { text: "Don't guess. Someone keeps track of free addresses." },
    { text: "The registry hands them out, if you ask." },
    { text: "DHCP: call out, get an offer, accept it, get a lease.", codex: "registry" },
    { text: "Ask the registry for an address with the command that does it, then ping kitchen." },
    { text: "`dhclient -v eth0`, then `ping -c 3 10.0.1.7`." },
  ],
  detectors: {
    "guess-a-number": {
      note: "That one's taken. The DHCP server (the registry) knows which are free.",
      tried: "You guessed a number that was already someone's house.",
    },
    "dhclient-wrong-door": {
      note: "Doors have names. Which name does yours have? Ask the machine for its doors.",
      tried: "You asked for an address on a door this machine doesn't have.",
    },
  },
  debrief: {
    happened:
      "You didn't know which addresses were free, so you asked. Your machine sent a broadcast, the registry offered an address, you asked for it, and it confirmed: that's DHCP. The address is a lease, a loan that gets renewed.",
    terms: [
      { id: "dhcp", term: "DHCP", meaning: "asking the network for an address instead of writing one yourself" },
      { id: "lease", term: "lease", meaning: "an address on loan for a while" },
    ],
  },
  questions: [
    {
      q: "How do I call out without an address?",
      a: "You send a broadcast, from no address at all. The registry is used to it.",
    },
    {
      q: "Why only a loan?",
      a: "Machines leave. If addresses were given forever, the registry would run out of numbers.",
    },
    {
      q: "What else does the registry give?",
      a: "Directions out of the subnet (the street), if there are any. You'll want those further up.",
    },
  ],
  fieldGuide: ["Getting an address", "Command book: `dhclient`"],
};

export const census: RoomText = {
  title: "The Census",
  mission: "Every machine on the census board must answer your ping. Some don't, and you have no address yet.",
  access: { kitchen: HOUSE_LOCKED, library: HOUSE_LOCKED, forge: HOUSE_LOCKED, registry: HOUSE_LOCKED },
  notes: ["Census: kitchen .7 · library .12 · forge .10 · chapel .18 · cellar .14"],
  hints: [
    { text: "Ping each house on the census. Note who's silent." },
    { text: "Compare the subnet colour (the street colour) on every plate, and on the census board." },
    {
      text: "Same subnet to talk directly; one IP address per machine; ask the DHCP server (the registry) when you need one.",
      codex: "street-sign",
    },
    {
      text: "Get yourself an address from DHCP, bring the machine on the wrong subnet onto the square's subnet, and make sure nobody's using an address that isn't theirs.",
    },
    {
      text: "In chapel's room: `ip addr del 10.0.1.100/24 dev eth0`, then `ip addr add 10.0.1.18/24 dev eth0`. In cellar's room: `ip addr del 10.0.2.14/24 dev eth0`, then `ip addr add 10.0.1.14/24 dev eth0`. In your house: `dhclient -v eth0`. Then ping all five.",
    },
  ],
  detectors: {
    "guess-a-number": {
      note: "That one's taken. The DHCP server (the registry) knows which are free.",
      tried: "You guessed an address for your house instead of asking DHCP.",
    },
    "right-street-wrong-prefix": {
      note: "The house number is fine. Look at the `/` part on everyone else's plate.",
      tried: "You gave an address a different `/` from everyone else's.",
    },
    "flush-and-hope": {
      note: "The ARP table learns it again, and maybe wrong again. Why are two doors answering?",
      tried: "You cleared your ARP table more than once.",
    },
    "change-my-address": {
      note: "Don't write your own address. Ask the DHCP server for one.",
      tried: "You wrote your own address instead of asking DHCP.",
    },
    "census-skip": {
      note: "Four on the census board. Who's missing, and which subnet are they on?",
      tried: "You called the four who'd already answered again.",
    },
  },
  debrief: {
    happened:
      "Cellar was on the wrong subnet, chapel was using an address that belonged to the DHCP server's pool, and you had no address at all. You moved cellar onto the square's subnet, gave chapel its own address, and asked DHCP for yours. Every house answered the census.",
    terms: [],
  },
  voice: [
    {
      id: "F7-BOSS-01",
      speaker: "You",
      text: "A census: every machine on the square has to answer.",
    },
  ],
};

export const floor7: FloorText = {
  name: "Neighbourhoods",
  memory: [
    {
      id: "F7-FM-01",
      title: "The problem",
      text: "Memory restored. The town kept growing. If every house asked the whole town every question, nothing else would get through.",
    },
    {
      id: "F7-FM-02",
      title: "What they built",
      text: "So the town was split into streets. A house talks directly only to its own street, and its street sign says where the street ends. And because machines kept guessing numbers and taking each other's, the registry opened.",
    },
    {
      id: "F7-FM-03",
      title: "Ride-along",
      text: "Same street: straight there.",
      shown:
        "the camera rides the observatory's DHCP DISCOVER, a call from nobody to everyone, across the square to the registry; rides the OFFER back; then a ping to kitchen: the street part of its address glows amber and matches; it goes straight there",
    },
    {
      id: "F7-FM-04",
      title: "What's next",
      text: "Other streets need someone at the crossing who knows the way. The crossings are further up, in the cathedral.",
      shown: "the world map: the Lantern Town fully lit; the Cathedral of Crossings rising through mist above",
    },
  ],
  journal: {
    page: 7,
    title: "The registry",
    where: "in the registry's room in 7.2",
    text: "Log 3,351. Spent an hour guessing addresses before I remembered the registry. It gives you one. On loan. Power at 22%.",
  },
  farewell: {
    id: "F7-BYE-01",
    speaker: "You",
    text: "Every lamp in town is lit. On to the cathedral.",
  },
};
