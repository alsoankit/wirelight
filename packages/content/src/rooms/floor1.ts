import type { FloorText, RoomText } from "./types";

/** floors/floor-1.md, word for word. Placeholders: none. */

export const twoRooms: RoomText = {
  title: "Two Rooms, One Cable",
  mission: "Something keeps arriving at your door. Follow it back and find out where it comes from.",
  notes: [],
  hints: [
    { text: "Where do those lights come from?" },
    { text: "Doors lead to corridors, and corridors lead to other rooms." },
    { text: "Every door has a plate that tells you whose door it is.", codex: "door" },
    { text: "Walk the corridor into the other room and read the plate on its door." },
    { text: "Click your doorway, walk to the far end, enter lantern's room, and click the plate beside its door." },
  ],
  detectors: {
    "staying-put": {
      note: "Your plate tells you about your door. What about the one at the other end?",
      tried: "You read your own plate several times, but the messages came from the other end.",
    },
  },
  debrief: {
    happened:
      "The messages came from lantern, down the cable, through your door. Every machine has at least one door, with a name like eth0. That door is where its cable plugs in.",
    terms: [{ id: "interface", term: "interface", meaning: "a machine's network door, with a name like eth0" }],
  },
  memories: [
    {
      id: "F1-MEM-01",
      title: "Doors and plates",
      trigger: "on entering",
      text: "Every door has a plate beside it. The plate tells you that door's name. This one says eth0. And see the light? Filled means the cable behind it works. Go on, click the plate.",
      action: "click your own plate",
    },
    {
      id: "F1-MEM-02",
      title: "Walking",
      trigger: "first time near the doorway",
      text: "Corridors are cables. You can walk them. Click the doorway, and the other end is on your right.",
      action: "step into the corridor",
    },
  ],
  guardian: [
    {
      q: "What is a door?",
      a: "Where a cable meets a machine. I remember the weavers carving them… each one with its own name.",
    },
    { q: "Why does the plate say eth0?", a: "That's the door's name. Every door on a machine has a different one." },
    { q: "What's at the other end?", a: "Another machine, another room. The cable only ever joins two doors." },
  ],
  building: {
    id: "F1-BLD-01",
    text: "The weavers gave every door a name, carved into a plate beside it, so nobody would mix up one door with another.",
    shown: "plates being carved and set beside doors",
  },
  fieldGuide: ["Doors and plates"],
};

export const looseCable: RoomText = {
  title: "The Loose Cable",
  mission: "Nothing arrives at your door anymore. The corridor has gone dark and cracked.",
  notes: [],
  hints: [
    { text: "Look at your door's light, then at the corridor." },
    { text: "A cable has two ends. Look at the one by your door." },
    { text: "A link only works when its cable is plugged in at both ends.", codex: "link-light" },
    { text: "Find the loose end on the floor by your door and plug it back in." },
    {
      text: "Click the loose cable end beside your door. It plugs back in (`lab cable plug eth0`), both lights come on, and lantern's next message gets through.",
    },
  ],
  detectors: {
    "blaming-lantern": {
      note: "Lantern's light is out too. Is it lantern, or something between you?",
      tried: "You looked at lantern's door, but the trouble was the cable between you.",
    },
  },
  debrief: {
    happened:
      "The cable had come out of your door, so nothing could cross. Plugged back in, the link came up: both lights turned on, and messages flowed again.",
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
      text: "When a corridor cracks like that, its cable isn't carrying anything. Check both ends.",
      action: "look at the cable where it meets your door",
    },
  ],
  guardian: [
    {
      q: "Why is the corridor broken?",
      a: "It isn't carrying anything. Something between the two doors… I can't remember what.",
    },
    { q: "Is lantern broken?", a: "Lantern's light is dark too. Both ends go dark when the line between them is cut." },
  ],
  building: {
    id: "F1-BLD-02",
    text: "The weavers set a small light by every door, so anyone could see at a glance if the thread behind it still carried.",
    shown: "lights set into plates, glowing as the cable connects",
  },
  fieldGuide: ["Messages, corridors and marks"],
};

export const bothEnds: RoomText = {
  title: "Both Ends",
  mission: "The cable is plugged in at both ends, but nothing gets through.",
  notes: [],
  hints: [
    { text: "Both lights are dark, but the cable is plugged in. What else could be off?" },
    { text: "Doors can be switched off. Check both of them." },
    { text: "A link is up only when both doors are switched on and the cable is plugged in.", codex: "door-switch" },
    { text: "Go to lantern's room and look closely at its door's plate." },
    {
      text: "In lantern's room, click the switch on its plate (`ip link set eth0 up`). Both lights come on and the next message arrives.",
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
      "Lantern's door was switched off. A link is only up when the cable is plugged in and both doors are on. You switched it on, and the messages came back.",
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
      text: "Plates have a little switch. I flipped mine off once to see what would happen. Nothing happened, which was the point.",
    },
  ],
  guardian: [
    {
      q: "The cable is fine. Why doesn't it work?",
      a: "A cable has two doors. Both have to be… open? Awake? Something like that.",
    },
    {
      q: "Why is my light off when my door is on?",
      a: "Your light shows the whole link, not just your door. If the other end is off, yours goes dark too.",
    },
  ],
  building: {
    id: "F1-BLD-03",
    text: "Every door got a switch, so a machine could rest its door without unplugging anything. They always meant to switch them back on…",
    shown: "switches set into plates; one left off, gathering dust",
  },
  fieldGuide: ["Doors and plates"],
};

export const darkCorridor: RoomText = {
  title: "The Dark Corridor",
  mission: "Lantern hasn't heard from anyone in years, and you can't hear lantern. Bring the line back.",
  notes: [],
  hints: [
    { text: "More than one thing is wrong. Check every end and every door." },
    { text: "Two doors, two cable ends. Visit both rooms." },
    { text: "A link needs the cable in at both ends and both doors on.", codex: "cable-end" },
    { text: "Switch your door on, then go to lantern's room, plug its end in and switch its door on." },
    {
      text: "Click the switch on your plate (`ip link set eth0 up`). Then in lantern's room, click its loose cable end (`lab cable plug eth0`) and the switch on its plate (`ip link set eth0 up`). Lantern's next message brings the key.",
    },
  ],
  detectors: {
    "blaming-lantern": {
      note: "Lantern's light is out too. Is it lantern, or something between you?",
      tried: "You looked at lantern's door while the cable was still out.",
    },
    replugging: {
      note: "The cable was fine. A link needs both doors switched on, too.",
      tried: "You unplugged and replugged a cable end that was already in.",
    },
    "one-fix-only": {
      note: "One thing's fixed. Look again: both doors, both ends.",
      tried: "You fixed one thing and waited, but more than one thing was wrong.",
    },
  },
  debrief: {
    happened:
      "Three things were wrong at once: your door, lantern's door and the cable's far end. A link only works when all of them are right. You checked everything.",
    terms: [],
  },
  voice: [
    {
      id: "F1-BOSS-01",
      speaker: "moss spirit",
      text: "This is the longest corridor in the old halls. It's been dark for as long as I can remember.",
    },
  ],
};

export const floor1: FloorText = {
  name: "The Wire",
  memory: [
    {
      id: "F1-FM-01",
      title: "The problem",
      text: "I remember now. Two machines, far apart, that needed to talk, and nothing between them.",
    },
    {
      id: "F1-FM-02",
      title: "What they built",
      text: "So the weavers dug a corridor and laid a thread of copper along it, door to door. A door at each end, each with a name. A light to show the thread was alive. A switch to rest a door.",
    },
    {
      id: "F1-FM-03",
      title: "Ride-along",
      text: "Plugged in at both ends, both doors on. That's all a link needs.",
      shown:
        "the camera rides lantern's message from its keeper, out through its door (the light blinks), along the glowing thread, into your door",
    },
    {
      id: "F1-FM-04",
      title: "What's next",
      text: "But a thread only carries. It doesn't know who a message is for. The weavers needed something more… I'll remember, when you get there.",
    },
  ],
  journal: {
    page: 1,
    title: "The first hall",
    where: "hidden in the roots of the corridor in 1.2 (glows faintly when you walk the corridor)",
    text: "Found the old halls today. Everything dark. There's a cable running out of the room I'm calling my observatory. I followed it. Someone's at the other end, and they still answer if you ask nicely.",
  },
};
