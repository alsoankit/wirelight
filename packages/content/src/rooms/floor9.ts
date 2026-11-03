import type { FloorText, RoomText } from "./types";

/**
 * floors/floor-9.md, word for word. Placeholders come from the rooms' `vars` (0055): {observatory},
 * {crossingNave}, {archCloister}, {archTower}, {spireTower}, {spireWindow}, {lumen}, {wren}, {halo},
 * {window}, {nowhere}.
 */

export const twoEnvelopes: RoomText = {
  title: "Two Envelopes",
  mission: "Follow one ping from your house to lumen, and see what changes on the way.",
  notes: [],
  hints: [
    { text: "Tag a ping before you send it." },
    { text: "The Scanner catches a traced packet on every street it crosses." },
    { text: "A packet's journey is made of hops: one frame per street.", codex: "hop" },
    { text: "Trace a ping to lumen, then compare its catches from two different streets." },
    { text: "Press Trace, `ping -c 1 {lumen}`, then Compare the nave catch with the cloister catch." },
  ],
  detectors: {
    "compare-same-street": {
      note: "Same street, same frame. Try catches from two different streets.",
      tried: "You compared two catches from the same street, where the frame never changes.",
    },
    "compare-different-packets": {
      note: "Those are two different letters. Follow one.",
      tried: "You compared catches of two different pings.",
    },
  },
  debrief: {
    happened:
      "Your ping walked three streets: three hops. On each street it rode in a new frame, with door names for that street only. The packet inside kept its addresses the whole way, from your house to lumen's. Only its countdown and checksum changed.",
    terms: [
      {
        id: "hop",
        term: "hop",
        meaning: "one step of a journey, from one machine to the next across one street",
      },
    ],
  },
  memories: [
    {
      id: "F9-MEM-01",
      title: "Trace and compare",
      trigger: "first use of the Scanner's tracer",
      text: "If I tag a packet and send it, the Scanner catches it everywhere it goes. Then I can lay two catches side by side.",
      action: "press Trace",
    },
  ],
  guardian: [
    {
      q: "Why throw the frame away?",
      a: "A frame knows one street. The door names on it mean nothing on the next.",
    },
    { q: "Why keep the packet?", a: "The packet says who wrote it and where it's going. That never changes." },
    { q: "How many hops to lumen?", a: "Count the streets it walked." },
  ],
  fieldGuide: ["Following a packet", "Comparing catches"],
  voice: [
    {
      id: "F9-SEE-01",
      speaker: "You",
      text: "There it is. The envelope for the road is new at every crossing. The letter inside goes all the way.",
    },
  ],
};

export const showTheWay: RoomText = {
  title: "Show the Way",
  mission:
    "Wren has just moved into the bell tower. It can't reach anyone off its street, and nobody can reach it: show it the way, then trace a ping home.",
  notes: [],
  hints: [
    { text: "Read wren's board." },
    { text: "What does every house need for other streets?" },
    { text: "A default gateway: a router door on its own street.", codex: "default-gateway" },
    { text: "Give wren a default via arch's door on the bell tower, then trace a ping home." },
    { text: "In wren: `ip route add default via {archTower}`. Trace a ping to `{observatory}`." },
  ],
  detectors: {
    "gateway-far": {
      note: "Wren can only hand letters to someone on the bell tower.",
      tried: "You pointed wren at a door off its own street, and the machine refused it.",
    },
  },
  debrief: {
    happened:
      "Wren needed a gateway on its own street, arch's door, and the rest of the road was already there. Three hops each way, and every crossing knew its part.",
    terms: [],
  },
};

export const oneStepOnly: RoomText = {
  title: "One Step Only",
  mission: "Two locks: one at the first crossing, one at the second. Each opens only for a ping that dies right there.",
  notes: [],
  hints: [
    { text: "Each crossing takes one off a packet's countdown." },
    { text: "Ping can set the countdown." },
    {
      text: "When the TTL runs out at a router, the packet dies and the router writes back: 'time exceeded'.",
      codex: "ttl",
    },
    { text: "Send one ping that runs out at the first crossing, and one that runs out at the second." },
    { text: "`ping -c 1 -t 1 {lumen}`, then `ping -c 1 -t 2 {lumen}`." },
  ],
  detectors: {
    "ttl-zero": {
      note: "Zero means it dies before it leaves. Start from one.",
      tried: "You set the countdown to zero, so the packet couldn't leave at all.",
    },
    "ttl-too-big": {
      note: "That one made it all the way. Which countdown dies at the first crossing?",
      tried: "Your countdown was big enough to reach lumen, so no crossing wrote back.",
    },
  },
  debrief: {
    happened:
      "Every packet carries a countdown, its TTL. Each router takes one off. You set it to 1, so it ran out at the first crossing, and crossing wrote back 'time exceeded', an ICMP note. Set to 2, it ran out at the second. One step at a time, you found who stands on the road.",
    terms: [
      {
        id: "ttl",
        term: "TTL (time to live)",
        meaning: "a packet's countdown; each router takes one off, and at zero it dies",
      },
      {
        id: "icmp",
        term: "ICMP",
        meaning:
          "the network's small messages: echo, unreachable, and time exceeded, the note a router sends back when a packet's TTL runs out there",
      },
    ],
  },
  guardian: [
    { q: "Why would anyone want a packet to die?", a: "To learn who stands at each step of the road." },
    { q: "Who writes the note?", a: "The crossing where it died. Always." },
    {
      q: "Is ping an ICMP note too?",
      a: "The question and the echo, yes. The network's small messages are all ICMP.",
    },
  ],
  fieldGuide: ["The countdown", "Command book: ping (flags)"],
};

export const roundAndRound: RoomText = {
  title: "Round and Round",
  mission: "Halo lives at the high window. Every ping for it goes out, and none ever arrives.",
  notes: [],
  hints: [
    { text: "Trace a ping to halo and look at the strip." },
    { text: "It visits the same two crossings over and over." },
    {
      text: "When routers point back at each other, a packet loops until its TTL runs out.",
      codex: "routing-loop",
    },
    { text: "Find which router has no line for the high window, and give it one, via the router that stands on it." },
    { text: "In arch: `ip route add {window} via {spireTower}`." },
  ],
  detectors: {
    "fix-crossing": {
      note: "Crossing was right to send it to arch. Where does arch send it?",
      tried: "You changed crossing's line for the high window, but crossing was right to send it to arch.",
    },
    "raise-the-ttl": {
      note: "More countdown just means more laps.",
      tried: "You gave the ping a bigger countdown, which only bought it more laps.",
    },
  },
  debrief: {
    happened:
      "Crossing sent halo's packets to arch; arch had no route for the high window, so its default sent them back to crossing. Round and round, a routing loop, until the TTL ran out. That's why every packet has a countdown. A route on arch, via spire, broke the circle.",
    terms: [
      {
        id: "routing-loop",
        term: "routing loop",
        meaning: "routers passing a packet back and forth because each thinks the other knows the way",
      },
    ],
  },
  guardian: [
    {
      q: "Who's wrong, crossing or arch?",
      a: "Crossing sends it to arch, which is right. Arch has no word for the high window, so it sends it home.",
    },
    { q: "Is this like the storm?", a: "A cousin. But a packet has a countdown. A frame never did." },
  ],
};

export const theCrossing: RoomText = {
  title: "The Crossing",
  mission: "Light hasn't reached the high window in a hundred years. Send it a ping, and bring one back.",
  notes: [],
  hints: [
    { text: "Find where your ping stops. Then fix that step, and look again." },
    { text: "A countdown, a trace, or listening at a door will each tell you where." },
    { text: "Every step needs a route on, permission to forward, and a way back.", codex: "routing-board" },
    { text: "Crossing, arch, spire and halo each have one thing wrong." },
    {
      text: "In crossing: `ip route add {tower} via {archCloister}` and `ip route add {window} via {archCloister}`. In arch: `ip route add {window} via {spireTower}`. In spire: `sysctl -w net.ipv4.ip_forward=1`. In halo: `ip route del default`, then `ip route add default via {spireWindow}`.",
    },
  ],
  detectors: {
    "fix-my-house": {
      note: "Your house sends to crossing already. Read the message again: who said 'unreachable'?",
      tried: "You changed your own house's board, but your house was already sending to crossing.",
    },
    "via-far-door": {
      note: "Crossing can only hand letters to someone on a street it stands on.",
      tried: "You told crossing to hand letters to a door on a street it doesn't stand on.",
    },
    "routes-again": {
      note: "The board is right. The keeper knows the way; it just isn't allowed to go.",
      tried: "You changed spire's board, but its board was right. It wasn't allowed to pass things along.",
    },
    "gateway-far": {
      note: "Halo can only hand letters to someone on the high window.",
      tried: "You pointed halo at a door off its own street, and the machine refused it.",
    },
    "ttl-zero": {
      note: "Zero means it dies before it leaves. Start from one.",
      tried: "You set the countdown to zero, so the packet couldn't leave at all.",
    },
    "raise-the-ttl": {
      note: "More countdown just means more laps.",
      tried: "You gave the ping a bigger countdown, which only bought it more laps.",
    },
    "step-by-step": {
      note: "Where does it stop now? Ask the road.",
      tried: "You tried several changes in a row without asking the road where your ping stopped.",
    },
  },
  debrief: {
    happened:
      "Four breaks along four streets. Crossing had no way to the tower, arch sent the high window's letters in circles, spire wasn't allowed to forward, and halo's way home pointed at nobody. You found each one by asking the road where it stopped. That's the whole of what a network does: hop by hop, there and back.",
    terms: [],
  },
  voice: [
    {
      id: "F9-BOSS-01",
      speaker: "You",
      text: "The high window. Light used to reach all the way up here. Not for years.",
    },
  ],
};

export const floor9: FloorText = {
  name: "The Journey",
  memory: [
    {
      id: "F9-FM-01",
      title: "The problem",
      text: "Memory restored. Crossings joined the streets. But roads grew long, and sometimes crooked, and a lost letter could wander forever.",
    },
    {
      id: "F9-FM-02",
      title: "What they built",
      text: "So every letter got a countdown. Every crossing takes one off. At zero it stops, and the crossing sends a note home to say where.",
    },
    {
      id: "F9-FM-03",
      title: "Ride-along",
      text: "Each street, a new envelope. The letter, the same. The countdown, one less.",
      shown:
        "the camera rides one ping from the observatory to halo: at each crossing the frame falls away like a shed skin, a new one closes around the packet, the TTL counter ticks down, the addresses inside never change; four streets, the light rising at each. Then the reply, all the way back",
    },
    {
      id: "F9-FM-04",
      title: "What's next",
      text: "Above here the roads become a maze, and there's a tool that finds the way through. My logs stop at the foot of the stair.",
      shown: "leads into the first release's ending (END1)",
    },
  ],
  journal: {
    page: 9,
    title: "Someone made a tool",
    where: "on arch's desk in 9.3 (glows after the win)",
    text: "Log 3,402. Power at 3%. The roads above are a maze and I can't fix them like this. Going back to my room to shut down. Whoever switches me on next: that's me. Start at the first cable. Notes are in the rooms.",
  },
};
