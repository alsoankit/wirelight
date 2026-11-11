import type { FloorText, RoomText } from "./types";

/** floors/floor-2.md, word for word. */

export const firstLight: RoomText = {
  title: "Write Your Own",
  mission:
    "There's no Send button this time. Write a message to kitchen yourself on the stone table, send it, and get kitchen to answer.",
  notes: [],
  hints: [
    { text: "The table's first slot, To, needs the name of the door you're writing to." },
    { text: "Every door's name is written on its plate." },
    { text: "A frame needs the name of the door it's going to: its MAC address.", codex: "mac-address" },
    { text: "Read kitchen's plate, write that name in the To slot, add any message, then seal and send." },
    {
      text: "Put `02:00:00:00:00:07` (kitchen's name, from its plate) in To, any word in Message, then Seal and send. Kitchen answers you.",
    },
  ],
  detectors: {
    "own-name": {
      note: "That's your own door's name. A frame goes to the door whose name is in To, so this one didn't go to kitchen.",
      tried: "You sent a frame to your own door's name, so it went nowhere.",
    },
    "no-name": {
      note: "A frame can't go anywhere without a door's name in To. Every door's name is written on its plate.",
      tried: "You tried to send without a name in the To slot.",
    },
  },
  debrief: {
    happened:
      "Your message travelled in a frame, an envelope addressed with the name of kitchen's door. That name is its MAC address. Kitchen saw its own address on the frame and answered. On a real network every message crosses a cable inside a frame, and every network interface has its own MAC address.",
    terms: [
      {
        id: "frame",
        term: "frame",
        meaning: "the envelope a message travels in across a cable: to, from and the message",
      },
      {
        id: "mac-address",
        term: "MAC address",
        meaning: "the address of one network interface (door), like 02:00:00:00:00:07",
      },
    ],
  },
  memories: [
    {
      id: "F2-MEM-01",
      title: "The Frame builder",
      trigger: "first visit",
      text: "A table for writing my own messages. Who it's for goes here, what to say goes here. Then I seal it and send it.",
      action: "drag a word into the Message slot",
    },
  ],
  questions: [
    {
      q: "Who is the message for?",
      a: "Every door has a name. Write the name of the door you want it to reach.",
    },
    {
      q: "What are all those numbers?",
      a: "That's a door's name: six pairs of characters. No two doors have the same one.",
    },
    {
      q: "Why did the frame come back to me?",
      a: "You wrote your own door's name in To, so it was never going to kitchen.",
      after: "own-name",
    },
  ],
  building: {
    id: "F2-BLD-01",
    text: "With more machines, a bare message wasn't enough. So every message goes in an envelope, with the name of the door it's for written on it.",
    shown: "a message folded into a frame; the to written in glowing ink",
  },
  fieldGuide: ["The Frame builder", "Doors and plates"],
};

export const wrongName: RoomText = {
  title: "Wrong Address",
  mission:
    "Your machine keeps sending frames to kitchen, but kitchen never answers. Find out why and get kitchen to answer.",
  notes: [],
  hints: [
    {
      text: "Go to kitchen's door and look at the marks piling up there: one for each frame that arrived and went no further.",
    },
    { text: "Catch one of the repeating frames on its way and open it to read its To." },
    {
      text: "A door takes in only frames whose To is its own MAC address. It ignores all the others.",
      codex: "ignored-mark",
    },
    {
      text: "Catch one of the repeated frames, compare its To with kitchen's plate, then start a repeat with the right address.",
    },
    {
      text: "The frame says `02:00:00:00:00:08`; kitchen's door is `02:00:00:00:00:07`. In the Frame builder, set To to `02:00:00:00:00:07` and choose Keep sending. Kitchen answers.",
    },
  ],
  detectors: {
    "link-blame": {
      note: "The corridor is lit, so the link works and the frames do reach kitchen. The trouble is what kitchen does with them when they arrive.",
      tried: "You switched a door or replugged the cable, but the link was working.",
    },
    "send-to-self": {
      note: "Now the repeating frame is addressed to your own door. It needs kitchen's MAC address in To.",
      tried: "You sent to your own MAC address (your door's name).",
    },
  },
  debrief: {
    happened:
      "The repeating frame was addressed to `02:00:00:00:00:08`, a MAC address no door has. A network interface only takes frames whose destination address is its own MAC address, and drops the rest without answering. With kitchen's address in To, kitchen took the frame and answered.",
    terms: [
      {
        id: "destination-address",
        term: "destination address",
        meaning: "the To on a frame: the MAC address of the door it's for",
      },
    ],
  },
  memories: [
    {
      id: "F2-MEM-02",
      title: "Catching",
      trigger: "first time a message moves while Captures is ready",
      text: "I can catch a copy of a message without stopping it. Pointing at it slows time down.",
      action: "catch one message",
    },
    {
      id: "F2-MEM-03",
      title: "Opening a catch",
      trigger: "after the first catch",
      text: "Let me open it. The top line is who it's for, then who it's from, then what it says.",
      action: "open the catch",
    },
  ],
  questions: [
    {
      q: "What are those marks at kitchen's door?",
      a: "Messages that got there and went no further. Kitchen decided they weren't meant for it.",
    },
    { q: "Is kitchen ignoring us?", a: "Only those frames. A door only takes frames that have its own name in To." },
    {
      q: "Why does kitchen talk to everyone?",
      a: "That one is written to everyone. All doors listen to that name.",
      after: "caught-announcement",
    },
  ],
  building: {
    id: "F2-BLD-02",
    text: "So that no machine has to read everyone's messages, every door looks at who it's for first, and lets anything else fall away.",
    shown: "a door glancing at frames, accepting one, letting another fade",
  },
  fieldGuide: ["Catching and opening messages", "Repeat a frame", "Messages, corridors and marks"],
};

export const whoAreYou: RoomText = {
  title: "Who Are You?",
  mission:
    "Your machine has a second door now, eth1, leading to library, a machine you can't enter. Find out library's MAC address and get it to answer you.",
  access: { library: "Sealed. You can't go in, but anything you send can." },
  notes: ["Found a room I couldn't get into. Didn't know its name. So I called out to everyone."],
  hints: [
    { text: "You can't read library's plate, but every answer says which door sent it. Get library to answer you." },
    {
      text: "One address reaches every door on the cable at once: the broadcast address, `ff:ff:ff:ff:ff:ff`.",
      codex: "everyone-address",
    },
    { text: "Send a frame to everyone, then look at who the answer is from.", codex: "source-address" },
    {
      text: "Send to `ff:ff:ff:ff:ff:ff` out of eth1, catch or open the answer, read its from, then send to that name.",
    },
    {
      text: "Send to `ff:ff:ff:ff:ff:ff` on eth1. Library answers from `02:00:00:00:00:0c`. Send a frame to `02:00:00:00:00:0c`, and library answers you.",
    },
  ],
  detectors: {
    guessing: {
      note: "Guessing names could take forever. One address reaches every door at once: `ff:ff:ff:ff:ff:ff`.",
      tried: "You guessed names that no door has.",
    },
    "wrong-door": {
      note: "Kitchen answered, because eth0 leads to kitchen. Library is behind your other door, eth1.",
      tried: "You sent out of eth0, toward kitchen, but library is behind eth1.",
    },
    "stopped-at-hello": {
      note: "Library answered. The From on its answer is library's MAC address: send your next frame to that.",
      tried: "Library told you who it was, and you waited a while before speaking to it by name.",
    },
  },
  debrief: {
    happened:
      "You didn't know library's MAC address, so you called to everyone with the broadcast address. Library answered, and every frame carries the MAC address of the door that sent it: its source address. Then you could write to library directly. Real machines find each other this way all the time.",
    terms: [
      { id: "broadcast", term: "broadcast", meaning: "a frame for everyone, sent to ff:ff:ff:ff:ff:ff" },
      { id: "source-address", term: "source address", meaning: "the from on a frame: who sent it" },
    ],
  },
  questions: [
    {
      q: "How can I learn its name?",
      a: "If you can't read its plate, call out to everyone and it may answer.",
    },
    {
      q: "What does from mean on a frame?",
      a: "The MAC address of the door that sent it. Every answer carries the address of whoever answered.",
    },
    {
      q: "Library answered. Why isn't that enough?",
      a: "It only answered a call to everyone. Now write to it by name, using the From on its answer.",
      after: "broadcast-sent",
    },
  ],
  building: {
    id: "F2-BLD-03",
    text: "Every envelope has a second line: who it's from. And one name belongs to no door at all: the name that means everyone.",
    shown: "the from line written; a broadcast frame spreading to every door at once",
  },
  fieldGuide: ["Sealed rooms", "Sending to everyone"],
};

export const lightsOut: RoomText = {
  title: "A Broken Switch",
  mission:
    "Your door eth0 is down and its switch is broken, so kitchen's messages can't get through. Use the terminal to get them through again.",
  notes: [],
  hints: [
    { text: "The switch is broken. Open the terminal: press ` (the key above Tab)." },
    { text: "In the terminal, ask the machine to list its doors (its interfaces) and whether each one is on." },
    { text: "`ip link` lists every door and whether it's switched on.", codex: "console" },
    { text: "Look for your door's state in the list, then tell the machine to switch that door on." },
    {
      text: "Type `ip link` to see `eth0 … state DOWN`, then `ip link set eth0 up`. Both lights come on and kitchen's next message gets through.",
    },
  ],
  detectors: {
    "wrong-door-name": {
      note: "This machine has no door by that name. Type `ip link` to see the names of its doors.",
      tried: "You named a door this machine doesn't have.",
    },
    "down-not-up": {
      note: "`down` switches a door off, and this one was already off. You need the opposite word.",
      tried: "You told the door to switch off, but it was already off.",
    },
    "keeps-clicking": {
      note: "The switch is broken. Use the terminal instead.",
      tried: "You kept clicking the broken switch after the terminal came online.",
    },
  },
  debrief: {
    happened:
      "Your door was switched off and its switch was broken. You listed the machine's interfaces with `ip link`, saw `state DOWN`, and switched eth0 on with `ip link set eth0 up`. That's the same command the switch used to run, and it's how network engineers do it on real Linux machines.",
    terms: [],
  },
  memories: [
    {
      id: "F2-MEM-04",
      title: "The terminal",
      trigger: "right after CMD-01",
      text: "Type, then press Enter. If I'm not sure, `man ip` explains, and Tab finishes a word for me. The up arrow brings back what I typed.",
      action: "press the up arrow once",
    },
  ],
  questions: [
    {
      q: "Why did the switch break?",
      a: "Everything here was left alone too long. The further in, the more broken controls there will be.",
    },
    {
      q: "What is a terminal?",
      a: "A text window for giving a machine commands. You type a command and press Enter; the machine runs it and prints the result. Every Linux computer has one, and network engineers use it every day.",
    },
    {
      q: "What does state DOWN mean?",
      a: "The door is switched off, so its link carries nothing. It's the same as the switch on the plate being off.",
    },
  ],
  building: {
    id: "F2-BLD-04",
    text: "Every machine can be controlled from a terminal by typing commands. Switches and buttons are only shortcuts for those commands.",
    shown: "a terminal screen on the wall, its text glowing",
  },
  fieldGuide: ["The terminal", "Typing commands", "Command book"],
  voice: [
    { id: "F2-NOTE-01", speaker: "You", text: "That switch is finished. It won't move again." },
    { id: "F2-GIFT-01", speaker: "You", text: "Its switch is broken. A lot of them are, by now." },
    {
      id: "F2-GIFT-02",
      speaker: "You",
      text: "But I don't need the switch. Every machine has a terminal: a text window where I type commands and the machine runs them.",
    },
    {
      id: "F2-GIFT-03",
      speaker: "You",
      text: "Opening the terminal. Commands I type here run on this machine, the one whose room I'm in.",
    },
    { id: "F2-GIFT-04", speaker: "You", text: "First command: ask it about its doors." },
  ],
};

export const silentLine: RoomText = {
  title: "Nobody Answers",
  mission:
    "Cellar, a machine behind your second door, keeps calling out, and nobody ever answers. Get a message through to cellar so it answers you.",
  access: { cellar: "Sealed. You can't go in, but anything you send can." },
  notes: [],
  hints: [
    { text: "Three things stand between you and cellar. Start with your doors: look at eth1's light." },
    { text: "One of your doors is off, and its switch is broken. Use the terminal." },
    {
      text: "Once the door works, you need cellar's name: from a broadcast, or from the from on something cellar sends.",
      codex: "source-address",
    },
    { text: "Switch eth1 on from the terminal, learn cellar's name, then use it in a repeating frame." },
    {
      text: "`ip link set eth1 up`; catch one of cellar's frames (or broadcast on eth1) and read its From: `02:00:00:00:00:0e`. In the Frame builder, set To to that address and choose Keep sending. Cellar answers.",
    },
  ],
  detectors: {
    "wrong-door-name": {
      note: "This machine has no door by that name. Type `ip link` to see the names of its doors.",
      tried: "You named a door this machine doesn't have.",
    },
    guessing: {
      note: "Guessing names could take forever. Send a broadcast instead, or read the From on a frame cellar sends.",
      tried: "You guessed names that no door has.",
    },
    "wrong-door": {
      note: "Kitchen answered, because eth0 leads to kitchen. Cellar is behind your other door, eth1.",
      tried: "You called out of eth0, toward kitchen, but cellar is behind eth1.",
    },
    "send-to-self": {
      note: "Now the repeating frame is addressed to your own door. It needs cellar's MAC address in To.",
      tried: "You sent to your own MAC address (your door's name).",
    },
    "link-blame": {
      note: "Your door is on and the link works. What's left is the address on your frame: it needs cellar's MAC address.",
      tried: "You switched a working door off and on again.",
    },
    "fix-moths-calls": {
      note: "Cellar is calling a name nobody has. You can't fix cellar from here, but you can answer it yourself.",
      tried: "You sent to the name cellar calls, but no door has it.",
    },
  },
  debrief: {
    happened:
      "Three things kept cellar unheard: your door was off, the frame had no destination, and you didn't know cellar's name. You switched the door on with a terminal command, learned cellar's name from what it sent, and used that name in To. A working link, frames, and a MAC address for each interface: every wired network is built on those.",
    terms: [],
  },
  voice: [
    {
      id: "F2-BOSS-01",
      speaker: "You",
      text: "A machine out here keeps calling, and nothing answers it. Let's answer.",
    },
  ],
};

export const floor2: FloorText = {
  name: "Frames and MAC Addresses",
  memory: [
    {
      id: "F2-FM-01",
      title: "The problem",
      text: "Memory restored. With only two machines, a cable was enough. But more came, and a message could reach a door it wasn't meant for.",
    },
    {
      id: "F2-FM-02",
      title: "What they built",
      text: "So messages went in envelopes: frames. A to, a from, and the message inside. Every door got a name, and one name was kept for everyone.",
    },
    {
      id: "F2-FM-03",
      title: "Ride-along",
      text: "A door reads the To. If it's the door's own name, or the name for everyone, it takes the frame in. Anything else, it drops.",
      shown:
        "a frame built in the Frame builder rides through eth0 to kitchen's door, which reads the To address and lets it in; a broadcast reaches two doors and both take it in; a third frame, for someone else, stops at a door and fades",
    },
    {
      id: "F2-FM-04",
      title: "What they couldn't solve",
      text: "But many machines on many cables was too much for doors alone. Further in, there are machines that sort messages for many doors at once.",
      shown: "the world map: the Overgrown Halls fully restored; the Sorting Works further in through thin mist",
    },
  ],
  journal: {
    page: 2,
    title: "Names",
    where: "tucked under the Frame builder in 2.3 (glows after the win)",
    text: "Log 3,152. Every door out here has a name starting with 02, the sign of a name set by hand. I'm keeping a list of them, in case my memory goes.",
  },
  farewell: {
    id: "F2-BYE-01",
    speaker: "You",
    text: "This floor works again, and cellar finally got its answer. Next: the halls that sort messages.",
  },
};
