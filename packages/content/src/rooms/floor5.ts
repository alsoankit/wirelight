import type { FloorText, RoomText } from "./types";

/** floors/floor-5.md, word for word. Region 3, the Lantern Town. */

/** Why a house's door is shut to the player on Floors 5–7. */
export const HOUSE_LOCKED = "Locked. Nobody here has opened the door in years, but they still answer letters.";

/** Arriving in Region 3 (R3-ARRIVE-01…03). */
export const REGION_3_ARRIVAL = [
  {
    id: "R3-ARRIVE-01",
    speaker: "You",
    text: "Streets, houses and lamps. The Lantern Town.",
  },
  {
    id: "R3-ARRIVE-02",
    speaker: "You",
    text: "Down in the halls, every door had a name. Up here, every house has an address too.",
  },
  {
    id: "R3-ARRIVE-03",
    speaker: "You",
    text: "Names and addresses: why would anything need both? I'll find out.",
  },
];

export const whereNotWho: RoomText = {
  title: "A New Door",
  mission:
    "Kitchen's door was replaced, so its door name changed. Your repeated frame still goes to the old name, and nothing arrives.",
  access: { kitchen: HOUSE_LOCKED, library: HOUSE_LOCKED, forge: HOUSE_LOCKED },
  notes: [],
  hints: [
    { text: "Kitchen isn't gone. Its door is new." },
    // Kitchen's house is locked in 5.1, so its own plate can't be read: the register is the place to look.
    { text: "Read the register on the square's wall: it lists every house's address." },
    {
      text: "A door has a name; a house has an address. The address stays when the door changes.",
      codex: "ip-address",
    },
    { text: "Use kitchen's house address instead of its MAC address for your repeated frame." },
    { text: "Use `10.0.1.7` as the destination. Kitchen's reply carries the key." },
  ],
  detectors: {
    "chase-the-new-name": {
      note: "It answered. What stays the same when a door changes?",
      tried: "You used kitchen's new MAC address. It answered, but the next new door would lose it again.",
    },
    "own-address": {
      note: "That's your own house.",
      tried: "You used your own house address.",
    },
  },
  debrief: {
    happened:
      "Kitchen's door changed, so its MAC address changed. Its house address didn't: that's its IP address. Use the address to find kitchen, whichever door it has.",
    terms: [{ id: "ip-address", term: "IP address", meaning: "where a machine is: its house address, like 10.0.1.7" }],
  },
  questions: [
    {
      q: "Why not just use names?",
      a: "Names belong to doors, and doors get replaced. A house stays where it is.",
    },
    {
      q: "Can I use the new MAC address instead?",
      a: "You could. And next time they change the door, you'd be stuck again.",
    },
    {
      q: "What's that little question flying out first?",
      a: "There's a way: asking the neighbours. You'll find it soon.",
    },
  ],
  fieldGuide: ["Houses and addresses", "Plates (now with addresses)"],
};

export const placeToLive: RoomText = {
  title: "No Address",
  mission:
    "Your machine has no address yet, so it can't reach anyone in town. Give it one, then check that kitchen answers.",
  access: { kitchen: HOUSE_LOCKED, library: HOUSE_LOCKED, forge: HOUSE_LOCKED },
  notes: ["Our house: 10.0.1.5/24."],
  hints: [
    { text: "Your plate is missing something." },
    { text: "Look at the note on the table in your room." },
    { text: "A house needs its own address before it can send or receive.", codex: "ip-address" },
    { text: "Write the address from the note in your plate's address slot, then ping kitchen." },
    {
      text: "Click the address slot and write `10.0.1.5/24` (`ip addr add 10.0.1.5/24 dev eth0`), then `ping -c 3 10.0.1.7`.",
    },
  ],
  detectors: {
    "ping-no-address": {
      // The same words as F5-NOTE-01 (the robot's line after this first, failed ping).
      note: "A house with no address can't send messages, or get answers.",
      tried:
        "You pinged before your house had an address: `Network is unreachable`. Nothing could leave without a return address.",
    },
    "wrong-house": {
      note: "That answer came from your own house. Whose address did you write?",
      tried: "You gave your house kitchen's address, so your pings answered themselves.",
    },
    "no-prefix": {
      note: "Copy the whole address from the note, the `/24` too.",
      tried: "You wrote the address without its `/24`, and the street went out of reach.",
    },
    "ping-forever": {
      note: "It'll keep asking until you stop it. Ctrl+C.",
      tried: "You let a ping run on and on; Ctrl+C or `-c` stops it.",
    },
  },
  debrief: {
    happened:
      "Your door had no address, so you couldn't send anything to a house, or hear back. With an address of your own, you pinged kitchen: an echo request out, an echo reply back.",
    terms: [
      { id: "ping", term: "ping", meaning: "asking a house 'are you there?'" },
      {
        id: "echo-request-reply",
        term: "echo request / reply",
        meaning: "the question a ping sends, and the answer that comes back",
      },
    ],
  },
  questions: [
    {
      q: "Why can't I ping without an address?",
      a: "Who would the answer go back to? Every message needs a return address.",
    },
    {
      q: "What's the `/24` on the note?",
      a: "Part of how an address is written. The street sign explains it, further into town. For now, just copy it.",
    },
    { q: "Why does ping go on forever?", a: "It keeps going until you stop it. Ctrl+C tells it you've seen enough." },
  ],
  fieldGuide: ["Command book: `ping`", "Your address"],
  voice: [{ id: "F5-NOTE-01", speaker: "You", text: "A house with no address can't send messages, or get answers." }],
};

export const rollCall: RoomText = {
  title: "Roll Call",
  mission: "A list on the wall names five houses. Check which of them answer you: each one's lamp lights when it does.",
  access: {
    kitchen: HOUSE_LOCKED,
    library: HOUSE_LOCKED,
    forge: HOUSE_LOCKED,
    chapel: HOUSE_LOCKED,
    bakery: HOUSE_LOCKED,
  },
  notes: ["Roll: 10.0.1.7, 10.0.1.10, 10.0.1.12, 10.0.1.16, 10.0.1.18."],
  hints: [
    { text: "Before you can call on anyone, you need your own address back." },
    { text: "The slot's broken. Use the terminal instead." },
    { text: "`ip addr add` gives a door an address, the same as the slot did.", codex: "address-slot" },
    { text: "Give yourself `10.0.1.5/24`, then ping each house on the roll." },
    {
      text: "`ip addr add 10.0.1.5/24 dev eth0`, then `ping -c 1` each of 10.0.1.7, .10, .12 and .18. (.16 is dark.)",
    },
  ],
  detectors: {
    "empty-house": {
      note: "Nobody's home at that one. Was every house on the roll going to answer?",
      tried: "You kept pinging bakery's house, but its door is dark.",
    },
  },
  debrief: {
    happened:
      "You gave your house its address with a terminal command, then called the roll. Four houses answered. One stayed dark, and that's an answer too.",
    terms: [],
  },
  fieldGuide: ["Command book: `ip addr`"],
};

export const quietStreet: RoomText = {
  title: "The Quiet Street",
  mission: "Nothing on this street answers you, and more than one thing is wrong. Get kitchen to answer.",
  access: { kitchen: HOUSE_LOCKED, library: HOUSE_LOCKED, forge: HOUSE_LOCKED },
  notes: [],
  hints: [
    { text: "Three things are wrong: one in your house, one in the square, and one in the route to kitchen." },
    { text: "Ping a few houses. Who answers, and who doesn't?" },
    {
      text: "A house needs an address; a door needs to be on; a letter needs the right address.",
      codex: "ip-address",
    },
    { text: "Give yourself an address, switch the square's door to kitchen on, then ping kitchen's address." },
    {
      text: "In your house: `ip addr add 10.0.1.5/24 dev eth0`. In the square: `ip link set eth1 up`. Then ping `10.0.1.7`. Kitchen's reply carries the key.",
    },
  ],
  detectors: {
    "wrong-house": {
      note: "That answer came from your own house. Whose address did you write?",
      tried: "You gave your house kitchen's address.",
    },
    "no-prefix": {
      note: "Copy the whole address, the `/24` too.",
      tried: "You wrote your address without its `/24`.",
    },
    "ping-forever": {
      note: "It'll keep asking until you stop it. Ctrl+C.",
      tried: "You let a ping run on and on.",
    },
    "wrong-door-name": {
      note: "Doors have names. Which name does it have? Ask the machine for its doors.",
      tried: "You named a door that machine doesn't have.",
    },
    "ping-only-library": {
      note: "Library hears you. So your address is fine. What's between you and kitchen?",
      tried: "Library answered, and you changed your own address again, but yours was already fine.",
    },
  },
  debrief: {
    happened:
      "Your house had no address, the square's door to kitchen was off, and the route to kitchen's house address was missing. Each one alone would keep the street quiet.",
    terms: [],
  },
  voice: [
    {
      id: "F5-BOSS-01",
      speaker: "You",
      text: "The busiest street in town, and nothing answers. Several things must be broken.",
    },
  ],
};

export const floor5: FloorText = {
  name: "Addresses",
  memory: [
    {
      id: "F5-FM-01",
      title: "The problem",
      text: "Memory restored. The halls knew every door by name. But doors were replaced, and machines moved, and every time, messages went astray.",
    },
    {
      id: "F5-FM-02",
      title: "What they built",
      text: "So every house got an address. Not the door's name, the house's. Write to the house, and it doesn't matter which door it has this year.",
    },
    {
      id: "F5-FM-03",
      title: "Ride-along",
      text: "A question, an answer. 'Are you there?' 'I'm here.'",
      shown:
        "the camera rides a ping from the observatory: the address written on it glows, 10.0.1.7; it crosses the square and arrives at kitchen's house; an echo comes back",
    },
    {
      id: "F5-FM-04",
      title: "What's next",
      text: "But how does a message with a house address find the right door? A little question goes out first. That part is still missing.",
      shown: "the world map: Floor 6 appears in mist",
    },
  ],
  journal: {
    page: 5,
    title: "Addresses",
    where: "on the square's notice board in 5.2",
    text: "Log 3,318. Everyone up here has two names: one on the door, one on the house. I kept writing to doors and wondered why nothing arrived.",
  },
};
