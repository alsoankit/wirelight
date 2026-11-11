import type { FloorText, RoomText } from "./types";

/** floors/floor-5.md, word for word. Region 3, the Lantern Town. */

/** Why a house's door is shut to the player on Floors 5–7. */
export const HOUSE_LOCKED = "You can't go in, but messages can still reach this machine over the network.";

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
    text: "Down in the halls, every door had a name: its MAC address. Up here, every house is a machine, and it has an address too.",
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
    "Kitchen's door was replaced, so its MAC address changed and your messages to the old one go nowhere. Find a way to reach kitchen that doesn't change with its door.",
  access: { kitchen: HOUSE_LOCKED, library: HOUSE_LOCKED, forge: HOUSE_LOCKED },
  notes: [],
  hints: [
    // Kitchen's house is locked in 5.1, so its own plate can't be read: the register is the place to look.
    { text: "Go to the square and read the register on its wall: it lists every house and its address." },
    { text: "The `ping` command sends a message to an address and waits for an answer." },
    {
      text: "A door has a name (its MAC address); a house has an address. The house address stays the same when the door changes.",
      codex: "ip-address",
    },
    {
      text: "Find kitchen's house address on the register, then ping that address from your machine.",
      codex: "ip-address",
    },
    { text: "From your machine: `ping -c 1 10.0.1.7`. Kitchen answers from its new door." },
  ],
  detectors: {
    "own-address": {
      note: "That's your own address. Kitchen's is on the register in the square.",
      tried: "You checked your own machine instead of the kitchen.",
    },
  },
  debrief: {
    happened:
      "Kitchen's door was replaced, so its MAC address changed, but its house address stayed the same. That address is its IP address: it says where a machine is on the network, and it stays put when the hardware changes. `ping` sent a question to that address, and kitchen answered.",
    terms: [
      {
        id: "ip-address",
        term: "IP address",
        meaning: "a machine's address on the network, like 10.0.1.7; it stays the same when the door changes",
      },
      {
        id: "ping",
        term: "ping",
        meaning: "a command that asks the machine at an address 'are you there?' and waits for the answer",
      },
    ],
  },
  questions: [
    {
      q: "Why not use door names?",
      a: "A MAC address belongs to the door, and doors get replaced. The house address belongs to the machine's place on the network, so it stays.",
    },
    {
      q: "Can I use the new MAC address instead?",
      a: "You could. And next time they change the door, you'd be stuck again.",
    },
    {
      q: "What's that little question flying out first?",
      a: "Your machine asking everyone on the street which door has address 10.0.1.7, so it knows which MAC address to put on the frame. Floor 6 explains it.",
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
    { text: "Read the plate on your door: its address line is empty." },
    { text: "Look at the note on the table in your room." },
    {
      text: "A machine needs its own IP address before it can send or receive: every reply needs an address to come back to.",
      codex: "ip-address",
    },
    { text: "Write the address from the note in your plate's address slot, then ping kitchen." },
    {
      text: "Click the address slot and write `10.0.1.5/24` (`ip addr add 10.0.1.5/24 dev eth0`), then `ping -c 3 10.0.1.7`.",
    },
  ],
  detectors: {
    "ping-no-address": {
      // The same words as F5-NOTE-01 (the robot's line after this first, failed ping).
      note: "A machine with no IP address can't send messages, or get answers.",
      tried:
        "You pinged before your machine had an address: `Network is unreachable`. Nothing could leave without a return address.",
    },
    "wrong-house": {
      note: "That answer came from your own machine: the address you wrote is kitchen's. Yours is on the note.",
      tried: "You gave your machine kitchen's address, so your pings answered themselves.",
    },
    "no-prefix": {
      note: "Copy the whole address from the note, the `/24` too.",
      tried: "You wrote the address without its `/24`, so your machine had no way to reach anyone on the street.",
    },
    "ping-forever": {
      note: "It'll keep asking until you stop it. Ctrl+C.",
      tried: "You let a ping run on and on; Ctrl+C or `-c` stops it.",
    },
  },
  debrief: {
    happened:
      "Your machine had no IP address, so it couldn't send anything or get a reply. Once it had one, you pinged kitchen: ping sent an echo request to 10.0.1.7, and kitchen sent an echo reply back to your address. Every message carries the sender's address, so the answer knows where to go.",
    terms: [
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
      a: "The answer would have nowhere to go. Every message carries a return address: yours.",
    },
    {
      q: "What's the `/24` on the note?",
      a: "Part of how an address is written. Floor 7 explains it. For now, copy it as it is.",
    },
    { q: "Why does ping go on forever?", a: "It keeps going until you stop it. Ctrl+C tells it you've seen enough." },
  ],
  fieldGuide: ["Command book: `ping`", "Your address"],
  voice: [
    { id: "F5-NOTE-01", speaker: "You", text: "A machine with no IP address can't send messages, or get answers." },
  ],
};

export const rollCall: RoomText = {
  title: "Roll Call",
  mission:
    "A list on the wall names five houses. Ping each one and find out which answer: a house's lamp lights when it replies.",
  access: {
    kitchen: HOUSE_LOCKED,
    library: HOUSE_LOCKED,
    forge: HOUSE_LOCKED,
    chapel: HOUSE_LOCKED,
    bakery: HOUSE_LOCKED,
  },
  notes: ["Roll: 10.0.1.7, 10.0.1.10, 10.0.1.12, 10.0.1.16, 10.0.1.18."],
  hints: [
    { text: "Your machine has lost its address again. Read your plate first." },
    { text: "The slot's broken. Use the terminal instead." },
    { text: "`ip addr add` gives a door an address, the same as the slot did.", codex: "address-slot" },
    { text: "Give yourself `10.0.1.5/24`, then ping each house on the roll." },
    {
      text: "`ip addr add 10.0.1.5/24 dev eth0`, then `ping -c 1` each of 10.0.1.7, .10, .12 and .18. (.16 is dark.)",
    },
  ],
  detectors: {
    "empty-house": {
      note: "No machine answers at that address. A list says who should be there, not who is switched on.",
      tried: "You kept pinging bakery's house, but its door is switched off, so nothing can answer.",
    },
  },
  debrief: {
    happened:
      "You gave your machine its address with a terminal command, then pinged every house on the list. Four answered. Bakery stayed silent because its door was switched off: no reply means nothing answered at that address, and on real networks that can be a machine that's off or a break on the way.",
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
    { text: "Two things are wrong: one in your house, and one in the square, on the way to kitchen." },
    { text: "Read your own plate. Then walk into the square and read the plate on each of its doors." },
    {
      text: "A machine needs an IP address, and every door on the way must be switched on (link up).",
      codex: "ip-address",
    },
    { text: "Give yourself an address, switch the square's door to kitchen on, then ping kitchen's address." },
    {
      text: "In your house: `ip addr add 10.0.1.5/24 dev eth0`. In the square: `ip link set eth1 up`. Then ping `10.0.1.7`. Kitchen replies.",
    },
  ],
  detectors: {
    "wrong-house": {
      note: "That answer came from your own machine: the address you wrote is kitchen's.",
      tried: "You gave your machine kitchen's address.",
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
      note: "That machine has no door with that name. `ip link` lists the doors it has.",
      tried: "You named a door that machine doesn't have.",
    },
    "ping-only-library": {
      note: "Library answers, so your address is fine. Look at what's between you and kitchen: the square.",
      tried: "Library answered, and you changed your own address again, but yours was already fine.",
    },
  },
  debrief: {
    happened:
      "Your machine had no IP address, and the square's door to kitchen was switched off. Either one alone keeps kitchen silent. When nothing answers, check your own end first, then each step on the way.",
    terms: [],
  },
  voice: [
    {
      id: "F5-BOSS-01",
      speaker: "You",
      text: "The busiest street in town, and nothing answers. More than one thing is broken.",
    },
  ],
};

export const floor5: FloorText = {
  name: "IP Addresses",
  memory: [
    {
      id: "F5-FM-01",
      title: "The problem",
      text: "Memory restored. The halls knew every door by its MAC address. But doors were replaced and machines moved, and each time, messages went nowhere.",
    },
    {
      id: "F5-FM-02",
      title: "What they built",
      text: "So every machine got an IP address: an address for its place on the network, not for its door. Send to the IP address, and it doesn't matter which door the machine has this year.",
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
      text: "But a frame still needs a MAC address. How does a machine find the door that goes with an IP address? A small question goes out first. That's next.",
      shown: "the world map: Floor 6 appears in mist",
    },
  ],
  journal: {
    page: 5,
    title: "Addresses",
    where: "on the square's notice board in 5.2",
    text: "Log 3,318. Everyone up here has two addresses: a MAC address on the door, and an IP address for the house. I kept writing to old doors and wondered why nothing arrived.",
  },
};
