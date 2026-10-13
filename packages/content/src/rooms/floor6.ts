import { HOUSE_LOCKED } from "./floor5";
import type { FloorText, RoomText } from "./types";

/** floors/floor-6.md, word for word. */

export const insideTheEnvelope: RoomText = {
  title: "Inside the Envelope",
  mission:
    "Lantern has been sending the same sealed letter since the day you met. The Knight finally found a way to open it.",
  access: { lantern: HOUSE_LOCKED, quill: HOUSE_LOCKED, anvil: HOUSE_LOCKED },
  notes: ["Found this in the post office. Try it on lantern's letters."],
  hints: [
    { text: "Pick up what's glowing on the table." },
    { text: "Catch one of lantern's sealed letters with the Slate." },
    { text: "A frame can carry another envelope inside it: a packet.", codex: "packet" },
    { text: "Open a catch, then open what's inside the frame, then what's inside that." },
    { text: "Catch a lantern announcement on the Slate and open it to the message layer. The key is in the message." },
  ],
  detectors: {
    "frame-is-everything": {
      note: "There's more in there now. Try opening it further.",
      tried: "You opened catches only as far as the frame.",
    },
  },
  debrief: {
    happened:
      "The sealed letter was a packet, inside a frame. The frame gets it across one cable, door to door; the packet carries the house addresses, who wrote it and who it's for. Putting one envelope inside another is called encapsulation.",
    terms: [
      { id: "packet", term: "packet", meaning: "the letter inside a frame, with house (IP) addresses" },
      { id: "encapsulation", term: "encapsulation", meaning: "putting one envelope inside another" },
    ],
  },
  memories: [
    {
      id: "F6-MEM-01",
      title: "The Slate",
      trigger: "when picked up",
      text: "I found this in the post office. It catches messages and keeps them in order, with labels. And look: you can open them all the way down.",
      action: "catch one message with the Slate",
    },
  ],
  guardian: [
    {
      q: "Why two envelopes?",
      a: "The frame gets it from door to door. The packet says which house it's really for. Different jobs, so different envelopes.",
    },
    {
      q: "Why does the packet say `.255`?",
      a: "That's the whole street at once. Everyone on it. Like the everyone name, but for houses.",
    },
    { q: "Has this always been inside?", a: "Every one of them. Since the halls. You just couldn't open it yet." },
  ],
  fieldGuide: ["The Slate", "Envelopes inside envelopes"],
  voice: [
    {
      id: "F6-SEAL-01",
      speaker: "Lamplighter",
      text: "Oh… *that's* what we did. The house letter went inside the door letter. All this time.",
    },
  ],
};

export const whoHasThisAddress: RoomText = {
  title: "Who Has This Address?",
  mission: "Your house has forgotten how to address its envelopes. A ping for lantern is stuck on your desk.",
  access: { lantern: HOUSE_LOCKED, quill: HOUSE_LOCKED, anvil: HOUSE_LOCKED },
  notes: [],
  hints: [
    { text: "The packet on your desk needs a frame around it." },
    { text: "A frame needs a door name. Do you know lantern's?" },
    {
      text: "When a house doesn't know a neighbour's door, it asks everyone: 'Who has this address?'",
      codex: "arp-question",
    },
    {
      text: "Look it up; if it's missing, ask everyone; then wrap the packet to the door name you got back and send it.",
    },
    {
      text: "Ask everyone for `10.0.1.7`; lantern answers `02:00:00:00:00:17`. Wrap to that and send. Do it once more, and the keeper takes over.",
    },
  ],
  detectors: {
    "wrap-with-ip": {
      note: "A frame is door to door. Whose door is 10.0.1.7?",
      tried: "You tried to wrap a frame to a house address, but a frame needs a door name.",
    },
    "wrap-to-everyone": {
      note: "That reaches lantern… and every other house too. Is there a way to learn lantern's own door name?",
      tried: "You wrapped the packet to everyone instead of to lantern's door.",
    },
    "ask-again": {
      note: "It's already written down. Look first.",
      tried: "You asked the street for an address your ledger already had.",
    },
  },
  debrief: {
    happened:
      "To send a packet to a house, your machine needs that house's door name for the frame. It asks the whole street, 'Who has 10.0.1.7?' The owner answers, and the answer goes in the neighbour ledger. That's ARP, and it's the little question you've seen before every first ping.",
    terms: [
      { id: "arp", term: "ARP", meaning: "asking everyone 'who has this address?' to learn the door name" },
      {
        id: "neighbour-ledger",
        term: "neighbour ledger",
        meaning: "the list of house address → door name your machine has learned (`ip neigh`)",
      },
    ],
  },
  guardian: [
    {
      q: "Why not just remember everyone's door?",
      a: "We do! That's the ledger. But doors change, so the lines go stale, and we ask again.",
    },
    {
      q: "Why does everyone hear the question?",
      a: "You don't know whose door it is yet, love. So you ask the whole street.",
    },
    {
      q: "What did that little question have to do with ping?",
      a: "Everything. A ping is a house letter. It can't leave without a door name on its frame.",
    },
  ],
  fieldGuide: ["Asking the street", "Command book: `ip neigh`"],
  voice: [
    {
      id: "F6-KEEP-01",
      speaker: "keeper",
      text: "I remember. Look it up. If it's not there, ask. Write it down. Wrap. Send.",
    },
  ],
};

export const twoOfMe: RoomText = {
  title: "Two of Me",
  mission: "Sometimes lantern answers you. Sometimes a stranger answers in its place.",
  access: { anvil: HOUSE_LOCKED },
  notes: ["Register: lantern 10.0.1.7 · quill 10.0.1.12 · anvil 10.0.1.10."],
  hints: [
    { text: "Look at who each answer is *from*." },
    { text: "Your Slate shows the door name on every reply. So does your ledger." },
    { text: "Two houses can't share one address: the street can't tell them apart.", codex: "two-answers" },
    { text: "Find which door name isn't lantern's, find its house, and give it its own address." },
    {
      text: "Some replies come from `02:00:00:00:00:17` (lantern), some from `…:0c` (quill). In quill's room: `ip addr del 10.0.1.7/24 dev eth0`, then `ip addr add 10.0.1.12/24 dev eth0`.",
    },
  ],
  detectors: {
    "flush-and-hope": {
      note: "The ledger learns it again, and maybe wrong again. Why are two doors answering?",
      tried: "You cleared your ledger more than once, but it kept learning from two doors.",
    },
    "change-my-address": {
      note: "Your address was fine. Someone else is answering as lantern.",
      tried: "You changed your own address, but yours wasn't the problem.",
    },
    "delete-lantern": {
      note: "Lantern was the right one. Who else claims `.7`?",
      tried: "You took lantern's address away, but lantern was the rightful owner.",
    },
  },
  debrief: {
    happened:
      "Quill had been given lantern's address. Both answered 'who has 10.0.1.7?'. Your ledger kept whichever answered first, and switched whenever the other one spoke up, so your pings went to one door, then the other. Giving quill its own address fixed it.",
    terms: [
      {
        id: "duplicate-address",
        term: "duplicate address",
        meaning: "two machines with the same IP address; the street can't tell them apart",
      },
    ],
  },
  guardian: [
    { q: "Who is answering for lantern?", a: "Ask your Slate, love. Every answer carries the door it came from." },
    { q: "Can two houses share an address?", a: "Two houses, one number? The post would never know where to go." },
  ],
};

export const mixedUpLetters: RoomText = {
  title: "The Mixed-Up Letters",
  mission:
    "The post office has been delivering letters to the wrong houses for years. Two houses need to hear from you: lantern, and anvil.",
  access: { quill: HOUSE_LOCKED, anvil: HOUSE_LOCKED },
  notes: ["Register: lantern 10.0.1.7 · anvil 10.0.1.10 · quill 10.0.1.12 · bell 10.0.1.18."],
  hints: [
    { text: "Two houses, two different problems." },
    { text: "Read your ledger. Read the door name on every reply." },
    {
      text: "A pinned ledger line never gets checked again; two houses with one address confuse everyone.",
      codex: "neighbour-ledger",
    },
    { text: "Cross out the wrong pinned line; give the imposter its own address." },
    {
      text: "In your house: `ip neigh del 10.0.1.7 dev eth0`. In bell's room: `ip addr del 10.0.1.10/24 dev eth0`, then `ip addr add 10.0.1.18/24 dev eth0`. Then ping lantern and anvil.",
    },
  ],
  detectors: {
    "flush-and-hope": {
      note: "The ledger learns it again, and maybe wrong again. Why are two doors answering?",
      tried: "You cleared your ledger more than once.",
    },
    "change-my-address": {
      note: "Your address was fine. Someone else is answering in another house's place.",
      tried: "You changed your own address, but yours wasn't the problem.",
    },
    "delete-lantern": {
      note: "Lantern was the right one. Who else is answering for someone else?",
      tried: "You took lantern's address away, but lantern was the rightful owner.",
    },
    "permanent-again": {
      note: "Most lines go stale and get checked. This one says PERMANENT.",
      tried: "You waited for lantern's line to go stale, but a pinned line never does.",
    },
  },
  debrief: {
    happened:
      "Your ledger had a pinned line for lantern's old door, so your letters went to a door that no longer exists. And bell was claiming anvil's address. You removed the pinned line and gave bell its own house.",
    terms: [],
  },
  voice: [
    {
      id: "F6-BOSS-01",
      speaker: "Lamplighter",
      text: "The post office. Every letter in town went through here, once. Now half of them go to the wrong door.",
    },
  ],
};

export const floor6: FloorText = {
  name: "Envelopes",
  memory: [
    {
      id: "F6-FM-01",
      title: "The problem",
      text: "We had our house addresses. But the owls' halls only understood door names. A house letter couldn't travel on its own.",
    },
    {
      id: "F6-FM-02",
      title: "What they built",
      text: "So we folded the house letter inside a door letter. And when we didn't know a neighbour's door, we asked the whole street, and wrote the answer in a ledger.",
    },
    {
      id: "F6-FM-03",
      title: "Ride-along",
      text: "The frame for the road. The packet for the house.",
      shown:
        "the camera starts inside the observatory's keeper: a packet to 10.0.1.7; the ledger is searched; a question flies out; the answer is written; the packet is folded into a frame (the camera watches the frame close around it); out through the door, through the square; at lantern's door the frame is opened and dropped; the packet goes in",
    },
    {
      id: "F6-FM-04",
      title: "What's next",
      text: "But how does a house know which addresses are its neighbours, and which aren't? That was the street signs. Nearly there.",
      shown: "the world map: Floor 7 in mist",
    },
  ],
  journal: {
    page: 6,
    title: "The little question",
    where: "tucked into the Slate's cover in 6.2 (glows after the win)",
    text: "Every time I wrote to a house, a tiny question flew out first. I asked the Lamplighter about it. She looked at me like I'd asked why people knock before they open a door.",
  },
};
