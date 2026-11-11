import { HOUSE_LOCKED } from "./floor5";
import type { FloorText, RoomText } from "./types";

/** floors/floor-7.md, word for word. The Lantern Town's last floor. */

export const sameStreet: RoomText = {
  title: "Moved House",
  mission:
    "Your machine got a new address, and now nobody on the square can hear you. Find out why, and get kitchen to answer again.",
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
      note: "That's kitchen's address. Two machines can't share one: that's a duplicate address.",
      tried: "You took kitchen's address for your own house.",
    },
    "ping-the-lane": {
      note: "That address is on the lane, your machine's current street. Kitchen lives on the square's street.",
      tried: "You pinged houses on the lane, your old street, instead of the square's.",
    },
  },
  debrief: {
    // The spec's third new words, "network part / host part", are named here and folded into the prefix
    // length's meaning: a room teaches at most two terms (ROOM-07).
    happened:
      "Your address was on street `10.0.2`, and kitchen's on `10.0.1`. A machine talks directly only to its own street, its subnet. The `/24`, the prefix length, says the first three numbers are the street (the network part) and the last is the house (the host part). Moving onto the square's street put you next door to kitchen again.",
    terms: [
      {
        id: "subnet",
        term: "subnet",
        meaning:
          "a group of addresses that share the same network part, like `10.0.1.x`; machines on one subnet talk directly (a street in the town)",
      },
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
      a: "It only talks directly to machines on its own street. To reach any other street it has to be told a way there, and it hasn't been yet. That comes in the cathedral.",
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
    "You need an address on the square, but you don't know which ones are free. Get one from the registry, the machine that hands them out, then ping kitchen.",
  access: {
    kitchen: HOUSE_LOCKED,
    library: HOUSE_LOCKED,
    forge: HOUSE_LOCKED,
    chapel: HOUSE_LOCKED,
  },
  notes: ["Don't guess numbers. Ask the registry."],
  hints: [
    { text: "Don't guess a number: the registry on the square keeps track of which addresses are free." },
    { text: "`dhclient` followed by a door name asks the network for an address on that door." },
    {
      text: "DHCP: your machine calls out to everyone, the registry offers an address, your machine asks for it, and the registry confirms it as a lease.",
      codex: "registry",
    },
    { text: "Ask the registry for an address with the command that does it, then ping kitchen." },
    { text: "`dhclient -v eth0`, then `ping -c 3 10.0.1.7`." },
  ],
  detectors: {
    "guess-a-number": {
      note: "That one's taken. The registry knows which addresses are free: ask it.",
      tried: "You guessed a number that was already someone's house.",
    },
    "dhclient-wrong-door": {
      note: "Your machine has no door with that name. `ip link` lists the doors it has.",
      tried: "You asked for an address on a door this machine doesn't have.",
    },
  },
  debrief: {
    happened:
      "You didn't know which addresses were free, so you asked. Your machine broadcast a request, the registry (a DHCP server) offered an address, your machine asked for it, and the registry confirmed it. That's DHCP, and it's how almost every phone and laptop gets its address. The address is a lease: on loan for a while, and renewed before it runs out.",
    terms: [
      {
        id: "dhcp",
        term: "DHCP",
        meaning:
          "how a machine asks the network for an address instead of having one written in by hand; a DHCP server (here, the registry) hands it out",
      },
      {
        id: "lease",
        term: "lease",
        meaning: "an address on loan for a set time; the machine renews it before it runs out",
      },
    ],
  },
  questions: [
    {
      q: "How do I call out without an address?",
      a: "Your machine sends a broadcast from `0.0.0.0`, which means 'no address yet'. The registry expects that.",
    },
    {
      q: "Why only a loan?",
      a: "Machines leave. If addresses were given forever, the registry would run out of numbers.",
    },
    {
      q: "What else does the registry give?",
      a: "Often the way out of the subnet (the street) too, if there is one. You'll need that in the cathedral.",
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
      note: "Clearing the ARP table doesn't help: it learns again from whichever door answers. Find out why two doors answer.",
      tried: "You cleared your ARP table more than once.",
    },
    "change-my-address": {
      note: "Don't write your own address. Ask the DHCP server for one.",
      tried: "You wrote your own address instead of asking DHCP.",
    },
    "census-skip": {
      note: "Those four have already answered. Find the one that hasn't, and check which subnet it's on.",
      tried: "You called the four who'd already answered again.",
    },
  },
  debrief: {
    happened:
      "Cellar was on the wrong subnet, chapel was using an address from the DHCP server's pool (the addresses it lends out), and you had no address at all. You moved cellar onto the square's subnet, gave chapel its own address, and asked DHCP for yours. These are the everyday address problems on real networks: the wrong subnet, an address clash, and no address.",
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
  name: "Subnets and DHCP",
  memory: [
    {
      id: "F7-FM-01",
      title: "The problem",
      text: "Memory restored. The town kept growing. If every machine broadcast its questions to the whole town, nothing else would get through.",
    },
    {
      id: "F7-FM-02",
      title: "What they built",
      text: "So the town was split into subnets. A machine talks directly only to its own subnet, and the prefix length says where the subnet ends. And because machines kept guessing addresses and taking each other's, the registry started handing them out with DHCP.",
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
      text: "To reach another subnet, a machine needs help from a machine that stands on both. Those are further up, in the cathedral.",
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
