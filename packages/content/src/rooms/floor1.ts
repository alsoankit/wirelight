import type { FloorText, RoomText } from "./types";

/** floors/floor-1.md, word for word. Placeholders: none. */

export const twoRooms: RoomText = {
  title: "First Contact",
  mission:
    "Messages keep arriving at your door, where your machine connects to its cable. Follow the corridor (the cable) to the machine sending them, and read the plate by its door.",
  notes: [],
  hints: [
    { text: "Each moving light is a message. Follow one back along the corridor to where it starts." },
    {
      text: "Walk out through your doorway. The corridor beyond it is the cable, and the room at its far end is another machine.",
    },
    {
      text: "Each door is one of a machine's network connections, and the plate beside it shows the door's name.",
      codex: "door",
    },
    { text: "Walk the corridor into the other room and read the plate on its door." },
    { text: "Click your doorway, walk to the far end, enter kitchen's room, and click the plate beside its door." },
  ],
  detectors: {
    "staying-put": {
      note: "Your plate only tells you about your own door. The messages come from the door at the other end of the corridor.",
      tried: "You read your own plate several times, but the messages came from the other end.",
    },
  },
  debrief: {
    happened:
      "The messages came from kitchen, along the cable, in through your door. On a real network that door is called a network interface: the place where a machine's cable plugs in. Every machine has at least one, and each has a name, like eth0.",
    terms: [
      {
        id: "interface",
        term: "interface",
        meaning: "a machine's connection to the network (a door here), with a name like eth0",
      },
    ],
  },
  memories: [
    {
      id: "F1-MEM-01",
      title: "Doors and plates",
      trigger: "on entering",
      text: "This door is where my machine connects to its cable. The plate beside it shows the door's name: eth0. The light is filled, so the cable works. I'll read the plate.",
      action: "click your own plate",
    },
    {
      id: "F1-MEM-02",
      title: "Walking",
      trigger: "first time near the doorway",
      text: "Corridors are cables, and I can walk them. The doorway leads into one. The other end is on the right.",
      action: "step into the corridor",
    },
  ],
  questions: [
    {
      q: "What is a door?",
      a: "Where a cable meets a machine. Every door has its own name.",
    },
    { q: "Why does the plate say eth0?", a: "That's the door's name. Every door on a machine has a different one." },
    { q: "What's at the other end?", a: "Another machine, another room. The cable only ever joins two doors." },
  ],
  building: {
    id: "F1-BLD-01",
    text: "Every door has a name on a plate beside it, so nobody mixes up one door with another.",
    shown: "plates being carved and set beside doors",
  },
  fieldGuide: ["Doors and plates"],
};

export const looseCable: RoomText = {
  title: "Unplugged",
  mission:
    "Messages from kitchen have stopped arriving, and the corridor (the cable) to it has gone dark. Find out what broke and get kitchen's messages through again.",
  notes: [],
  hints: [
    { text: "Look at the light on your door's plate, then at the corridor where it meets your door." },
    { text: "A cable has two ends, one at each door. Look at the end by your door." },
    { text: "A link only works when its cable is plugged in at both ends.", codex: "link-light" },
    { text: "Find the loose end on the floor by your door and plug it back in." },
    {
      text: "Click the loose cable end beside your door. It plugs back in (`lab cable plug eth0`), both lights come on, and kitchen's next message gets through.",
    },
  ],
  detectors: {
    "blaming-kitchen": {
      note: "Kitchen's light is out too. When the lights at both ends go dark together, look at the cable between them.",
      tried: "You looked at kitchen's door, but the trouble was the cable between you.",
    },
  },
  debrief: {
    happened:
      "The cable had come out of your door, so nothing could cross. Plugged in at both ends, it makes a link: a working connection between two doors. Real computers have a link light beside the cable socket too, and checking it is the first thing to do when a connection stops working.",
    terms: [
      { id: "link", term: "link", meaning: "a working connection between two doors through a cable" },
      { id: "link-light", term: "link light", meaning: "the light on a door that shows whether its link is working" },
    ],
  },
  memories: [
    {
      id: "F1-MEM-03",
      title: "Cables",
      trigger: "on first seeing the broken corridor",
      text: "That corridor's cracked: its cable isn't carrying anything. I'll check both ends.",
      action: "look at the cable where it meets your door",
    },
  ],
  questions: [
    {
      q: "Why is the corridor broken?",
      a: "It isn't carrying anything. Something between the two doors is wrong.",
    },
    { q: "Is kitchen broken?", a: "Kitchen's light is dark too. Both ends go dark when the line between them is cut." },
  ],
  building: {
    id: "F1-BLD-02",
    text: "Every door has a small light, so anyone can see at a glance whether the cable behind it works.",
    shown: "lights set into plates, glowing as the cable connects",
  },
  fieldGuide: ["Messages, corridors and marks"],
};

export const bothEnds: RoomText = {
  title: "Switched Off",
  mission:
    "The cable is plugged in at both ends, but kitchen's messages still don't get through. Find what's stopping them and fix it.",
  notes: [],
  hints: [
    { text: "Both lights are dark, but the cable is plugged in at both ends. Look at the doors themselves." },
    { text: "Doors can be switched off. Check both of them." },
    { text: "A link is up only when both doors are switched on and the cable is plugged in.", codex: "door-switch" },
    { text: "Go to kitchen's room and look closely at its door's plate." },
    {
      text: "In kitchen's room, click the switch on its plate (`ip link set eth0 up`). Both lights come on and the next message arrives.",
    },
  ],
  detectors: {
    replugging: {
      note: "The cable was fine. A link needs both doors switched on, too.",
      tried: "You unplugged and replugged the cable, but the cable had been fine all along.",
    },
  },
  debrief: {
    happened:
      "Kitchen's door was switched off. A link is up only when the cable is plugged in and both doors (interfaces) are switched on; if either is off, the link is down and carries nothing. On a real Linux machine, `ip link set eth0 up` switches an interface on, and that's what the switch on the plate runs.",
    terms: [
      {
        id: "link-up-down",
        term: "link up / down",
        meaning: "whether a door is switched on; a link that's down carries nothing",
      },
    ],
  },
  memories: [
    {
      id: "F1-MEM-04",
      title: "Door switches",
      trigger: "first time a plate's switch is seen",
      text: "Plates have a little switch. A door that's switched off can't send or receive anything.",
    },
  ],
  questions: [
    {
      q: "The cable is fine. Why doesn't it work?",
      a: "A cable has two doors, and both have to be switched on.",
    },
    {
      q: "Why is my light off when my door is on?",
      a: "Your light shows the whole link, not just your door. If the other end is off, yours goes dark too.",
    },
  ],
  building: {
    id: "F1-BLD-03",
    text: "Every door has a switch, so a door can be turned off without unplugging anything. Someone switched this one off and never switched it back on.",
    shown: "switches set into plates; one left off, gathering dust",
  },
  fieldGuide: ["Doors and plates"],
};

export const darkCorridor: RoomText = {
  title: "Bring the Line Back",
  mission: "You and kitchen can't reach each other, and more than one thing is wrong. Get messages through again.",
  notes: [],
  hints: [
    { text: "More than one thing is wrong. Check every end and every door." },
    { text: "Two doors, two cable ends. Visit both rooms." },
    { text: "A link needs the cable in at both ends and both doors on.", codex: "cable-end" },
    { text: "Switch your door on, then go to kitchen's room, plug its end in and switch its door on." },
    {
      text: "Click the switch on your plate (`ip link set eth0 up`). Then in kitchen's room, click its loose cable end (`lab cable plug eth0`) and the switch on its plate (`ip link set eth0 up`). Kitchen's next message gets through.",
    },
  ],
  detectors: {
    "blaming-kitchen": {
      note: "Kitchen's light is out too. When the lights at both ends go dark together, check every door and both cable ends.",
      tried: "You looked at kitchen's door while the cable was still out.",
    },
    replugging: {
      note: "The cable was fine. A link needs both doors switched on, too.",
      tried: "You unplugged and replugged a cable end that was already in.",
    },
    "one-fix-only": {
      note: "One thing's fixed, but the link is still down. Check both doors and both cable ends again.",
      tried: "You fixed one thing and waited, but more than one thing was wrong.",
    },
  },
  debrief: {
    happened:
      "Three things were wrong at once: your interface was off, kitchen's interface was off, and the cable was out at kitchen's end. A link only comes up when the cable is plugged in at both ends and both interfaces are on. Checking each of those in turn is how real network faults get found.",
    terms: [],
  },
  voice: [
    {
      id: "F1-BOSS-01",
      speaker: "You",
      text: "The corridor to kitchen is completely dark. More than one thing must be broken.",
    },
  ],
};

export const floor1: FloorText = {
  name: "Cables and Links",
  memory: [
    {
      id: "F1-FM-01",
      title: "The problem",
      text: "Memory restored. Two machines, far apart, that needed to talk, and nothing between them.",
    },
    {
      id: "F1-FM-02",
      title: "What they built",
      text: "So a cable was laid, door to door. A door at each end, each with a name. A light to show the cable works. A switch to turn a door off and on.",
    },
    {
      id: "F1-FM-03",
      title: "Ride-along",
      text: "Plugged in at both ends, both doors on. That's all a link needs.",
      shown:
        "the camera rides kitchen's message from its keeper, out through its door (the light blinks), along the glowing thread, into your door",
    },
    {
      id: "F1-FM-04",
      title: "What's next",
      text: "But a cable only carries messages. It doesn't know who a message is for. That's the next floor.",
    },
  ],
  journal: {
    page: 1,
    title: "The first hall",
    where: "hidden in the roots of the corridor in 1.2 (glows faintly when you walk the corridor)",
    text: "Log 3,140. Kitchen stopped answering today, the first time in years. The cable from my room to its room looks fine. Checking again tomorrow.",
  },
};
