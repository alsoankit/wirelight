import type { FloorText, RoomText } from "./types";

/**
 * floors/floor-8.md, word for word. Placeholders come from the rooms' `vars` (0055): {observatory},
 * {crossingNave}, {crossingCloister}, {archCloister}, {archTower}, {vesper}, {lumen}, {tower},
 * {nowhere}; in 8.5 also the door names {crossingNaveDoor}, {vesperDoor}, {observatoryDoor}.
 *
 * Two words are kept out of these rooms on purpose: "TTL" (taught in 9.3; 8.5 says "countdown") and
 * anything quoting `icmp_seq` (ICMP is taught in 9.3).
 */

export const otherStreet: RoomText = {
  title: "The Other Street",
  mission: "Vesper lives on the next street. Find out who stands between you.",
  notes: [],
  hints: [
    { text: "Who has a door on both streets?" },
    { text: "Walk to the room between you and vesper. Read its plates." },
    {
      text: "A router has a door on each street it joins; each door has an address on its own street.",
      codex: "router",
    },
    { text: "Ping crossing's door on your street from your house, and its other door from vesper's." },
    { text: "From the observatory: `ping -c 1 {crossingNave}`. From vesper: `ping -c 1 {crossingCloister}`." },
  ],
  detectors: {
    "same-street-trick": {
      note: "Now you can't reach your own street. A crossing joins streets so you don't have to move.",
      tried: "You moved your house onto vesper's street, but a crossing joins streets so nobody has to move.",
    },
    "far-door-from-here": {
      note: "That's the crossing's door on the other street. Which of its doors is on yours?",
      tried: "You kept pinging crossing's door on the far street, which your house can't reach yet.",
    },
  },
  debrief: {
    happened:
      "Crossing has a door on your street and a door on vesper's. Each street can reach the door on its own side. A machine like that, which passes packets between streets, is a router.",
    terms: [
      {
        id: "router",
        term: "router",
        meaning: "a machine with doors on more than one street that passes packets between them",
      },
    ],
  },
  guardian: [
    { q: "What is this room?", a: "A crossing. One foot on each street." },
    { q: "Why two addresses?", a: "One door on each street. Each door lives where it stands." },
    { q: "Can I reach vesper now?", a: "Not yet. Your house doesn't know the crossing is here." },
  ],
  fieldGuide: ["Routers and crossings"],
};

export const acrossTheStreet: RoomText = {
  title: "Across the Street",
  mission: "Now get a ping across to vesper.",
  notes: [],
  hints: [
    { text: "Your board only knows your own street." },
    { text: "Add a line for everywhere else." },
    {
      text: "Packets for other streets go to your default gateway: the router's door on your street.",
      codex: "default-gateway",
    },
    { text: "Add a default line that hands packets to crossing's door on your street, then ping vesper." },
    {
      text: "On the board choose `{crossingNave}` (or `ip route add default via {crossingNave}`), then `ping -c 3 {vesper}`.",
    },
  ],
  detectors: {
    "far-gateway": {
      note: "That door is on vesper's street. Your house can only hand letters to someone on its own.",
      tried: "You pointed your house at crossing's door on the far street, and the machine refused it.",
    },
    "gateway-is-vesper": {
      note: "That door is on vesper's street. Your house can only hand letters to someone on its own.",
      tried: "You pointed your house at vesper itself, on a street your house can't reach.",
    },
    "route-to-self": {
      note: "That's your own house. Who stands at the crossing?",
      tried: "You told your house to hand its letters to itself.",
    },
  },
  debrief: {
    happened:
      "Your house only knew its own street. You added a route, a line on its routing table: anything for elsewhere goes to `{crossingNave}`, your default gateway. Crossing passed your ping to vesper's street, and vesper answered the same way back.",
    terms: [
      {
        id: "default-gateway",
        term: "default gateway",
        meaning: "the router door that gets everything not for your own street",
      },
      {
        id: "routing-table",
        term: "routing table",
        meaning: "a machine's whole list of routes; a route is one line on it: for these addresses, send this way",
      },
    ],
  },
  memories: [],
  guardian: [
    { q: "Why the near door?", a: "You can only hand a letter to someone on your own street." },
    { q: "Does vesper need this too?", a: "Every answer is a letter too. Vesper has its way back. Not everyone will." },
    { q: "What is default?", a: "Everywhere you have no other word for." },
  ],
  fieldGuide: ["Routing boards", "Command book: ip route"],
};

export const directions: RoomText = {
  title: "Directions",
  mission: "Lumen lives up in the bell tower. Crossing doesn't go there.",
  notes: [],
  hints: [
    { text: "Read the error. Who sent it?" },
    { text: "Crossing has a routing board too. Ask it with `ip route`." },
    {
      text: "A router needs a route for every street it should reach; it can hand a packet to another router on a street it shares.",
      codex: "specific-route",
    },
    { text: "Give crossing a line for the bell tower's street, via arch's door on the cloister." },
    { text: "In crossing's room: `ip route add {tower} via {archCloister}`. Then ping lumen." },
  ],
  detectors: {
    "fix-my-house": {
      note: "Your house sends to crossing already. Read the message again: who said 'unreachable'?",
      tried: "You added a line on your own house's board, but crossing was the one with no way on.",
    },
    "via-far-door": {
      note: "Crossing can only hand letters to someone on a street it stands on.",
      tried: "You told crossing to hand letters to a door on the bell tower, a street it doesn't stand on.",
    },
  },
  debrief: {
    happened:
      "Your house sent the ping to crossing, as told. But crossing's board had no line for the bell tower, so it sent back 'Destination Net Unreachable'. A specific route on crossing, 'for {tower}, go via arch', gave it a way.",
    terms: [
      {
        id: "specific-route",
        term: "specific route",
        meaning: "a route for one particular street, instead of everywhere",
      },
    ],
  },
  guardian: [
    {
      q: "Who sent that message back?",
      a: "The crossing. It had nowhere to send your letter, so it told you.",
    },
    { q: "Do routers have boards too?", a: "Every navigator reads one. A navigator only knows what its board says." },
    {
      q: "Why not a default on crossing?",
      a: "You could. Then crossing would send everything it doesn't know to arch. Is that what you want?",
    },
  ],
  fieldGuide: [],
};

export const noWayBack: RoomText = {
  title: "No Way Back",
  mission: "Your pings to vesper vanish. No error, no answer, nothing.",
  notes: [],
  hints: [
    { text: "No error means nothing turned your letter back. Where did it go?" },
    { text: "The Slate can listen at doors now. Try one at each step." },
    { text: "A reply needs its own way back: the far house needs a route too.", codex: "return-path" },
    { text: "Find the door where requests arrive but nothing leaves, and give that house its way back." },
    {
      text: "Capture in vesper's room: requests arrive, nothing goes out. In vesper: `ip route add default via {crossingCloister}`.",
    },
  ],
  detectors: {
    "blame-the-sender": {
      note: "Your requests leave and cross. Listen further along.",
      tried: "You changed your own house's board, but your requests were already leaving and crossing.",
    },
    "blame-crossing": {
      note: "Crossing passes your requests through. Have you listened at vesper's door?",
      tried: "You changed crossing, but it was already passing your requests through.",
    },
  },
  debrief: {
    happened:
      "Your pings reached vesper, but vesper had no route back to your street, so its replies were never sent. Every conversation needs a way there and a way back: the return path. Listening at each door showed you exactly where it stopped.",
    terms: [{ id: "return-path", term: "return path", meaning: "the way the answers come back; it needs routes too" }],
  },
  guardian: [
    { q: "Why no error this time?", a: "The road was fine. The letter arrived. The answer was never written." },
    {
      q: "How do I know where it stops?",
      a: "Listen at each door along the way. Where you stop hearing it, look there.",
    },
  ],
  fieldGuide: ["Listening at doors", "Command book: tcpdump"],
};

export const sleepingKeeper: RoomText = {
  title: "The Sleeping Keeper",
  mission: "Crossing's navigator has stopped passing anything along. Your pings for vesper pile up at its lectern.",
  notes: [],
  hints: [
    { text: "Your packets reach the crossing and stop." },
    { text: "Try doing the navigator's job yourself, at the lectern." },
    { text: "A router only forwards if it's allowed to: that's a setting.", codex: "navigator" },
    { text: "Forward a packet or two by hand, then switch on the setting that lets crossing do it." },
    {
      text: "Unwrap, read the board (eth1), ask who has `{vesper}`, take one off the countdown, wrap to vesper's door, send. Then in crossing: `sysctl -w net.ipv4.ip_forward=1`.",
    },
  ],
  detectors: {
    "routes-again": {
      note: "The board is right. The navigator knows the way; it's just not allowed to go.",
      tried: "You changed a routing board, but every board was already right.",
    },
    "reuse-the-frame": {
      note: "A frame belongs to one street. Write a new one.",
      tried: "You sent the packet on in a frame addressed to crossing's own door on the nave.",
    },
    "skip-ttl": {
      note: "A navigator always takes one off. You'll see why soon.",
      tried: "You wrapped the packet as a house does, without taking one off its countdown.",
    },
  },
  debrief: {
    happened:
      "You did a router's job by hand: open the frame, read where the packet is going, look up the board, find the next door's name, take one off the countdown, wrap a new frame, send. Crossing knew how, but wasn't allowed: IP forwarding was off. Switching it on let it do all that for every packet.",
    terms: [
      {
        id: "ip-forwarding",
        term: "IP forwarding",
        meaning: "a machine's permission to pass packets between its doors; routers have it on",
      },
    ],
  },
  memories: [],
  guardian: [
    {
      q: "Why would a crossing refuse?",
      a: "Most machines must not pass along what isn't theirs. A crossing has to be told it may.",
    },
    { q: "Why make a new frame?", a: "A frame only crosses one street. Each street needs its own." },
    { q: "Why take one off the countdown?", a: "So nothing wanders forever. You'll see." },
  ],
  fieldGuide: [],
  voice: [
    {
      id: "F8-NAV-01",
      speaker: "navigator",
      text: "I remember. Every step. But I'm not allowed. Someone told me not to pass anything along.",
    },
    {
      id: "F8-NAV-02",
      speaker: "navigator",
      text: "This frame was for my door, on the nave. It can't walk the cloister.",
    },
  ],
};

export const closedCrossing: RoomText = {
  title: "The Closed Crossing",
  mission:
    "The great crossing between the nave and the bell tower has been barred for a hundred years. Get a ping from your house to lumen, and back.",
  notes: [],
  hints: [
    { text: "Four things are wrong, all along one road." },
    { text: "Walk the road one step at a time. Ask each machine's board, and listen at each door." },
    {
      text: "Every step needs a route onward, permission to forward, and a way back.",
      codex: "routing-board",
    },
    {
      text: "Your house, the first crossing, the second crossing, and lumen: check each one's board and permission.",
    },
    {
      text: "In your house: `ip route add default via {crossingNave}`. In crossing: `ip route add {tower} via {archCloister}`. In arch: `sysctl -w net.ipv4.ip_forward=1`. In lumen: `ip route del default`, then `ip route add default via {archTower}`.",
    },
  ],
  detectors: {
    "far-gateway": {
      note: "That door is on vesper's street. Your house can only hand letters to someone on its own.",
      tried: "You pointed your house at a door on the far street, and the machine refused it.",
    },
    "fix-my-house": {
      note: "Your house sends to crossing already. Read the message again: who said 'unreachable'?",
      tried: "You added a line for the bell tower on your own house's board, but the gap was further along.",
    },
    "via-far-door": {
      note: "Crossing can only hand letters to someone on a street it stands on.",
      tried: "You told crossing to hand letters to a door on the bell tower, a street it doesn't stand on.",
    },
    "blame-the-sender": {
      note: "Your requests leave and cross. Listen further along.",
      tried: "You took a line off your own house's board, but your requests were already leaving.",
    },
    "routes-again": {
      note: "The board is right. The navigator knows the way; it's just not allowed to go.",
      tried: "You changed arch's board, but its board was right. It wasn't allowed to pass things along.",
    },
    "one-direction": {
      note: "Lumen got it. What does lumen do with its answer?",
      tried: "Your request already reached lumen, and you kept changing the near side of the road.",
    },
  },
  debrief: {
    happened:
      "Four breaks along one road: your house had no gateway, crossing had no way to the tower, arch wasn't allowed to forward, and lumen's way back pointed at a door that doesn't exist. You walked the road, step by step, both ways.",
    terms: [],
  },
  voice: [
    {
      id: "F8-BOSS-01",
      speaker: "stone warden",
      text: "The great crossing. Barred. I stood here when they barred it. I don't remember why.",
    },
  ],
};

export const floor8: FloorText = {
  name: "Crossings",
  memory: [
    {
      id: "F8-FM-01",
      title: "The problem",
      text: "The town's streets could each talk to themselves. Not to each other. Every street, an island.",
    },
    {
      id: "F8-FM-02",
      title: "What they built",
      text: "So the cathedral folk built crossings. A machine standing on two streets, with a board of directions, and permission to carry letters across. Every house was told: if it's not for your street, give it to the crossing.",
    },
    {
      id: "F8-FM-03",
      title: "Ride-along",
      text: "New frame at every crossing. The letter inside, untouched.",
      shown:
        "the camera rides a ping from the observatory: the house's board says default, so the frame is addressed to crossing's door; at the lectern the frame falls away, the board is read, a new frame closes around the packet, the countdown ticks 64 → 63; out onto the cloister to vesper; and the reply back the same way",
    },
    {
      id: "F8-FM-04",
      title: "What's next",
      text: "Untouched… almost. Something changes on every crossing. Follow one all the way. Then you'll see what I see.",
      shown: "the world map: the cathedral's lower nave lit; Floor 9's great crossing in mist",
    },
  ],
  journal: {
    page: 8,
    title: "The navigator",
    where: "on the lectern in 8.5 (glows after the win)",
    text: "Spent an afternoon being a router. Open, read, look up, ask, count, wrap, send. Then do it all again backwards. When the navigator woke up and did it a thousand times a second, I sat down on the steps and laughed.",
  },
};
