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
  // ── From the start ──────────────────────────────────────────────────────────────────────────
  {
    id: "welcome",
    title: "Welcome to the palace",
    blurb: "What this place is and what you're doing here",
    visual: {
      kind: "room",
      marks: [
        { target: "door", label: "A door. A cable runs from here to another room." },
        { target: "plate", label: "The door's plate" },
        { target: "keeper", label: "The keeper, who handles every message" },
        { target: "glass", label: "The planning table" },
      ],
    },
    body: [
      "This palace is a computer network. Every room is a machine. Every door is where a cable plugs into that machine. Every corridor is a cable between two doors.",
      "The network has fallen into ruin. Rooms are cold and grey until they work again. Your job is to bring them back, one room at a time, using the same tools people use on real Linux machines.",
      "There's no score, no timer and no way to lose. Trying things is how you learn here.",
    ],
  },
  {
    id: "room",
    title: "How a room is laid out",
    blurb: "Doors, plates, the keeper, and your own room",
    visual: {
      kind: "room",
      marks: [
        { target: "door", label: "Doors: archways in the back and left walls" },
        { target: "plate", label: "A plate beside every door" },
        { target: "keeper", label: "The keeper, in the middle of the room" },
        { target: "glass", label: "The planning table (your room only)" },
        { target: "workbench", label: "The Knight's workbench (some rooms)" },
      ],
    },
    body: [
      "You see each room from above, with the front wall cut away so the whole room fits on screen. Every room of the same kind is laid out the same way, so you only have to learn it once.",
      "Doors are archways in the back and left walls, and each one has a plate beside it. The keeper, a hooded figure with a lantern, stands in the middle of the room.",
      "Your own machine is the Observatory, the Knight's old base. It has a few extra things: a planning table, and in some rooms the Knight's workbench and his messenger.",
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
      ],
    },
    body: [
      "Click an object to look at it closely. It opens as a panel you can read. Press [[Esc]] or click outside the panel to step back.",
      "When you do something in a panel, like sending a message, the panel closes straight away so you can watch what happens.",
      'Every click that changes something runs a real command on the machine. A short caption shows which one: "the machine heard:" and the command itself.',
    ],
  },
  {
    id: "moving",
    title: "Getting around",
    blurb: "Going through doors to other rooms",
    visual: {
      kind: "room",
      click: "door",
      marks: [{ target: "door", label: "The label in the doorway says where it goes" }],
    },
    body: [
      "Each doorway has a label saying whose room is at the other end of its cable. Click it to go through. Number keys work too: [[1]] goes through the first door, [[2]] the second, and so on.",
      "In the other room, its doorway label takes you back the way you came.",
      "Some rooms are sealed for now. Their doorway says so, and tells you what to do first.",
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
      "Messages are small cyan lights. You can see them because the Guardian gave you the sight when you arrived. A longer message makes a bigger light, and some kinds of message have their own shape.",
      "Point at a message to read a one-line description of it. Parts you haven't learned about yet show as sealed.",
      "Corridors show how their cable is doing. Dark means nothing has made it there and back yet. Lit means a message crossed and an answer came back. Broken (dashed and cracked) means the cable isn't working.",
      "When a message is lost, it leaves a faded ✕ at the door where it stopped. The mark never tells you why. Click it to watch that message's journey again.",
    ],
  },
  {
    id: "glass",
    title: "The Map",
    blurb: "A live map of the floor, and of the whole palace",
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
      "The Map shows the whole floor from above: every room, every corridor, and every message moving through it. Press [[G]] to open it from anywhere, or click the small map in the corner.",
      "The palace tab shows the whole palace: the floors you've restored glowing, the next one in mist, and fog over everything further on.",
      "You can watch anything on the Map, but you can't change anything from it. To do something, go to the room where it belongs.",
    ],
  },
  {
    id: "ruins",
    title: "Ruins and light",
    blurb: "Why rooms are grey, and how they come back",
    visual: { kind: "ruins", before: "In ruins", after: "Restored" },
    body: [
      "A room that doesn't work is a ruin: cold, grey and dusty. As each part of it starts working again, light and colour come back to that part.",
      "If you break it again, the room fades again. The room always shows how the network really is, never how it ought to be.",
    ],
  },
  {
    id: "time",
    title: "Time",
    blurb: "Pausing and changing speed",
    visual: {
      kind: "controls",
      marks: [
        { target: "pause", label: "Pause and play" },
        { target: "speed", label: "Run time slower or faster" },
        { target: "reset", label: "Put the room back the way it started" },
        { target: "glass", label: "The Map: click it to open it" },
      ],
    },
    body: [
      "Messages move slowly on purpose, so you can follow them with your eyes. Real networks are far faster.",
      "The buttons in the top bar pause time and change its speed, from a quarter of normal speed up to sixteen times faster. Fast speeds help when you're waiting for something slow to happen.",
      "Reset room puts the room back the way it started. What you've learned and found stays.",
    ],
  },
  {
    id: "keeper",
    title: "The keeper",
    blurb: "Asking a machine what it did, and why",
    visual: {
      kind: "room",
      click: "keeper",
      marks: [{ target: "keeper", label: "Click the keeper to ask about what it handled" }],
    },
    body: [
      "Every machine has a keeper. It reads each message that arrives and decides what to do with it.",
      "Click the keeper (or the Keeper button) to see the messages it handled recently. Choose one, and it tells you in plain words what it did with it, and why.",
      "Keepers never lie, and they never fix anything for you. They do exactly what their machine tells them, even when that's wrong. Once you can speak to machines, the panel also offers the real command that shows the same thing.",
    ],
  },
  {
    id: "stuck",
    title: "When you're stuck",
    blurb: "The Knight's notes and the Guardian's questions",
    visual: {
      kind: "notes",
      note: "Your message reached their door. They looked at it and decided it wasn't for them. Whose name did you write on it?",
      caption: "A Knight's note reacting to something you tried",
    },
    body: [
      "Long ago a Knight explored this palace and left notes behind. The Knight's notes button in the top bar shows how many hints you've opened out of five, and glows when a new one is ready. Some of his notes react to what you just tried.",
      "Ask opens the Guardian's questions: a few things it still remembers about what's in front of you. It explains, but never gives the answer away.",
      "Getting something wrong costs nothing. Often it's the fastest way to see what's going on.",
    ],
  },
  {
    id: "replay",
    title: "Replaying a journey",
    blurb: "Watching a message's trip again",
    body: [
      "Click the ✕ a lost message left behind to replay its journey. After you restore a room, you can replay the winning journey too.",
      "A replay plays on the Map. It follows the message from room to room, slowed down, and shows what each keeper decided as it happens.",
      "Replays are made from what really happened, so they always match it.",
    ],
  },
  {
    id: "after-a-win",
    title: "After you restore a room",
    blurb: "The debrief, keys and memories",
    body: [
      "When a room works again, an answer comes back to you carrying the room's key. The key goes on your keyring.",
      "Then the debrief: what happened, the new words you met (each with a plain meaning), and a kind line about each thing you tried along the way.",
      "In the first regions you can also see how the room's builders made it. After a floor's last room, its Guardian remembers the whole floor working. Both play on the Map, and the Codex keeps them to watch again.",
    ],
  },
  {
    id: "menu",
    title: "The menu",
    blurb: "The palace, the Codex, this guide and more",
    body: [
      "Press [[M]] or click Menu to open it.",
      "The palace tab lists every floor and room, with what you've cleared. You can play any cleared room again from here.",
      "The Codex keeps everything you've found: objects, the words you've learned, the Command book, memories and journal pages. The Keyring shows every key you've won.",
    ],
  },
  {
    id: "settings",
    title: "Settings",
    blurb: "Sound, voices, text, motion and graphics",
    body: [
      "Settings is in the menu ([[M]]).",
      "Sound sets the volume of everything, music, effects and voices. Voices: Text only plays no voices at all. Every line still shows as text, and waits for a click or [[Enter]].",
      "Text size makes all the writing bigger. Motion can follow your system, or be reduced so the camera fades instead of gliding. Graphics picks how detailed the world looks; Simple is lightest on older computers.",
      "Error subtitles explain what an error means, in one plain line. You can also change your path or watch the intro again.",
    ],
  },
  {
    id: "keys",
    title: "Keys at a glance",
    blurb: "Every shortcut in one place",
    body: [
      "[[M]] open or close the menu",
      "[[G]] open or close the Map",
      "[[`]] open or close the console, once you have it",
      "[[Esc]] step back: close a panel or the Map",
      "[[1]]–[[9]] go through a door",
      "[[Enter]] go on to the next spoken line",
    ],
  },

  // ── Floor 1 ─────────────────────────────────────────────────────────────────────────────────
  {
    id: "plates",
    title: "Doors and plates",
    blurb: "Reading a door's name and light",
    visual: { kind: "plate", on: "Filled: the cable works", off: "Hollow: it doesn't", address: "" },
    from: "f1.two-rooms",
    body: [
      "Every door has a plate beside it. The plate shows the door's name, like eth0, and a light.",
      "The light is a filled diamond when the cable behind the door is working, and a hollow ring when it isn't.",
      "Click a plate to read it up close. In some rooms the plate also has a button that turns its door on or off. More lines appear on plates as you learn what they mean.",
    ],
  },
  {
    id: "cable-ends",
    title: "Cable ends",
    blurb: "Plugging a cable in and out",
    visual: { kind: "lights", items: [{ target: "broken", label: "A corridor whose cable isn't working" }] },
    from: "f1.loose-cable",
    body: [
      "Sometimes a cable's end lies on the floor by a door instead of being plugged in. Click it to plug it in, or to pull it out again.",
      "Watch the plate's light and the corridor as you do.",
    ],
  },

  // ── Floor 2 ─────────────────────────────────────────────────────────────────────────────────
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
    from: "f2.first-light",
    body: [
      "The Knight's workbench builds a frame by hand: the envelope a message travels in across a cable. Write who it's for, add a message, then seal it and send it.",
      "The bench keeps what you wrote, so you can come back and change it.",
    ],
  },
  {
    id: "plate-names",
    title: "Plates: the door's own name",
    blurb: "The second line on a plate",
    visual: {
      kind: "plate",
      on: "Filled: the cable works",
      off: "Hollow: it doesn't",
      address: "02:00:00:00:00:07",
    },
    from: "f2.first-light",
    body: [
      "Plates now show a second line: six pairs of characters like 02:00:00:00:00:07.",
      "Click a plate to read it up close. You can copy what it says from there.",
    ],
  },
  {
    id: "catching",
    title: "Catching and opening messages",
    blurb: "The capture jar",
    from: "f2.wrong-name",
    body: [
      "Point at a moving message and time slows right down. Click it to keep a copy. The message itself carries on as if nothing happened.",
      "Your copies go into the capture jar. Open the jar and open a catch to read it one layer at a time, from the outside in. Parts you haven't learned to open yet stay sealed.",
      "The jar belongs to the room you're in: it keeps its catches when you reset the room, and empties when you move on to another one.",
    ],
  },
  {
    id: "messenger",
    title: "The messenger and its card",
    blurb: "The Knight's small brass automaton",
    from: "f2.wrong-name",
    body: [
      "The messenger is a small brass automaton the Knight left in the Observatory. It holds an address card, and it sends a message to whatever is written on the card, again and again.",
      "Click the messenger's card to read it, or to write something new on it. The messenger uses the new card from its next message on.",
    ],
  },
  {
    id: "everyone",
    title: "Sending to everyone",
    blurb: "The ring that splits into copies",
    from: "f2.who-are-you",
    body: [
      "Some messages aren't for one machine but for every machine they can reach. They look like a ring of light instead of a single one.",
      "Watch where the copies go, and who answers.",
    ],
  },
  {
    id: "console",
    title: "The console",
    blurb: "Speaking to a machine",
    visual: {
      kind: "console",
      caption: "After you send from the workbench, the console shows the command it ran.",
      lines: [
        { text: 'lab send-frame --to 02:00:00:00:00:07 --msg "hello"', tone: "echo" },
        { text: "lab tools exist only in Wirelight. Real Linux doesn't have this command.", tone: "note" },
        { text: "sent 1 frame (to 02:00:00:00:00:07, 19 bytes)", tone: "lab" },
        { text: "", tone: "prompt" },
      ],
    },
    from: "f2.lights-out",
    body: [
      "The Guardian's second gift is the voice: the console, every machine's command line. Press [[`]] (the key above Tab) to open or close it. Commands run on the machine whose room you're in. The Map has no console.",
      "[[Tab]] finishes a command or name you've started. [[↑]] and [[↓]] bring back earlier commands. [[Ctrl]]+[[C]] stops a command that keeps on running. Type help to list what you can use, and man and a command's name to read about it.",
      "When you click to do something, the console shows the real command that click ran, marked with ↳.",
      "Commands that start with lab are Wirelight's own tools, and show in violet. Everything else works the same on a real Linux machine. When a command fails, a dim line under the error says what it means.",
    ],
  },
  {
    id: "worn-out",
    title: "Worn-out controls",
    blurb: "When a button won't move",
    from: "f2.lights-out",
    body: [
      "Some controls have worn out over the centuries. They look cracked and dark, and they won't move.",
      "The machine still listens to its console. If a control won't do it, say it: type the command instead.",
    ],
  },

  // ── Region 2 ────────────────────────────────────────────────────────────────────────────────
  {
    id: "halls",
    title: "Halls",
    blurb: "Rooms with many doors",
    from: "f3.many-doors",
    body: [
      "Some rooms aren't anyone's home. They're halls: big rooms full of doors, each with its own corridor to another machine.",
      "A hall has a keeper like any room, and a board on the wall.",
    ],
  },
  {
    id: "mac-board",
    title: "The MAC board",
    blurb: "Reading a hall's memory",
    from: "f3.many-doors",
    body: [
      "The board on a hall's wall is its memory. Click it to read it. Each line is a door name the hall has seen, and which of its own doors it saw it behind.",
      "Reading the board runs a real command. Later, when the board's glass is clouded and cracked, you can still ask the console the same thing.",
    ],
  },
  {
    id: "desk",
    title: "The keeper's desk",
    blurb: "Doing the keeper's job by hand",
    from: "f3.many-doors",
    body: [
      "In some rooms the keeper has forgotten its job. Messages wait on its desk until you do it for it.",
      "Click the keeper's desk to see what's waiting. Each step you take there is a real one, run as a real command.",
      "After a few messages, the keeper remembers and takes over.",
    ],
  },

  // ── Region 3 ────────────────────────────────────────────────────────────────────────────────
  {
    id: "plate-addresses",
    title: "Plates: house addresses",
    blurb: "The newest line on a plate",
    from: "f5.where-not-who",
    body: [
      "From here on, plates also show the door's house address, if it has one.",
      "In some rooms a plate has an address slot: give the door an address, or take one away. Like other controls, a slot can be cracked and stop taking anything new.",
    ],
  },
  {
    id: "slate",
    title: "The Slate",
    blurb: "The Knight's tablet for catching messages",
    from: "f6.inside-the-envelope",
    body: [
      "The Slate replaces the capture jar. Press Catch the next message and the next one that passes is copied onto it. You can choose to catch only messages from one machine.",
      "Open a catch to peel it one layer at a time, from the outside in. Every field shows its real name and value.",
      "The Slate only reads. It never changes anything.",
    ],
  },
  {
    id: "ledger",
    title: "The neighbour ledger",
    blurb: "A machine's list of the houses near it",
    from: "f6.who-has-this-address",
    body: [
      "Some machines keep a neighbour ledger on the wall. Each line is a house on this street, the door name that answered for it, and how sure the machine is about it.",
      "Click the ledger to read it. Reading it runs a real command you can also type.",
      "Look out for a new shape of message here: a diamond, a question put to everyone on the street.",
    ],
  },
  {
    id: "streets",
    title: "Plates: streets and house numbers",
    blurb: "Reading an address in two parts",
    from: "f7.same-street",
    body: [
      "From here on, plates show each address in two parts. The street comes first, in blue. The house number on that street comes last, in bold.",
    ],
  },
  {
    id: "shapes",
    title: "Shapes of messages",
    blurb: "Rings, diamonds, cubes and sizes",
    from: "f7.ask-for-an-address",
    body: [
      "Most messages are a single light, going to one machine. A longer message makes a bigger light.",
      "A ring is a message to everyone. A diamond is a question asking who has an address. A cube is a machine asking the network for an address of its own.",
      "Point at any of them to read what it is.",
    ],
  },

  // ── Region 4 ────────────────────────────────────────────────────────────────────────────────
  {
    id: "crossings",
    title: "Crossings",
    blurb: "Rooms that join streets",
    from: "f8.other-street",
    body: [
      "A crossing is a room with doors onto more than one street. Each of its doors has its own plate and its own address.",
      "Like any keeper, a crossing's keeper tells you what it did with each message, and why. Ask it.",
    ],
  },
  {
    id: "routing-board",
    title: "The routing board",
    blurb: "Which way a machine sends things",
    from: "f8.across-the-street",
    body: [
      "A routing board hangs on the wall of machines that need one. Each line is a street, and which way to send things for it. The line marked default covers everywhere else.",
      "Click the board to read it, and, where it isn't cracked, to add a line. Both run real commands you can also type. A cracked board can still be read, but won't take anything new.",
    ],
  },
  {
    id: "slate-capture",
    title: "The Slate: Capture at a door",
    blurb: "Listening to everything that crosses a door",
    from: "f8.no-way-back",
    body: [
      "The Slate can now listen at a door of the room you're in. Choose Capture at a door, pick the door, and press Start. Every message that crosses it is written down until you press Stop.",
      "It runs tcpdump, the real tool, so what you see is what a real machine would print.",
    ],
  },
  {
    id: "slate-trace",
    title: "The Slate: Trace and Compare",
    blurb: "Following one message, and comparing two catches",
    from: "f9.two-envelopes",
    body: [
      "Trace my next packet tags the next one you send. It's caught at every machine it passes through, so you can follow its whole journey on the Slate.",
      "Compare puts two catches side by side and marks every field that changed between them.",
    ],
  },
];

/** Topics available once the player has reached `reached` (room ids in play order). */
export function guideFor(reached: ReadonlySet<string>): GuideTopic[] {
  return guide.filter((t) => !t.from || reached.has(t.from));
}
