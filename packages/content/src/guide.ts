/**
 * The Field Guide: how to play, always one key away (DESIGN_NOTES D18).
 *
 * It teaches the GAME (layout, controls, how to read the world), never the networking ideas a room is
 * about to teach (P-9). Topics about objects appear from the room where the player first meets them,
 * the same moment their discovery card would. Keep adding topics as new rooms, objects and tools arrive.
 */

/** Things a room picture can point at. */
export type GuideTarget = "door" | "plate" | "keeper" | "glass" | "gate" | "workbench" | "cable";

export interface Mark<T extends string> {
  target: T;
  label: string;
}

/** The picture shown above a topic's text. The web app draws each kind from the real game art. */
export type GuideVisual =
  | { kind: "room"; marks: Mark<GuideTarget>[] /** Animate a pointer clicking this target. */; click?: GuideTarget }
  | { kind: "corridor"; marks: Mark<"back" | "on" | "message" | "cable">[] }
  | { kind: "lights"; items: Mark<"message" | "dark" | "lit" | "broken" | "mark">[] }
  | { kind: "glass"; marks: Mark<"you" | "room" | "corridor" | "message">[] }
  | { kind: "ruins"; before: string; after: string }
  | { kind: "plate"; on: string; off: string; address: string }
  | { kind: "console"; lines: { text: string; tone: "prompt" | "echo" | "out" | "lab" | "note" }[]; caption: string }
  | { kind: "controls"; marks: Mark<"pause" | "speed" | "glass" | "reset">[] }
  | { kind: "notes"; note: string; caption: string };

export interface GuideTopic {
  id: string;
  title: string;
  /** Short line for the menu. */
  blurb: string;
  visual?: GuideVisual;
  /** Paragraphs. `[[key]]` renders as a key cap. */
  body: string[];
  /** Shown from this room on (by room id). Omit for "from the very start". */
  from?: string;
}

export const guide: GuideTopic[] = [
  {
    id: "welcome",
    title: "Welcome to the dungeon",
    blurb: "What this place is and what you're doing here",
    visual: {
      kind: "room",
      marks: [
        { target: "door", label: "A door. A cable plugs in here." },
        { target: "cable", label: "The cable, running from the door to the keeper" },
        { target: "keeper", label: "The keeper, who handles every message" },
        { target: "glass", label: "The Scrying Glass" },
        { target: "gate", label: "The gate onward. It opens when the room works." },
      ],
    },
    body: [
      "This dungeon is a computer network. Every room is a machine. Every door is where a cable plugs into that machine. Every corridor is a cable between two doors.",
      "The network has fallen into ruin. Rooms are cold and dark until they work again. Your job is to bring them back, one room at a time, using the same tools people use on real Linux machines.",
      "There's no score, no timer and no way to lose. Trying things is how you learn here.",
    ],
  },
  {
    id: "room",
    title: "How a room is laid out",
    blurb: "Doors, the keeper, and where things are",
    visual: {
      kind: "room",
      marks: [
        { target: "door", label: "Doors: always on the back-left wall" },
        { target: "plate", label: "A plate beside every door" },
        { target: "keeper", label: "The keeper, in the middle, facing the doors" },
        { target: "glass", label: "The Glass (Observatory only)" },
        { target: "gate", label: "The gate and its lock (Observatory only)" },
        { target: "workbench", label: "The workbench (some rooms)" },
      ],
    },
    body: [
      "You see each room from above, with the front wall taken away so the whole room fits on screen. Every room of the same kind is laid out the same way, so you only have to learn it once.",
      "Doors are on the back-left wall. Next to each door hangs a plate. The keeper, a small brass figure, stands in the middle facing the doors.",
      "Your own machine is called the Observatory. It was the Knight's base. It has a few extra things: the Glass on the back-right wall, a gate that leads onward, and sometimes a workbench.",
    ],
  },
  {
    id: "looking",
    title: "Looking at things",
    blurb: "Click anything to read it",
    visual: {
      kind: "room",
      click: "plate",
      marks: [
        { target: "plate", label: "Click a plate to read it" },
        { target: "keeper", label: "Click the keeper to ask what it did" },
        { target: "glass", label: "Click the Glass to open it" },
      ],
    },
    body: [
      "Click an object to look at it closely. The room blurs and the object opens as a panel you can read. Press [[Esc]] or click outside the panel to step back.",
      "Most things can be reached with the keyboard too: [[Tab]] moves between them and [[Enter]] opens one.",
      "When you do something in a panel, like sending a message, the panel closes straight away so you can watch what happens.",
    ],
  },
  {
    id: "moving",
    title: "Getting around",
    blurb: "Doors, corridors, and walking between rooms",
    visual: {
      kind: "corridor",
      marks: [
        { target: "back", label: "The door you came in by: ← or Esc" },
        { target: "on", label: "The other end: →" },
        { target: "message", label: "Messages pass you here" },
      ],
    },
    body: [
      "Click a doorway to step into the corridor behind it. Number keys work too: [[1]] goes through the first door, [[2]] the second, and so on.",
      "In a corridor, the room you came from is on the left and the other end is on the right. Click either end, or press [[←]] to go back and [[→]] to go on. [[Esc]] also takes you back.",
      "Some rooms are closed. The corridor tells you why when you reach their door.",
    ],
  },
  {
    id: "messages",
    title: "Messages, corridors and marks",
    blurb: "What the lights in the world mean",
    visual: {
      kind: "lights",
      items: [
        { target: "message", label: "A message" },
        { target: "dark", label: "Dark: nothing has gone there and back yet" },
        { target: "lit", label: "Lit: a message crossed and an answer came back" },
        { target: "broken", label: "Broken: the cable isn't working" },
        { target: "mark", label: "A message was lost here" },
      ],
    },
    body: [
      "Messages are small orbs of light. You can see them because the Seer gave you the sight when you first arrived. Hover over one to read a one-line summary of it.",
      "Corridors show their state. Dark means nothing has made it there and back yet. Lit means a message crossed and an answer came back. Broken (cracked and flickering) means the cable isn't working.",
      "A faded ring with a cross marks the spot where a message was lost. It never tells you why. Finding out is up to you.",
    ],
  },
  {
    id: "glass",
    title: "The Scrying Glass",
    blurb: "A live map of the whole floor",
    visual: {
      kind: "glass",
      marks: [
        { target: "you", label: "Where you are" },
        { target: "room", label: "Another room" },
        { target: "corridor", label: "A corridor, with its state" },
        { target: "message", label: "A message on its way" },
      ],
    },
    body: [
      "The Glass shows the whole floor from above: every room, every corridor, and every message moving through it. Press [[G]] to open it from anywhere, or click the small Glass in the corner.",
      "You can watch anything through the Glass, but you can't change anything through it. To do something, go to the room where it belongs.",
      "A ring marks where you are.",
    ],
  },
  {
    id: "ruins",
    title: "Ruins and light",
    blurb: "Why rooms are grey, and how they come back",
    visual: { kind: "ruins", before: "In ruins", after: "Restored" },
    body: [
      "A room that doesn't work is a ruin: cold, grey and dusty. When you fix what's wrong, warm light spreads out from the thing you fixed.",
      "If you break it again, the room fades again. The room always shows how the network really is.",
    ],
  },
  {
    id: "time",
    title: "Time",
    blurb: "Pausing and changing speed",
    visual: {
      kind: "controls",
      marks: [
        { target: "pause", label: "Pause and resume ([[Space]])" },
        { target: "speed", label: "Slower or faster" },
        { target: "glass", label: "Open the Glass ([[G]])" },
        { target: "reset", label: "Put the room back the way it started" },
      ],
    },
    body: [
      "Messages move slowly on purpose so you can follow them. Real networks are much faster.",
      "Press [[Space]] to pause or resume. The speed buttons at the top right run time slower or faster.",
    ],
  },
  {
    id: "stuck",
    title: "When you're stuck",
    blurb: "The Knight's notes and starting over",
    visual: {
      kind: "notes",
      note: "Your message reached their door. They looked at it and decided it wasn't for them. Whose name did you write on it?",
      caption: "A Knight's note reacting to something you tried",
    },
    body: [
      "Long ago a Knight explored this dungeon and left notes behind. They appear at the top right. Some react to what you just tried.",
      "Reset room puts the room back the way it started. Your notes and what you've learned stay.",
      "Getting something wrong costs nothing. Often it's the fastest way to see what's going on.",
    ],
  },
  {
    id: "console",
    title: "The console",
    blurb: "Where commands run",
    visual: {
      kind: "console",
      caption: "After you send from the workbench, the console shows the command it ran.",
      lines: [
        { text: 'lab send-frame --to 02:00:00:00:00:07 --msg "hello"', tone: "echo" },
        { text: "lab tools exist only in Wirelight — real Linux doesn't have this command.", tone: "note" },
        { text: "sent 1 frame (to 02:00:00:00:00:07, 19 bytes)", tone: "lab" },
        { text: "", tone: "prompt" },
      ],
    },
    from: "f0.r1-first-light",
    body: [
      "Every machine has a console: its command line. Press [[`]] (the key above Tab) to open or close it.",
      "Commands run on the machine whose room you're in. The Glass has no console.",
      "When you click to do something, the console shows the real command that click ran, marked with ↳. For now the console only shows these. Later you'll type your own.",
      "Commands that start with lab are Wirelight's own tools and show in purple. Everything else works the same on a real Linux machine.",
    ],
  },
  {
    id: "plates",
    title: "Doors and plates",
    blurb: "How to find a machine's address",
    visual: {
      kind: "plate",
      on: "Light on: the cable works",
      off: "Light off: it doesn't",
      address: "02:00:00:00:00:07",
    },
    from: "f0.r1-first-light",
    body: [
      "Every door has a plate beside it. The plate shows the door's name (like eth0), its address, and a light.",
      "The address on the plate is the door's MAC address: six pairs of characters like 02:00:00:00:00:07. It belongs to that one door.",
      "To find out a machine's address, walk to its room and read the plate on its door. Click a plate to read it up close; you can copy the address from there.",
      "The light is a filled diamond when the cable is working and a hollow ring when it isn't.",
    ],
  },
  {
    id: "workbench",
    title: "The workbench",
    blurb: "Building a message by hand",
    visual: {
      kind: "room",
      click: "workbench",
      marks: [
        { target: "workbench", label: "The workbench: click it to build a frame" },
        { target: "door", label: "Your frame leaves through here" },
      ],
    },
    from: "f0.r1-first-light",
    body: [
      "The workbench in the Observatory builds a frame, the envelope a message travels in. Write who it's for, add a message, then seal and send it.",
      "The bench keeps what you wrote, so you can come back and change it.",
    ],
  },
  {
    id: "keeper",
    title: "The keeper",
    blurb: "Asking a machine what it did",
    visual: {
      kind: "room",
      click: "keeper",
      marks: [{ target: "keeper", label: "Click the keeper to hear what it did with recent messages" }],
    },
    body: [
      "Every machine has a keeper. It reads each message that arrives and decides what to do with it.",
      "Click the keeper to hear what it did with the last few messages. Keepers never lie, and they never fix anything for you.",
    ],
  },
  {
    id: "keys",
    title: "Keys at a glance",
    blurb: "Every shortcut in one place",
    body: [
      "[[M]] open or close this menu",
      "[[G]] open or close the Scrying Glass",
      "[[`]] open or close the console",
      "[[Esc]] step back: close a panel, the Glass, or leave a corridor",
      "[[1]]–[[9]] walk through a door",
      "[[←]] [[→]] walk to either end of a corridor",
      "[[Space]] pause or resume time",
      "[[Tab]] [[Enter]] reach and open things with the keyboard",
    ],
  },
];

/** Topics available once the player has reached `reached` (room ids in play order). */
export function guideFor(reached: ReadonlySet<string>): GuideTopic[] {
  return guide.filter((t) => !t.from || reached.has(t.from));
}
