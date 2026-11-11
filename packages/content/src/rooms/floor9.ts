import type { FloorText, RoomText } from "./types";

/**
 * floors/floor-9.md, word for word. Placeholders come from the rooms' `vars` (0055): {observatory},
 * {crossingNave}, {archCloister}, {archTower}, {spireTower}, {spireWindow}, {belfry}, {laundry}, {loft},
 * {window}, {nowhere}.
 */

export const twoEnvelopes: RoomText = {
  title: "Follow One Message",
  mission: "Follow one ping from your machine to belfry, and see what changes on the way and what stays the same.",
  notes: [],
  hints: [
    { text: "Press Trace on the Scanner before you send a ping: it tags that one packet." },
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
      "Your ping crossed three subnets: three hops. On each one it rode in a new frame, with MAC addresses for that subnet only. The packet inside kept its IP addresses the whole way, from your machine to belfry; only its countdown and its checksum (a number for spotting damage) changed. Every packet on the internet travels like this.",
    terms: [
      {
        id: "hop",
        term: "hop",
        meaning: "one step of a packet's journey: from one machine to the next, across one subnet",
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
    "Laundry has just moved onto the bell tower's subnet, and it can't reach any other subnet. Give it a way out, then trace a ping from laundry to your machine.",
  notes: [],
  hints: [
    { text: "Go to laundry's room and read its routing table." },
    { text: "Laundry's routing table has a line for its own subnet only." },
    {
      text: "Laundry needs a default gateway: a router's address on laundry's own subnet.",
      codex: "default-gateway",
    },
    {
      text: "Give laundry a default route via arch's door on the bell tower, then trace a ping from laundry to your machine.",
    },
    {
      text: "In laundry: `ip route add default via {archTower}`. Then press Trace and, in laundry, `ping -c 1 {observatory}`.",
    },
  ],
  detectors: {
    "gateway-far": {
      note: "Laundry can only hand packets to a machine on its own subnet, the bell tower.",
      tried: "You pointed laundry at a door off its own subnet, and the machine refused it.",
    },
  },
  debrief: {
    happened:
      "Laundry needed a default gateway on its own subnet: arch's address there, `{archTower}`. Every router on the way already had the routes it needed, so the ping went three hops to your machine and the reply came three hops back. Any new machine on a network needs the same two things: an address, and a default gateway.",
    terms: [],
  },
};

export const oneStepOnly: RoomText = {
  title: "One Step Only",
  mission:
    "Find the routers on the way to belfry. Send a ping whose countdown runs out at the first router, then one that runs out at the second: each router writes back when it happens.",
  notes: [],
  hints: [
    { text: "Each router takes one off a packet's countdown." },
    { text: "`ping -t` and a number sets a packet's countdown before it leaves." },
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
      note: "That one made it all the way to belfry. Use a smaller countdown, so it runs out at a router.",
      tried: "Your countdown was big enough to reach belfry, so no router wrote back.",
    },
  },
  debrief: {
    happened:
      "Every packet carries a countdown, its TTL (time to live), and each router takes one off. Set to 1, it ran out at crossing, the first router, which sent back an ICMP 'time exceeded' message; set to 2, it ran out at arch, the second. The real tool `traceroute` finds every router between you and an address the same way, one step at a time.",
    terms: [
      {
        id: "ttl",
        term: "TTL (time to live)",
        meaning: "a packet's countdown; each router takes one off, and at zero the packet is dropped",
      },
      {
        id: "icmp",
        term: "ICMP",
        meaning:
          "the network's own small messages: ping's echo request and reply, 'unreachable', and 'time exceeded', which a router sends back when a packet's TTL runs out there",
      },
    ],
  },
  questions: [
    {
      q: "Why would anyone want a packet to die?",
      a: "To find out which router is at each step of the way. Each one writes back when the packet dies there.",
    },
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
    { text: "Press Trace, ping loft, and read the trace strip: it lists every router the packet passed." },
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
      note: "A bigger TTL (countdown) only means more laps round the same loop.",
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
    {
      q: "Is this like the storm?",
      a: "A bit like the switching loop on Floor 4. But a packet has a TTL, so it's dropped in the end; a frame has none, so it loops forever.",
    },
  ],
};

export const theCrossing: RoomText = {
  title: "Up to the High Window",
  mission: "Nothing reaches the high window's subnet. Get a ping from your machine to loft, and its reply back.",
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
      note: "Your machine already sends these packets to crossing. Read the error again: it says which router had no way on.",
      tried: "You changed your own routing table, but your machine was already sending to crossing.",
    },
    "via-far-door": {
      note: "Crossing can only hand packets to a machine on a subnet it has a door on.",
      tried: "You told crossing to hand packets to a door on a subnet where it has no door.",
    },
    "routes-again": {
      note: "The routing table is right. The router knows the way, but it isn't allowed to pass packets on.",
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
      note: "A bigger TTL (countdown) only means more laps round the same loop.",
      tried: "You gave the ping a bigger TTL, which only bought it more laps.",
    },
    "step-by-step": {
      note: "Trace the ping again and see where it stops now, before changing anything else.",
      tried: "You tried several changes in a row without checking where your ping stopped.",
    },
  },
  debrief: {
    happened:
      "Four breaks across four subnets. Crossing had no route to the tower, arch sent the high window's packets in a routing loop, spire wasn't allowed to forward, and loft's default gateway pointed at an address nobody has. You found each one by checking where the ping stopped, then fixing that step. That's how real network problems are found: hop by hop, there and back.",
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
  name: "Routing Across Networks",
  memory: [
    {
      id: "F9-FM-01",
      title: "The problem",
      text: "Memory restored. Routers joined the subnets. But paths grew long, routes were sometimes wrong, and a lost packet could go round forever.",
    },
    {
      id: "F9-FM-02",
      title: "What they built",
      text: "So every packet got a countdown, its TTL. Every router takes one off. At zero the packet is dropped, and that router sends an ICMP message back to the sender to say where.",
    },
    {
      id: "F9-FM-03",
      title: "Ride-along",
      text: "Each subnet, a new frame. The packet, the same. The TTL, one less.",
      shown:
        "the camera rides one ping from the observatory to loft: at each crossing the frame falls away like a shed skin, a new one closes around the packet, the TTL counter ticks down, the addresses inside never change; four streets, the light rising at each. Then the reply, all the way back",
    },
    {
      id: "F9-FM-04",
      title: "What's next",
      text: "Above here are many routers and many paths, and a tool, `traceroute`, that finds the way through them one TTL at a time. My logs stop at the foot of the stair.",
      shown: "leads into the first release's ending (END1)",
    },
  ],
  journal: {
    page: 9,
    title: "Someone made a tool",
    where: "on arch's desk in 9.3 (glows after the win)",
    text: "Log 3,402. Power at 3%. The networks above are a maze of routers, and I can't fix them like this. Going back to my room to shut down. Whoever switches me on next: that's me. Start at the first cable. Notes are in the rooms.",
  },
};
