import type { FloorText, RoomText } from "./types";

/** floors/floor-5.md, word for word. Region 3, the Lantern Town; Guardian: the Lamplighter. */

/** Why a house's door is shut to the player on Floors 5–7. */
export const HOUSE_LOCKED = "Locked. Nobody here has opened the door in years, but they still answer letters.";

/** The Lamplighter greets the player as they arrive in Region 3 (R3-ARRIVE-01…03). */
export const REGION_3_ARRIVAL = [
  {
    id: "R3-ARRIVE-01",
    speaker: "Lamplighter",
    text: "Well now. A new face in the Lantern Town. Come in out of the dark, love.",
  },
  {
    id: "R3-ARRIVE-02",
    speaker: "Lamplighter",
    text: "The owl tells me you're good with doors and names. Down here, every house had an address too. I used to know them all by heart.",
  },
  {
    id: "R3-ARRIVE-03",
    speaker: "Lamplighter",
    text: "These days I can't remember why we needed both. Names *and* addresses. Help an old woman remember?",
  },
];

export const whereNotWho: RoomText = {
  title: "Where, Not Who",
  mission: "Lantern got a new door last winter. Your messenger still writes to its old one.",
  access: { lantern: HOUSE_LOCKED, quill: HOUSE_LOCKED, anvil: HOUSE_LOCKED },
  notes: [],
  hints: [
    { text: "Lantern isn't gone. Its door is new." },
    { text: "Look at lantern's plate, and the register on the square's wall." },
    {
      text: "A door has a name; a house has an address. The address stays when the door changes.",
      codex: "ip-address",
    },
    { text: "Give the messenger lantern's house address instead of a door name." },
    {
      // The spec says "The messenger's ping reaches lantern"; the word arrives in 5.2, so it waits until then.
      text: "Set the card to `10.0.1.7`. The messenger's letter reaches lantern, and its reply carries the key.",
    },
  ],
  detectors: {
    "chase-the-new-name": {
      note: "It answered. What stays the same when a door changes?",
      tried: "You wrote lantern's new door name on the card. It answered, but the next new door would lose it again.",
    },
    "own-address": {
      note: "That's your own house.",
      tried: "You put your own house address on the card.",
    },
  },
  debrief: {
    happened:
      "Lantern's door changed, so its door name changed, and the messenger's letters went nowhere. Its house address didn't. Writing to the address instead of the name found lantern, wherever its door came from.",
    terms: [{ id: "ip-address", term: "IP address", meaning: "where a machine is: its house address, like 10.0.1.7" }],
  },
  guardian: [
    {
      q: "Why not just use names?",
      a: "Names belong to doors, love, and doors get changed. A house stays where it is.",
    },
    {
      q: "Can I use the new door name instead?",
      a: "You could. And next time they change the door, you'd be stuck again.",
    },
    {
      q: "What's that little question flying out first?",
      a: "I'll remember. Something about… asking the neighbours. Give me time.",
    },
  ],
  fieldGuide: ["Houses and addresses", "Plates (now with addresses)"],
};

export const placeToLive: RoomText = {
  title: "A Place to Live",
  mission: "You've moved into the Lantern Town, but your house has no address yet. Then see if lantern is home.",
  access: { lantern: HOUSE_LOCKED, quill: HOUSE_LOCKED, anvil: HOUSE_LOCKED },
  notes: ["Our house: 10.0.1.5/24."],
  hints: [
    { text: "Your plate is missing something." },
    { text: "Look at the note on the Observatory table." },
    { text: "A house needs its own address before it can send or receive.", codex: "ip-address" },
    { text: "Write the address from the note in your plate's address slot, then ping lantern." },
    {
      text: "Click the address slot and write `10.0.1.5/24` (`ip addr add 10.0.1.5/24 dev eth0`), then `ping -c 3 10.0.1.7`.",
    },
  ],
  detectors: {
    "wrong-house": {
      note: "That answer came from your own house. Whose address did you write?",
      tried: "You gave your house lantern's address, so your pings answered themselves.",
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
      "Your door had no address, so you couldn't send anything to a house, or hear back. With an address of your own, you pinged lantern: an echo request out, an echo reply back.",
    terms: [
      { id: "ping", term: "ping", meaning: "asking a house 'are you there?'" },
      {
        id: "echo-request-reply",
        term: "echo request / reply",
        meaning: "the question a ping sends, and the answer that comes back",
      },
    ],
  },
  guardian: [
    {
      q: "Why can't I ping without an address?",
      a: "Who would the answer go back to, love? Every letter needs a return address.",
    },
    {
      q: "What's the `/24` on the note?",
      a: "Part of how an address is written. The street sign explains it, further into town. For now, just copy it.",
    },
    { q: "Why does ping go on forever?", a: "It's patient. Like me. Ctrl+C tells it you've heard enough." },
  ],
  fieldGuide: ["Command book: `ping`", "Your address"],
  voice: [{ id: "F5-NOTE-01", speaker: "Knight", text: "A house with no address can't send letters, or get answers." }],
};

export const rollCall: RoomText = {
  title: "Roll Call",
  mission: "The Lamplighter's roll has five houses on it. Her lamp is lit only for the ones that answer.",
  access: {
    lantern: HOUSE_LOCKED,
    quill: HOUSE_LOCKED,
    anvil: HOUSE_LOCKED,
    bell: HOUSE_LOCKED,
    ember: HOUSE_LOCKED,
  },
  notes: ["Roll: 10.0.1.7, 10.0.1.10, 10.0.1.12, 10.0.1.16, 10.0.1.18."],
  hints: [
    { text: "Before you can call on anyone, you need your own address back." },
    { text: "The slot's broken. The machine still listens." },
    { text: "`ip addr add` gives a door an address, the same as the slot did.", codex: "address-slot" },
    { text: "Give yourself `10.0.1.5/24`, then ping each house on the roll." },
    {
      text: "`ip addr add 10.0.1.5/24 dev eth0`, then `ping -c 1` each of 10.0.1.7, .10, .12 and .18. (.16 is dark.)",
    },
  ],
  detectors: {
    "empty-house": {
      note: "Nobody's home at that one. Was every house on the roll going to answer?",
      tried: "You kept pinging ember's house, but its door is dark.",
    },
  },
  debrief: {
    happened:
      "You gave your house its address in the machine's own words, then called the roll. Four houses answered. One stayed dark, and that's an answer too.",
    terms: [],
  },
  fieldGuide: ["Command book: `ip addr`"],
};

export const quietStreet: RoomText = {
  title: "The Quiet Street",
  mission: "No house on this street has answered anyone in years. Lantern, at least, should.",
  access: { lantern: HOUSE_LOCKED, quill: HOUSE_LOCKED, anvil: HOUSE_LOCKED },
  notes: [],
  hints: [
    { text: "Three things are wrong: one in your house, one in the square, one on the card." },
    { text: "Ping a few houses. Who answers, and who doesn't?" },
    {
      text: "A house needs an address; a door needs to be on; a letter needs the right address.",
      codex: "ip-address",
    },
    { text: "Give yourself an address, switch the square's door to lantern on, fix the card." },
    {
      text: "In your house: `ip addr add 10.0.1.5/24 dev eth0`. In the square: `ip link set eth1 up`. Then set the card to `10.0.1.7` (`lab card --to 10.0.1.7`). Lantern's reply carries the key.",
    },
  ],
  detectors: {
    "wrong-house": {
      note: "That answer came from your own house. Whose address did you write?",
      tried: "You gave your house lantern's address.",
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
    "ping-only-quill": {
      note: "Quill hears you. So your address is fine. What's between you and lantern?",
      tried: "Quill answered, and you changed your own address again, but yours was already fine.",
    },
  },
  debrief: {
    happened:
      "Your house had no address, the square's door to lantern was off, and the messenger had a wrong house number. Each one alone would keep the street quiet.",
    terms: [],
  },
  voice: [
    {
      id: "F5-BOSS-01",
      speaker: "Lamplighter",
      text: "This was the liveliest street in town. Now listen. Not a sound.",
    },
  ],
};

export const floor5: FloorText = {
  name: "Addresses",
  memory: [
    {
      id: "F5-FM-01",
      title: "The problem",
      text: "The owls' halls knew every door by name. But doors wore out and were replaced, and machines moved house, and every time, everyone's letters went astray.",
    },
    {
      id: "F5-FM-02",
      title: "What they built",
      text: "So we gave every house an address. Not the door's name, the house's. Write to the house, and it doesn't matter whose door it has this year.",
    },
    {
      id: "F5-FM-03",
      title: "Ride-along",
      text: "A question, an answer. 'Are you there?' 'I'm here.'",
      shown:
        "the camera rides a ping from the observatory: the address written on it glows, 10.0.1.7; it crosses the square and arrives at lantern's house; an echo comes back",
    },
    {
      id: "F5-FM-04",
      title: "What's next",
      text: "But… how does a letter with a house address find the right door? There's a little question that flies out first. I nearly have it.",
      shown: "the world map: Floor 6 appears in mist",
    },
  ],
  journal: {
    page: 5,
    title: "Addresses",
    where: "on the square's notice board in 5.2",
    text: "Everyone down here has two names: the one on their door, and the one on their house. I kept writing to doors. The Lamplighter laughed at me for a week.",
  },
};
