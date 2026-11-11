import { HOUSE_LOCKED } from "./floor5";
import type { FloorText, RoomText } from "./types";

/** floors/floor-6.md, word for word. */

export const insideTheEnvelope: RoomText = {
  title: "Open It Up",
  mission:
    "Kitchen keeps sending a message you couldn't open before. Your Scanner can open it all the way now: read what's inside.",
  access: { kitchen: HOUSE_LOCKED, library: HOUSE_LOCKED, forge: HOUSE_LOCKED },
  notes: ["Found this in the post office. Try it on kitchen's messages."],
  hints: [
    // The Scanner is the button at the bottom left (it replaced Captures), not an object on the table.
    { text: "A new tool is online: the Scanner, at the bottom left. Open it." },
    { text: "Catch one of kitchen's sealed letters with the Scanner." },
    { text: "A frame can carry another message inside it, with addresses of its own: a packet.", codex: "packet" },
    { text: "Open a catch, then open what's inside the frame, then what's inside that." },
    {
      text: "Catch a kitchen announcement on the Scanner and open it all the way down, to the message inside.",
    },
  ],
  detectors: {
    "frame-is-everything": {
      note: "There's more in there now. Try opening it further.",
      tried: "You opened catches only as far as the frame.",
    },
  },
  debrief: {
    happened:
      "The sealed letter was a packet, inside a frame. The frame gets it across one cable, door to door, using MAC addresses; the packet carries the IP addresses: who wrote it and who it's for. Putting one inside the other is called encapsulation, and every message on a real network is built this way.",
    terms: [
      {
        id: "packet",
        term: "packet",
        meaning: "a message with IP addresses (who sent it and who it's for), carried inside a frame",
      },
      {
        id: "encapsulation",
        term: "encapsulation",
        meaning: "putting one message inside another: the packet inside the frame",
      },
    ],
  },
  memories: [
    {
      id: "F6-MEM-01",
      title: "The Scanner",
      trigger: "when picked up",
      text: "My scanner works again. It catches messages and keeps them in order, with labels, and it can open them all the way down.",
      action: "catch one message with the Scanner",
    },
  ],
  questions: [
    {
      q: "Why two envelopes?",
      a: "The frame gets it from door to door. The packet says which house it's really for. Different jobs, so different envelopes.",
    },
    {
      q: "Why does the packet say `.255`?",
      a: "`10.0.1.255` means everyone on this street at once: a broadcast address for houses, like `ff:ff:ff:ff:ff:ff` for doors.",
    },
    { q: "Has this always been inside?", a: "Every one of them, since the halls. You couldn't open it yet." },
  ],
  fieldGuide: ["The Scanner", "Envelopes inside envelopes"],
  voice: [
    {
      id: "F6-SEAL-01",
      speaker: "You",
      text: "So that's how it works. The packet, addressed with IP addresses, travels inside the frame, addressed with MAC addresses.",
    },
  ],
};

export const whoHasThisAddress: RoomText = {
  title: "Who Has This Address?",
  mission:
    "Your machine's keeper has stopped wrapping packets in frames, so a ping for kitchen is stuck on your desk. Wrap it and send it by hand.",
  access: { kitchen: HOUSE_LOCKED, library: HOUSE_LOCKED, forge: HOUSE_LOCKED },
  notes: [],
  hints: [
    { text: "Look at the desk in your room: the packet there needs a frame around it before it can leave." },
    {
      text: "A frame needs kitchen's MAC address. Read the neighbour ledger first: it lists the ones your machine knows.",
    },
    {
      text: "When a house doesn't know a neighbour's door, it asks everyone: 'Who has this address?'",
      codex: "arp-question",
    },
    {
      text: "Look it up; if it's missing, send a broadcast asking for it; then wrap the packet in a frame to the MAC address you got back and send it.",
    },
    {
      text: "Ask everyone (a broadcast) for `10.0.1.7`; kitchen answers `02:00:00:00:00:17`. Wrap to that and send. Do it once more, and the keeper takes over.",
    },
  ],
  detectors: {
    "wrap-with-ip": {
      note: "A frame needs a MAC address, and 10.0.1.7 is an IP address. Find out which door has it.",
      tried: "You tried to wrap a frame to an IP address, but a frame needs a MAC address.",
    },
    "wrap-to-everyone": {
      note: "A broadcast frame reaches kitchen, but every other machine too. Ask first, so you learn kitchen's own MAC address.",
      tried: "You wrapped the packet in a broadcast frame instead of a frame to kitchen's MAC address.",
    },
    "ask-again": {
      note: "Kitchen's MAC address is already in the ledger. Look there first.",
      tried: "You asked the street for an address your ledger already had.",
    },
  },
  debrief: {
    happened:
      "To send a packet, your machine needs the MAC address of the machine it's for, to put on the frame. So it broadcasts 'Who has 10.0.1.7?', the owner replies with its MAC address, and the answer is saved in the ARP table (the neighbour ledger on screen, `ip neigh`). That's ARP, the small question you've seen before every first ping, and real machines do it before talking to any neighbour for the first time.",
    terms: [
      {
        id: "arp",
        term: "ARP",
        meaning: "a broadcast asking 'who has this IP address?'; the owner replies with its MAC address",
      },
      {
        id: "neighbour-ledger",
        term: "ARP table",
        meaning:
          "your machine's list of IP addresses and the MAC address that goes with each (`ip neigh`); on screen, the neighbour ledger",
      },
    ],
  },
  questions: [
    {
      q: "Why not remember everyone's door?",
      a: "It does: that's the ARP table. But doors change, so its lines go stale after a while, and the machine asks again.",
    },
    {
      q: "Why does everyone hear the question?",
      a: "You don't know whose door it is yet. So you ask the whole street.",
    },
    {
      q: "What did that little question have to do with ping?",
      a: "Everything. A ping is a packet. It can't leave without a MAC address on its frame.",
    },
  ],
  fieldGuide: ["Asking the street", "Command book: `ip neigh`"],
  voice: [
    {
      id: "F6-KEEP-01",
      speaker: "You",
      text: "It's awake. Its screen says: look it up. If it's not there, ask. Write it down. Wrap. Send.",
    },
  ],
};

export const twoOfMe: RoomText = {
  title: "Two Answers",
  mission:
    "When you ping kitchen, sometimes kitchen answers and sometimes a different machine does. Find out why, and fix it.",
  access: { forge: HOUSE_LOCKED },
  notes: ["Register: kitchen 10.0.1.7 · library 10.0.1.12 · forge 10.0.1.10."],
  hints: [
    { text: "Ping kitchen a few times and catch the replies with the Scanner. Look at who each one is *from*." },
    { text: "Your Scanner shows the MAC address on every reply. So does your neighbour ledger (the ARP table)." },
    {
      text: "Two machines can't share one IP address: ARP gets two answers, and the ARP table can keep only one.",
      codex: "two-answers",
    },
    { text: "Find which MAC address isn't kitchen's, find its machine, and give it its own IP address." },
    {
      text: "Some replies come from `02:00:00:00:00:17` (kitchen), some from `…:0c` (library). In library's room: `ip addr del 10.0.1.7/24 dev eth0`, then `ip addr add 10.0.1.12/24 dev eth0`.",
    },
  ],
  detectors: {
    "flush-and-hope": {
      note: "Clearing the ARP table doesn't help: it learns again from whichever door answers. Find out why two doors answer.",
      tried: "You cleared your ARP table more than once, but it kept learning from two doors.",
    },
    "change-my-address": {
      note: "Your address was fine. Someone else is answering as kitchen.",
      tried: "You changed your own address, but yours wasn't the problem.",
    },
    "delete-kitchen": {
      note: "Kitchen is the right owner of `.7`. Find the other machine that claims it.",
      tried: "You took kitchen's address away, but kitchen was the rightful owner.",
    },
  },
  debrief: {
    happened:
      "Library had been given kitchen's IP address. Both answered the ARP question 'who has 10.0.1.7?'. Your ARP table kept whichever answered first, and switched whenever the other one spoke up, so your pings went to one door, then the other. Giving library its own address fixed it.",
    terms: [
      {
        id: "duplicate-address",
        term: "duplicate address",
        meaning: "two machines given the same IP address; the others can't tell which one to send to",
      },
    ],
  },
  questions: [
    { q: "Who is answering for kitchen?", a: "Check the Scanner. Every reply carries the MAC address it came from." },
    {
      q: "Can two houses share an address?",
      a: "No. With two machines on one IP address, nobody knows which one to deliver to, and replies come from either.",
    },
  ],
};

export const mixedUpLetters: RoomText = {
  title: "Wrong Deliveries",
  mission: "Packets are going to the wrong machines. Get pings through to both kitchen and forge.",
  access: { library: HOUSE_LOCKED, forge: HOUSE_LOCKED },
  notes: ["Register: kitchen 10.0.1.7 · forge 10.0.1.10 · library 10.0.1.12 · chapel 10.0.1.18."],
  hints: [
    { text: "Kitchen and forge each have a different problem. Start with your ARP table." },
    { text: "Read your ARP table. Read the MAC address on every reply." },
    {
      text: "A pinned (PERMANENT) line in the ARP table is never checked again; and a duplicate address confuses everyone.",
      codex: "neighbour-ledger",
    },
    { text: "Cross out the wrong pinned line; give the imposter its own address." },
    {
      text: "In your house: `ip neigh del 10.0.1.7 dev eth0`. In chapel's room: `ip addr del 10.0.1.10/24 dev eth0`, then `ip addr add 10.0.1.18/24 dev eth0`. Then ping kitchen and forge.",
    },
  ],
  detectors: {
    "flush-and-hope": {
      note: "Clearing the ARP table doesn't help: it learns again from whichever door answers. Find out why two doors answer.",
      tried: "You cleared your ARP table more than once.",
    },
    "change-my-address": {
      note: "Your address was fine. Someone else is answering in another house's place.",
      tried: "You changed your own address, but yours wasn't the problem.",
    },
    "delete-kitchen": {
      note: "Kitchen is the right owner of its address. Find the machine that's answering for another house.",
      tried: "You took kitchen's address away, but kitchen was the rightful owner.",
    },
    "permanent-again": {
      note: "Most lines go stale and get checked again. This one says PERMANENT: it never goes stale.",
      tried: "You waited for kitchen's line to go stale, but a pinned line never does.",
    },
  },
  debrief: {
    happened:
      "Your ARP table had a pinned entry for kitchen's old door, so your packets went to a door that no longer exists. And chapel was claiming forge's IP address. You removed the pinned entry and gave chapel its own address. Both happen on real networks: a fixed entry nobody updated, and two machines set to the same address.",
    terms: [],
  },
  voice: [
    {
      id: "F6-BOSS-01",
      speaker: "You",
      text: "The post office. Every message in town used to go through here. Now half of them go to the wrong door.",
    },
  ],
};

export const floor6: FloorText = {
  name: "Packets and ARP",
  memory: [
    {
      id: "F6-FM-01",
      title: "The problem",
      text: "Memory restored. Machines had IP addresses, but cables and switches only understand MAC addresses. A packet couldn't travel on its own.",
    },
    {
      id: "F6-FM-02",
      title: "What they built",
      text: "So the packet was put inside a frame. And when a neighbour's MAC address was unknown, the machine asked the whole street with ARP and wrote the answer in its ARP table.",
    },
    {
      id: "F6-FM-03",
      title: "Ride-along",
      text: "The frame for the cable. The packet for the machine.",
      shown:
        "the camera starts inside the observatory's keeper: a packet to 10.0.1.7; the ledger is searched; a question flies out; the answer is written; the packet is folded into a frame (the camera watches the frame close around it); out through the door, through the square; at kitchen's door the frame is opened and dropped; the packet goes in",
    },
    {
      id: "F6-FM-04",
      title: "What's next",
      text: "But how does a machine know which addresses are on its own street, and which are further away? That's next.",
      shown: "the world map: Floor 7 in mist",
    },
  ],
  journal: {
    page: 6,
    title: "The little question",
    where: "tucked into the Scanner's cover in 6.2 (glows after the win)",
    text: "Log 3,325. Every time I write to a house, a tiny question goes out first: who has this address? I used to think it was noise. It's the most important message on the street.",
  },
};
