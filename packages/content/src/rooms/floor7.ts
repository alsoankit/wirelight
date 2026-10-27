import { HOUSE_LOCKED } from "./floor5";
import type { FloorText, RoomText } from "./types";

/** floors/floor-7.md, word for word. The Lantern Town's last floor. */

export const sameStreet: RoomText = {
  title: "Same Street?",
  mission: "You've moved house again. Now nobody on the square can hear you.",
  access: { lantern: HOUSE_LOCKED, quill: HOUSE_LOCKED, anvil: HOUSE_LOCKED },
  notes: [],
  hints: [
    // Lantern's house is locked, so its address is read on the register in the square.
    { text: "Compare your plate with lantern's address on the square's register." },
    { text: "The street sign on the square says which street this is." },
    {
      text: "An address is a street and a house number; the `/24` says the street is the first three numbers. Only same-street houses talk directly.",
      codex: "street-sign",
    },
    { text: "Move your house onto the square's street with a free house number." },
    {
      text: "Remove `10.0.2.5/24` and add `10.0.1.5/24` (the slot, or `ip addr del` then `ip addr add`), then ping lantern.",
    },
  ],
  detectors: {
    "right-street-wrong-prefix": {
      note: "Your house number is fine. Look at the `/` part on everyone else's plate.",
      tried: "You moved onto the right street, but with a different `/` from everyone else's.",
    },
    "take-lanterns-house": {
      note: "That's lantern's house. Two houses, one address: remember?",
      tried: "You took lantern's address for your own house.",
    },
    "ping-the-lane": {
      note: "That's your own street, the lane. Who lives on lantern's?",
      tried: "You pinged houses on the lane, your old street, instead of the square's.",
    },
  },
  debrief: {
    // The spec's third new words, "network part / host part", are named here and folded into the prefix
    // length's meaning: a room teaches at most two terms (ROOM-07).
    happened:
      "Your address was on street `10.0.2`, and lantern's on `10.0.1`. A machine talks directly only to its own street, its subnet. The `/24`, the prefix length, says the first three numbers are the street (the network part) and the last is the house (the host part). Moving onto the square's street put you next door to lantern again.",
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
  guardian: [
    {
      q: "Why doesn't my machine even try?",
      a: "It only talks directly to its own street. For anywhere else, it needs directions. And it has none, yet.",
    },
    {
      q: "What does `/24` count?",
      a: "Bits, if you want the long answer. There's a little room in town that tells it. The short answer: three numbers of street, one of house.",
    },
    {
      q: "Could I be on two streets?",
      a: "A door can have more than one address, yes. But let's keep you in one house for now.",
    },
  ],
  fieldGuide: ["Streets and house numbers", "Plates (street colours)"],
  voice: [
    {
      id: "F7-SIGN-01",
      speaker: "Lamplighter",
      text: "Here's what that `/24` means, love. An address is four numbers. The `/24` says the first three of them are the street, and the last one is the house. So `10.0.1.7/24` lives on street `10.0.1` at house number 7. You're on `10.0.2`: a different street altogether.",
    },
  ],
};

export const askForAnAddress: RoomText = {
  title: "Ask for an Address",
  mission: "Every house on the square is taken, and you don't know which numbers are free. The town keeps a registry.",
  access: {
    lantern: HOUSE_LOCKED,
    quill: HOUSE_LOCKED,
    anvil: HOUSE_LOCKED,
    bell: HOUSE_LOCKED,
  },
  notes: ["Don't guess numbers, love. Ask the registry."],
  hints: [
    { text: "Don't guess. Someone keeps track of free addresses." },
    { text: "The registry hands them out, if you ask." },
    { text: "DHCP: call out, get an offer, accept it, get a lease.", codex: "registry" },
    { text: "Ask the registry for an address with the command that does it, then ping lantern." },
    { text: "`dhclient -v eth0`, then `ping -c 3 10.0.1.7`." },
  ],
  detectors: {
    "guess-a-number": {
      note: "That one's lived in. The registry knows which are free.",
      tried: "You guessed a number that was already someone's house.",
    },
    "dhclient-wrong-door": {
      note: "Doors have names. Which name does yours have? Ask the machine for its doors.",
      tried: "You asked for an address on a door this machine doesn't have.",
    },
  },
  debrief: {
    happened:
      "You didn't know which addresses were free, so you asked. Your machine called out to everyone, the registry offered an address, you asked for it, and it confirmed: that's DHCP. The address is a lease, a loan that gets renewed.",
    terms: [
      { id: "dhcp", term: "DHCP", meaning: "asking the network for an address instead of writing one yourself" },
      { id: "lease", term: "lease", meaning: "an address on loan for a while" },
    ],
  },
  guardian: [
    {
      q: "How do I call out without an address?",
      a: "You call to everyone, from nobody. The registry is used to it.",
    },
    {
      q: "Why only a loan?",
      a: "Folk move away. If addresses were given forever, the registry would run out of numbers.",
    },
    {
      q: "What else does the registry give?",
      a: "Directions out of the street, if there are any. You'll want those, further up.",
    },
  ],
  fieldGuide: ["Getting an address", "Command book: `dhclient`"],
};

export const census: RoomText = {
  title: "The Census",
  mission: "The Lamplighter is taking the census, the first in a hundred years. Every house on the square must answer.",
  access: { lantern: HOUSE_LOCKED, quill: HOUSE_LOCKED, anvil: HOUSE_LOCKED, registry: HOUSE_LOCKED },
  notes: ["Census: lantern .7 · quill .12 · anvil .10 · bell .18 · moth .14"],
  hints: [
    { text: "Ping each house on the census. Note who's silent." },
    { text: "Compare the street colour on every plate, and on the census board." },
    {
      text: "Same street to talk; one address per house; ask the registry when you need one.",
      codex: "street-sign",
    },
    {
      text: "Get yourself an address the right way, bring the house on the wrong street onto the square, and make sure nobody's borrowing a number that isn't theirs.",
    },
    {
      text: "In bell's room: `ip addr del 10.0.1.100/24 dev eth0`, then `ip addr add 10.0.1.18/24 dev eth0`. In moth's room: `ip addr del 10.0.2.14/24 dev eth0`, then `ip addr add 10.0.1.14/24 dev eth0`. In your house: `dhclient -v eth0`. Then ping all five.",
    },
  ],
  detectors: {
    "guess-a-number": {
      note: "That one's lived in. The registry knows which are free.",
      tried: "You guessed a number for your house instead of asking the registry.",
    },
    "right-street-wrong-prefix": {
      note: "The house number is fine. Look at the `/` part on everyone else's plate.",
      tried: "You gave an address a different `/` from everyone else's.",
    },
    "flush-and-hope": {
      note: "The ledger learns it again, and maybe wrong again. Why are two doors answering?",
      tried: "You cleared your ledger more than once.",
    },
    "change-my-address": {
      note: "Don't write your own number. Ask the registry for one.",
      tried: "You wrote your own address instead of asking the registry.",
    },
    "census-skip": {
      note: "Four on the board. Who's missing, and which street are they on?",
      tried: "You called the four who'd already answered again.",
    },
  },
  debrief: {
    happened:
      "Moth lived on the wrong street, bell was using a number that belonged to the registry, and you had no address at all. You moved moth onto the square, gave bell its own house, and asked the registry for yours. Every house answered the census.",
    terms: [],
  },
  voice: [
    {
      id: "F7-BOSS-01",
      speaker: "Lamplighter",
      text: "A census! Every house, every number, every lamp. I haven't had a full count since… well. Since before I forgot how to count them.",
    },
  ],
};

export const floor7: FloorText = {
  name: "Neighbourhoods",
  memory: [
    {
      id: "F7-FM-01",
      title: "The problem",
      text: "The town grew and grew. If every house asked the whole town every question, nobody would ever sleep.",
    },
    {
      id: "F7-FM-02",
      title: "What they built",
      text: "So we built streets. A house talks directly only to its own street, and the street sign says where the street ends. And because people kept guessing numbers and taking each other's, we opened the registry.",
    },
    {
      id: "F7-FM-03",
      title: "Ride-along",
      text: "Same street: straight there.",
      shown:
        "the camera rides the observatory's DHCP DISCOVER, a call from nobody to everyone, across the square to the registry; rides the OFFER back; then a ping to lantern: the street part of its address glows amber and matches; it goes straight there",
    },
    {
      id: "F7-FM-04",
      title: "What's next",
      text: "But other streets… to reach them you need someone at the crossing who knows the way. The cathedral folk above built the crossings. A stone warden watches them, I think. Mind you, she doesn't talk much.",
      shown: "the world map: the Lantern Town fully lit; the Cathedral of Crossings rising through mist above",
    },
  ],
  journal: {
    page: 7,
    title: "The registry",
    where: "in the registry's room in 7.2",
    text: "Spent an hour guessing addresses before the Lamplighter took pity on me and pointed at the registry. It just… gives you one. Politely. On loan.",
  },
  farewell: {
    id: "F7-BYE-01",
    speaker: "Lamplighter",
    text: "Look at them all. Every lamp. Off you go, love. And come back and visit an old woman sometime.",
  },
};
