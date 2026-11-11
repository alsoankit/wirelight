import type { FloorText, RoomText } from "./types";

/**
 * floors/floor-9.md, word for word. Placeholders come from the rooms' `vars` (0055): {observatory},
 * {crossingNave}, {archCloister}, {archTower}, {spireTower}, {spireWindow}, {belfry}, {laundry}, {loft},
 * {window}, {nowhere}.
 */

export const twoEnvelopes: RoomText = {
  title: "Follow One Message",
  mission: "Follow one ping from your house to belfry, and see what changes on the way.",
  notes: [],
  hints: [
    { text: "Tag a ping before you send it." },
    { text: "The Scanner catches a traced packet on every subnet it crosses." },
    { text: "A packet's journey is made of hops: one frame per subnet.", codex: "hop" },
    { text: "Trace a ping to belfry, then compare its catches from two different subnets." },
    { text: "Press Trace, `ping -c 1 {belfry}`, then Compare the nave catch with the cloister catch." },
  ],
  detectors: {
    "compare-same-street": {
      note: "Same subnet, same frame. Try catches from two different subnets.",
      tried: "You compared two catches from the same subnet, where the frame never changes.",
    },
    "compare-different-packets": {
      note: "Those are two different packets. Follow one.",
      tried: "You compared catches of two different pings.",
    },
  },
  debrief: {
    happened:
      "Your ping crossed three subnets: three hops. On each subnet it rode in a new frame, with MAC addresses for that subnet only. The packet inside kept its IP addresses the whole way, from your house to belfry's. Only its countdown and checksum changed.",
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
  questions: [
    {
      q: "Why throw the frame away?",
      a: "A frame knows one subnet. The MAC addresses on it mean nothing on the next.",
    },
    { q: "Why keep the packet?", a: "The packet says who wrote it and where it's going. That never changes." },
    { q: "How many hops to belfry?", a: "Count the subnets it crossed." },
  ],
  fieldGuide: ["Following a packet", "Comparing catches"],
  voice: [
    {
      id: "F9-SEE-01",
      speaker: "You",
      text: "There it is. The frame is new at every router. The packet inside goes all the way.",
    },
  ],
};

export const showTheWay: RoomText = {
  title: "Show the Way",
  mission:
    "Laundry has just moved into the bell tower. It can't reach anyone off its subnet, and nobody can reach it: show it the way, then trace a ping home.",
  notes: [],
  hints: [
    { text: "Read laundry's routing table." },
    { text: "Laundry's routing table has a line for its own subnet only." },
    { text: "A default gateway: a router's door on its own subnet.", codex: "default-gateway" },
    { text: "Give laundry a default via arch's door on the bell tower, then trace a ping home." },
    { text: "In laundry: `ip route add default via {archTower}`. Trace a ping to `{observatory}`." },
  ],
  detectors: {
    "gateway-far": {
      note: "Laundry can only hand letters to someone on the bell tower.",
      tried: "You pointed laundry at a door off its own subnet, and the machine refused it.",
    },
  },
  debrief: {
    happened:
      "Laundry needed a default gateway on its own subnet, arch's door, and the rest of the road was already there. Three hops each way, and every router knew its part.",
    terms: [],
  },
};

export const oneStepOnly: RoomText = {
  title: "One Step Only",
  mission:
    "Each router on the way to belfry has a padlock that opens only when a ping's countdown runs out right at that router. Open both.",
  notes: [],
  hints: [
    { text: "Each router takes one off a packet's countdown." },
    { text: "Ping can set the countdown." },
    {
      text: "When the TTL runs out at a router, the packet dies and the router writes back: 'time exceeded'.",
      codex: "ttl",
    },
    { text: "Send one ping that runs out at the first router, and one that runs out at the second." },
    { text: "`ping -c 1 -t 1 {belfry}`, then `ping -c 1 -t 2 {belfry}`." },
  ],
  detectors: {
    "ttl-zero": {
      note: "Zero means it dies before it leaves. Start from one.",
      tried: "You set the TTL to zero, so the packet couldn't leave at all.",
    },
    "ttl-too-big": {
      note: "That one made it all the way. Which countdown dies at the first router?",
      tried: "Your countdown was big enough to reach belfry, so no router wrote back.",
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
  questions: [
    { q: "Why would anyone want a packet to die?", a: "To learn who stands at each step of the road." },
    { q: "Who writes the note?", a: "The router where it died. Always." },
    {
      q: "Is ping an ICMP note too?",
      a: "The question and the echo, yes. The network's small messages are all ICMP.",
    },
  ],
  fieldGuide: ["The countdown", "Command book: ping (flags)"],
};

export const roundAndRound: RoomText = {
  title: "Round and Round",
  mission: "Loft is on the high window's subnet, and pings for it go out but never arrive. Find out where they go.",
  notes: [],
  hints: [
    { text: "Trace a ping to loft and look at the strip." },
    { text: "It visits the same two routers over and over." },
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
      tried: "You changed crossing's route for the high window, but crossing was right to send it to arch.",
    },
    "raise-the-ttl": {
      note: "A bigger TTL (countdown) just means more laps.",
      tried: "You gave the ping a bigger TTL, which only bought it more laps.",
    },
  },
  debrief: {
    happened:
      "Crossing sent loft's packets to arch; arch had no route for the high window, so its default route sent them back to crossing. Round and round, a routing loop, until the TTL ran out. That's why every packet has a TTL. A route on arch, via spire, broke the circle.",
    terms: [
      {
        id: "routing-loop",
        term: "routing loop",
        meaning: "routers passing a packet back and forth because each thinks the other knows the way",
      },
    ],
  },
  questions: [
    {
      q: "Who's wrong, crossing or arch?",
      a: "Crossing sends it to arch, which is right. Arch has no route for the high window, so its default sends it back.",
    },
    { q: "Is this like the storm?", a: "Like a switching loop. But a packet has a TTL, and a frame never did." },
  ],
};

export const theCrossing: RoomText = {
  title: "Up to the High Window",
  mission: "Nothing reaches the high window. Get a ping from your house to loft, and a reply back.",
  notes: [],
  hints: [
    { text: "Find where your ping stops. Then fix that step, and look again." },
    { text: "The TTL, a trace, or listening at a door will each tell you where." },
    { text: "Every step needs a route on, permission to forward, and a way back.", codex: "routing-board" },
    { text: "Crossing, arch, spire and loft each have one thing wrong." },
    {
      text: "In crossing: `ip route add {tower} via {archCloister}` and `ip route add {window} via {archCloister}`. In arch: `ip route add {window} via {spireTower}`. In spire: `sysctl -w net.ipv4.ip_forward=1`. In loft: `ip route del default`, then `ip route add default via {spireWindow}`.",
    },
  ],
  detectors: {
    "fix-my-house": {
      note: "Your house sends to crossing already. Read the message again: which router said 'unreachable'?",
      tried: "You changed your own routing table, but your house was already sending to crossing.",
    },
    "via-far-door": {
      note: "Crossing can only hand packets to a machine on a subnet it has a door on.",
      tried: "You told crossing to hand packets to a door on a subnet where it has no door.",
    },
    "routes-again": {
      note: "The routing table is right. The router knows the way; it just isn't allowed to pass packets on.",
      tried: "You changed spire's routing table, but it was right. IP forwarding was off.",
    },
    "gateway-far": {
      note: "Loft can only hand packets to a machine on its own subnet, the high window.",
      tried: "You pointed loft at a door off its own subnet, and the machine refused it.",
    },
    "ttl-zero": {
      note: "Zero means it dies before it leaves. Start from one.",
      tried: "You set the TTL to zero, so the packet couldn't leave at all.",
    },
    "raise-the-ttl": {
      note: "A bigger TTL (countdown) just means more laps.",
      tried: "You gave the ping a bigger TTL, which only bought it more laps.",
    },
    "step-by-step": {
      note: "Where does it stop now? Trace it again and look.",
      tried: "You tried several changes in a row without asking the road where your ping stopped.",
    },
  },
  debrief: {
    happened:
      "Four breaks across four subnets. Crossing had no route to the tower, arch sent the high window's packets in a routing loop, spire wasn't allowed to forward, and loft's default gateway pointed at nobody. You found each one by asking the road where it stopped. That's the whole of what a network does: hop by hop, there and back.",
    terms: [],
  },
  voice: [
    {
      id: "F9-BOSS-01",
      speaker: "You",
      text: "The high window, at the top of the cathedral. Several things stand in the way.",
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
        "the camera rides one ping from the observatory to loft: at each crossing the frame falls away like a shed skin, a new one closes around the packet, the TTL counter ticks down, the addresses inside never change; four streets, the light rising at each. Then the reply, all the way back",
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
