import type { FloorText, RoomText } from "./types";

/**
 * floors/floor-8.md, word for word. Placeholders come from the rooms' `vars` (0055): {observatory},
 * {crossingNave}, {crossingCloister}, {archCloister}, {archTower}, {gallery}, {belfry}, {tower},
 * {nowhere}; in 8.5 also the door names {crossingNaveDoor}, {vesperDoor}, {observatoryDoor}.
 *
 * Two words are kept out of these rooms on purpose: "TTL" (taught in 9.3; 8.5 says "countdown") and
 * anything quoting `icmp_seq` (ICMP is taught in 9.3).
 */

export const otherStreet: RoomText = {
  title: "Next Door Over",
  mission: "Gallery is on the next subnet, and you can't reach it. Find the machine that stands between you.",
  notes: [],
  hints: [
    { text: "Who has a door on both subnets?" },
    { text: "Walk to the room between you and gallery. Read its plates." },
    {
      text: "A router has a door on each subnet it joins; each door has an address on its own subnet.",
      codex: "router",
    },
    { text: "Ping crossing's door on your subnet from your house, and its other door from gallery's." },
    { text: "From the observatory: `ping -c 1 {crossingNave}`. From gallery: `ping -c 1 {crossingCloister}`." },
  ],
  detectors: {
    "same-street-trick": {
      note: "Now you can't reach your own subnet. A machine on both subnets joins them so you don't have to move.",
      tried:
        "You moved your house onto gallery's subnet, but a machine on both subnets joins them so nobody has to move.",
    },
    "far-door-from-here": {
      note: "That's crossing's door on the other subnet. Which of its doors is on yours?",
      tried: "You kept pinging crossing's door on the far subnet, which your house can't reach yet.",
    },
  },
  debrief: {
    happened:
      "Crossing has a door on your subnet and a door on gallery's. Each subnet can reach the door on its own side. A machine like that, which passes packets between subnets, is a router.",
    terms: [
      {
        id: "router",
        term: "router",
        meaning: "a machine with doors on more than one street that passes packets between them",
      },
    ],
  },
  guardian: [
    { q: "What is this room?", a: "A machine with one foot on each subnet." },
    { q: "Why two addresses?", a: "One door on each subnet. Each door's address belongs to the subnet it stands on." },
    { q: "Can I reach gallery now?", a: "Not yet. Your house doesn't know the crossing is here." },
  ],
  fieldGuide: ["Routers and crossings"],
};

export const acrossTheStreet: RoomText = {
  title: "Get Across",
  mission: "Now get a ping across to gallery.",
  notes: [],
  hints: [
    { text: "Your routing board only knows your own subnet." },
    { text: "Add a line for everywhere else." },
    {
      text: "Packets for other subnets go to your default gateway: the router's door on your subnet.",
      codex: "default-gateway",
    },
    { text: "Add a default line that hands packets to crossing's door on your subnet, then ping gallery." },
    {
      text: "On the board choose `{crossingNave}` (or `ip route add default via {crossingNave}`), then `ping -c 3 {gallery}`.",
    },
  ],
  detectors: {
    "far-gateway": {
      note: "That door is on gallery's subnet. Your house can only hand packets to a machine on its own subnet.",
      tried: "You pointed your house at crossing's door on the far subnet, and the machine refused it.",
    },
    "gateway-is-gallery": {
      note: "That door is on gallery's subnet. Your house can only hand packets to a machine on its own subnet.",
      tried: "You pointed your house at gallery itself, on a subnet your house can't reach.",
    },
    "route-to-self": {
      note: "That's your own house. Which router is on your subnet?",
      tried: "You told your house to hand its packets to itself.",
    },
  },
  debrief: {
    happened:
      "Your house only knew its own subnet. You added a route, a line in its routing table: anything for elsewhere goes to `{crossingNave}`, your default gateway. The router passed your ping to gallery's subnet, and gallery answered the same way back.",
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
    { q: "Why the near door?", a: "You can only hand a packet to a machine on your own subnet." },
    {
      q: "Does gallery need this too?",
      a: "Every answer is a packet too. Gallery has its way back. Not everyone will.",
    },
    { q: "What is default?", a: "Everywhere you have no other word for." },
  ],
  fieldGuide: ["Routing boards", "Command book: ip route"],
};

export const directions: RoomText = {
  title: "No Way There",
  mission: "Belfry is on the bell tower's subnet, and your pings reach crossing but go no further. Find out why.",
  notes: [],
  hints: [
    { text: "Read the error. Who sent it?" },
    { text: "Crossing is a router, so it has a routing table too. Ask it with `ip route`." },
    {
      text: "A router needs a route for every subnet it should reach; it can hand a packet to another router on a subnet they share.",
      codex: "specific-route",
    },
    { text: "Give crossing a route for the bell tower's subnet, via arch's door on the cloister." },
    { text: "In crossing's room: `ip route add {tower} via {archCloister}`. Then ping belfry." },
  ],
  detectors: {
    "fix-my-house": {
      note: "Your house sends to crossing already. Read the message again: which router said 'unreachable'?",
      tried: "You added a route on your own house, but crossing was the router with no way on.",
    },
    "via-far-door": {
      note: "Crossing can only hand packets to a machine on a subnet it has a door on.",
      tried: "You told crossing to hand packets to a door on the bell tower's subnet, where it has no door.",
    },
  },
  debrief: {
    happened:
      "Your house sent the ping to crossing, as told. But crossing's routing table had no route for the bell tower, so it sent back 'Destination Net Unreachable'. A specific route on crossing, 'for {tower}, go via arch', gave it a way.",
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
      a: "The router, crossing. It had nowhere to send your packet, so it told you.",
    },
    { q: "Do routers have boards too?", a: "Every router reads its routing table. It only knows what the table says." },
    {
      q: "Why not a default route on crossing?",
      a: "You could. Then crossing would send everything it doesn't know to arch. Is that what you want?",
    },
  ],
  fieldGuide: [],
};

export const noWayBack: RoomText = {
  title: "No Way Back",
  mission: "Your pings to gallery get no reply and no error message. Find out where they stop.",
  notes: [],
  hints: [
    { text: "No error means nothing turned your packet back. Where did it go?" },
    { text: "The Scanner can listen at doors now. Try one at each step." },
    { text: "A reply needs its own way back: the far house needs a route too.", codex: "return-path" },
    { text: "Find the door where requests arrive but nothing leaves, and give that house its way back." },
    {
      text: "Capture in gallery's room: requests arrive, nothing goes out. In gallery: `ip route add default via {crossingCloister}`.",
    },
  ],
  detectors: {
    "blame-the-sender": {
      note: "Your requests leave and cross. Listen further along.",
      tried: "You changed your own routing table, but your requests were already leaving and getting through crossing.",
    },
    "blame-crossing": {
      note: "Crossing passes your requests through. Have you listened at gallery's door?",
      tried: "You changed crossing, but it was already passing your requests through.",
    },
  },
  debrief: {
    happened:
      "Your pings reached gallery, but gallery had no route back to your subnet, so its replies were never sent. Every conversation needs a way there and a way back: the return path. Listening at each door showed you exactly where it stopped.",
    terms: [{ id: "return-path", term: "return path", meaning: "the way the answers come back; it needs routes too" }],
  },
  guardian: [
    { q: "Why no error this time?", a: "The road was fine. The packet arrived. The reply was never sent." },
    {
      q: "How do I know where it stops?",
      a: "Listen at each door along the way. Where you stop hearing it, look there.",
    },
  ],
  fieldGuide: ["Listening at doors", "Command book: tcpdump"],
};

export const sleepingKeeper: RoomText = {
  title: "Not Allowed",
  mission: "Crossing's keeper has stopped passing anything along. Your pings for gallery pile up at its desk.",
  notes: [],
  hints: [
    { text: "Your packets reach the router, crossing, and stop." },
    { text: "Try doing the keeper's job yourself, at the desk." },
    { text: "A router only forwards if it's allowed to: that's a setting.", codex: "navigator" },
    { text: "Forward a packet or two by hand, then switch on the setting that lets crossing do it." },
    {
      text: "Unwrap, read the routing table (eth1), ask who has `{gallery}` (ARP), take one off the countdown, wrap to gallery's MAC address, send. Then in crossing: `sysctl -w net.ipv4.ip_forward=1`.",
    },
  ],
  detectors: {
    "routes-again": {
      note: "The routing table is right. The router knows the way; it just isn't allowed to pass packets on.",
      tried: "You changed a routing board, but every board was already right.",
    },
    "reuse-the-frame": {
      note: "A frame belongs to one subnet. Write a new one.",
      tried: "You sent the packet on in a frame addressed to crossing's own door on the nave.",
    },
    "skip-ttl": {
      note: "A router always takes one off. You'll see why soon.",
      tried: "You wrapped the packet as a house does, without taking one off its countdown.",
    },
  },
  debrief: {
    happened:
      "You did a router's job by hand: open the frame, read where the packet is going, look up the routing table, find the next door's MAC address, take one off the countdown, wrap a new frame, send. Crossing knew how, but wasn't allowed: IP forwarding was off. Switching it on let it do all that for every packet.",
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
      q: "Why would a router refuse?",
      a: "Most machines must not pass along packets that aren't theirs. A router has to be told it may.",
    },
    { q: "Why make a new frame?", a: "A frame only crosses one subnet. Each subnet needs its own frame." },
    { q: "Why take one off the countdown?", a: "So nothing wanders forever. You'll see." },
  ],
  fieldGuide: [],
  voice: [
    {
      id: "F8-NAV-01",
      speaker: "You",
      text: "Its screen says it knows every step. But it isn't allowed to pass anything along. Someone switched that off.",
    },
    {
      id: "F8-NAV-02",
      speaker: "You",
      text: "This frame was for its door on the nave. A frame can't cross into the cloister.",
    },
  ],
};

export const closedCrossing: RoomText = {
  title: "The Blocked Crossing",
  mission:
    "Several things block the way from the nave to the bell tower. Get a ping from your house to belfry, and a reply back.",
  notes: [],
  hints: [
    { text: "Four things are wrong, all along one road." },
    { text: "Walk the road one step at a time. Read each machine's routing table, and listen at each door." },
    {
      text: "Every step needs a route onward, permission to forward, and a way back.",
      codex: "routing-board",
    },
    {
      text: "Your house, the first router, the second router, and belfry: check each one's routing table and whether it may forward.",
    },
    {
      text: "In your house: `ip route add default via {crossingNave}`. In crossing: `ip route add {tower} via {archCloister}`. In arch: `sysctl -w net.ipv4.ip_forward=1`. In belfry: `ip route del default`, then `ip route add default via {archTower}`.",
    },
  ],
  detectors: {
    "far-gateway": {
      note: "That door is on gallery's subnet. Your house can only hand packets to a machine on its own subnet.",
      tried: "You pointed your house at a door on the far subnet, and the machine refused it.",
    },
    "fix-my-house": {
      note: "Your house sends to crossing already. Read the message again: which router said 'unreachable'?",
      tried: "You added a route for the bell tower on your own house, but the gap was further along.",
    },
    "via-far-door": {
      note: "Crossing can only hand packets to a machine on a subnet it has a door on.",
      tried: "You told crossing to hand packets to a door on the bell tower's subnet, where it has no door.",
    },
    "blame-the-sender": {
      note: "Your requests leave and cross. Listen further along.",
      tried: "You took a route off your own house, but your requests were already leaving.",
    },
    "routes-again": {
      note: "The routing table is right. The router knows the way; it just isn't allowed to pass packets on.",
      tried: "You changed arch's routing table, but it was right. Arch wasn't allowed to forward.",
    },
    "one-direction": {
      note: "Belfry got it. What does belfry do with its answer?",
      tried: "Your request already reached belfry, and you kept changing the near side of the road.",
    },
  },
  debrief: {
    happened:
      "Four breaks along one road: your house had no default gateway, crossing had no route to the tower, arch wasn't allowed to forward, and belfry's way back pointed at a door that doesn't exist. You walked the road, step by step, both ways.",
    terms: [],
  },
  voice: [
    {
      id: "F8-BOSS-01",
      speaker: "You",
      text: "The main router between the nave and the bell tower. Nothing gets through it.",
    },
  ],
};

export const floor8: FloorText = {
  name: "Crossings",
  memory: [
    {
      id: "F8-FM-01",
      title: "The problem",
      text: "Memory restored. The town's streets could each talk among themselves, but not to each other. Every street, an island.",
    },
    {
      id: "F8-FM-02",
      title: "What they built",
      text: "So crossings were built: a machine standing on two streets, with a board of directions and permission to carry letters across. Every house was told: if it's not for your street, give it to the crossing.",
    },
    {
      id: "F8-FM-03",
      title: "Ride-along",
      text: "New frame at every crossing. The letter inside, untouched.",
      shown:
        "the camera rides a ping from the observatory: the house's board says default, so the frame is addressed to crossing's door; at the desk the frame falls away, the board is read, a new frame closes around the packet, the countdown ticks 64 → 63; out onto the cloister to gallery; and the reply back the same way",
    },
    {
      id: "F8-FM-04",
      title: "What's next",
      text: "Untouched, almost. Something changes at every crossing. Following one all the way will show it.",
      shown: "the world map: the cathedral's lower nave lit; Floor 9's great crossing in mist",
    },
  ],
  journal: {
    page: 8,
    title: "The crossing's keeper",
    where: "on the desk in 8.5 (glows after the win)",
    text: "Log 3,380. The crossing's keeper was told not to pass anything along. I did its job by hand for an afternoon: open, read, look up, ask, count, wrap, send. It does that a thousand times a second.",
  },
};
