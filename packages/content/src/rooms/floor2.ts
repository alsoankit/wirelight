import type { FloorText, RoomText } from "./types";

/** floors/floor-2.md, word for word. */

export const firstLight: RoomText = {
  title: "Write Your Own",
  mission: "The big button is gone. Kitchen is still waiting to hear from you.",
  notes: [],
  hints: [
    { text: "The table is waiting for something in its first slot." },
    { text: "Every door's name is written on its plate." },
    { text: "A frame needs the name of the door it's going to: its MAC address.", codex: "mac-address" },
    { text: "Read kitchen's plate, write that name in the To slot, add any message, then seal and send." },
    {
      text: "Put `02:00:00:00:00:07` (kitchen's name, from its plate) in To, any word in Message, then Seal and send. Kitchen answers with the key.",
    },
  ],
  detectors: {
    "own-name": {
      note: "That's the name on your own door. Who did you want to hear you?",
      tried: "You sent a frame to your own door's name, so it went nowhere.",
    },
    "no-name": {
      note: "Every frame needs the name of a door. Where are names written?",
      tried: "You tried to send without a name in the To slot.",
    },
  },
  debrief: {
    happened:
      "Your message travelled in a frame, an envelope addressed with the name of kitchen's door. That name is its MAC address. Kitchen saw its own name on the frame and answered.",
    terms: [
      {
        id: "frame",
        term: "frame",
        meaning: "the envelope a message travels in across a cable: to, from and the message",
      },
      { id: "mac-address", term: "MAC address", meaning: "the name of one door, like 02:00:00:00:00:07" },
    ],
  },
  memories: [
    {
      id: "F2-MEM-01",
      title: "The workbench",
      trigger: "first visit",
      text: "A table for writing my own messages. Who it's for goes here, what to say goes here. Then I seal it and send it.",
      action: "drag a word into the Message slot",
    },
  ],
  guardian: [
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
      a: "You wrote your own door's name. It went nowhere at all.",
      after: "own-name",
    },
  ],
  building: {
    id: "F2-BLD-01",
    text: "With more machines, a bare message wasn't enough. So every message goes in an envelope, with the name of the door it's for written on it.",
    shown: "a message folded into a frame; the to written in glowing ink",
  },
  fieldGuide: ["The workbench", "Doors and plates"],
};

export const wrongName: RoomText = {
  title: "Wrong Address",
  mission: "Someone in your room keeps sending messages to kitchen. Kitchen never answers.",
  notes: [],
  hints: [
    { text: "Look at kitchen's door. Something is piling up there." },
    { text: "You can catch one of those messages and look inside." },
    { text: "A door takes in only frames that carry its own name as the to.", codex: "ignored-mark" },
    {
      text: "Catch one of the messenger's frames, compare its to with kitchen's plate, then fix the messenger's card.",
    },
    {
      text: "The card says `02:00:00:00:00:08`; kitchen's door is `02:00:00:00:00:07`. Click the card and change it (`lab card --to 02:00:00:00:00:07`). Kitchen's next answer carries the key.",
    },
  ],
  detectors: {
    "link-blame": {
      note: "The corridor is lit. Messages are getting there. What happens when they arrive?",
      tried: "You switched a door or replugged the cable, but the link was working.",
    },
    "card-to-self": {
      note: "Now the messenger is writing to you. Who should it be writing to?",
      tried: "You put your own MAC address (your door's name) on the messenger's card.",
    },
  },
  debrief: {
    happened:
      "The messenger was writing a name no door has. Every frame reached kitchen's door, but kitchen only takes frames with its own name as the to, so it ignored them. With the right name on the card, kitchen answered.",
    terms: [
      {
        id: "destination-address",
        term: "destination address",
        meaning: "the to on a frame: the name of the door it's for",
      },
    ],
  },
  memories: [
    {
      id: "F2-MEM-02",
      title: "Catching",
      trigger: "first time a message moves while the jar is ready",
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
  guardian: [
    {
      q: "What are those marks at kitchen's door?",
      a: "Messages that got there and went no further. Kitchen decided they weren't meant for it.",
    },
    { q: "Is kitchen ignoring us?", a: "A door only takes what has its own name on it." },
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
  fieldGuide: ["Catching and opening messages", "The messenger and its card", "Messages, corridors and marks"],
};

export const whoAreYou: RoomText = {
  title: "Who Are You?",
  mission:
    "A second door in your room has opened, and someone is behind it. The room beyond is sealed, and you don't know their name.",
  access: { library: "Sealed. You can't go in, but anything you send can." },
  notes: ["Found a room I couldn't get into. Didn't know its name. So I called out to everyone."],
  hints: [
    { text: "You can't read library's plate. Can library tell you its name?" },
    { text: "Remember the address that means everyone?", codex: "everyone-address" },
    { text: "Send a frame to everyone, then look at who the answer is from.", codex: "source-address" },
    {
      text: "Send to `ff:ff:ff:ff:ff:ff` out of eth1, catch or open the answer, read its from, then send to that name.",
    },
    {
      text: "Send to `ff:ff:ff:ff:ff:ff` on eth1. Library answers `I'm here — library` from `02:00:00:00:00:0c`. Send a frame to `02:00:00:00:00:0c`, and library answers with the key.",
    },
  ],
  detectors: {
    guessing: {
      note: "Guessing names could take forever. Is there a name that everyone listens to?",
      tried: "You guessed names that no door has.",
    },
    "wrong-door": {
      note: "Kitchen answered. But the sealed room is behind your other door.",
      tried: "You sent out of eth0, toward kitchen, but library is behind eth1.",
    },
    "stopped-at-hello": {
      note: "Library answered you. Who was that answer from?",
      tried: "Library told you who it was, and you waited a while before speaking to it by name.",
    },
  },
  debrief: {
    happened:
      "You didn't know library's MAC address, so you called to everyone with the broadcast address. Library answered, and every answer carries the MAC address of the door that sent it: its source. Then you could write to library directly.",
    terms: [
      { id: "broadcast", term: "broadcast", meaning: "a frame for everyone, sent to ff:ff:ff:ff:ff:ff" },
      { id: "source-address", term: "source address", meaning: "the from on a frame: who sent it" },
    ],
  },
  guardian: [
    {
      q: "How can I learn its name?",
      a: "If you can't read its plate, call out to everyone and it may answer.",
    },
    {
      q: "What does from mean on a frame?",
      a: "The MAC address of the door that sent it. Every answer carries the address of whoever answered.",
    },
    {
      q: "Why won't library give me the key?",
      a: "It told you its name. Try writing to it by name.",
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
  mission: "Your door has gone dark, and its switch is broken. You'll need the terminal.",
  notes: [],
  hints: [
    { text: "The switch is broken. Open the terminal: press ` (the key above Tab)." },
    { text: "In the terminal, ask the machine about its doors." },
    { text: "`ip link` lists every door and whether it's switched on.", codex: "console" },
    { text: "Look for your door's state in the list, then tell the machine to switch that door on." },
    {
      text: "Type `ip link` to see `eth0 … state DOWN`, then `ip link set eth0 up`. Both lights come on and kitchen's next message carries the key.",
    },
  ],
  detectors: {
    "wrong-door-name": {
      note: "Doors have names. Which name does yours have? Ask the machine for its doors.",
      tried: "You named a door this machine doesn't have.",
    },
    "down-not-up": {
      note: "It was already off. Which word switches it on?",
      tried: "You told the door to switch off, but it was already off.",
    },
    "keeps-clicking": {
      note: "The switch is gone. The machine will listen if you tell it.",
      tried: "You kept clicking the broken switch after the terminal came online.",
    },
  },
  debrief: {
    happened:
      "Your door was switched off and its switch was broken. You asked the machine about its doors with `ip link`, saw `state DOWN`, and switched it on with `ip link set eth0 up`. It's the same thing the switch used to do.",
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
  guardian: [
    {
      q: "Why did the switch break?",
      a: "Everything here was left alone too long. The further in, the more broken controls there will be.",
    },
    {
      q: "What is a terminal?",
      a: "A text window for giving a machine commands. You type a command and press Enter; the machine runs it and prints the result. Every Linux computer has one, and network engineers use it every day.",
    },
    { q: "What does state DOWN mean?", a: "Switched off. You knew that already, when you could still use the switch." },
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
  mission: "Deep in the old halls, someone has been calling for years and never been answered. Answer them.",
  access: { cellar: "Sealed. You can't go in, but anything you send can." },
  notes: [],
  hints: [
    { text: "Three things stand between you and cellar. Start with your doors." },
    { text: "One of your doors is off, and its switch is broken. Use the terminal." },
    {
      text: "Once the door works, you need cellar's name: from a broadcast, or from the from on something cellar sends.",
      codex: "source-address",
    },
    { text: "Switch eth1 on from the terminal, learn cellar's name, then put it on the messenger's card." },
    {
      text: "`ip link set eth1 up`; catch one of cellar's frames (or broadcast on eth1) and read its from: `02:00:00:00:00:0e`; set the messenger's card to it. Cellar answers with the key.",
    },
  ],
  detectors: {
    "wrong-door-name": {
      note: "Doors have names. Which name does yours have? Ask the machine for its doors.",
      tried: "You named a door this machine doesn't have.",
    },
    guessing: {
      note: "Guessing names could take forever. Is there a name that everyone listens to?",
      tried: "You guessed names that no door has.",
    },
    "wrong-door": {
      note: "Kitchen answered. But cellar is behind your other door.",
      tried: "You called out of eth0, toward kitchen, but cellar is behind eth1.",
    },
    "card-to-self": {
      note: "Now the messenger is writing to you. Who should it be writing to?",
      tried: "You put your own MAC address (your door's name) on the messenger's card.",
    },
    "link-blame": {
      note: "Your door is on and the corridor works. What does the messenger need now?",
      tried: "You switched a working door off and on again.",
    },
    "fix-moths-calls": {
      note: "Cellar is calling a name nobody has. You can't fix cellar from here, but you can answer it yourself.",
      tried: "You sent to the name cellar calls, but no door has it.",
    },
  },
  debrief: {
    happened:
      "Three things kept cellar unheard: your door was off, the messenger had no name to send to, and you didn't know cellar's name. You switched the door on with a terminal command, learned cellar's name from what it sent, and gave the messenger the right card. A link, a frame, two names: that's everything the old halls were built on.",
    terms: [],
  },
  voice: [
    {
      id: "F2-BOSS-01",
      speaker: "You",
      text: "Out here at the far end of the gardens, a machine has been calling for as long as my logs go back. Nothing has ever answered.",
    },
  ],
};

export const floor2: FloorText = {
  name: "Names on the Wire",
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
      text: "A door reads the to. Its own name, or everyone's: it takes it. Anything else: it lets it fall.",
      shown:
        "a frame sealed at the workbench rides through eth0 to kitchen's door, which reads the to and lets it in; a broadcast reaches two doors and both take it in; a third frame, for someone else, stops at a door and fades",
    },
    {
      id: "F2-FM-04",
      title: "What they couldn't solve",
      text: "But many machines on many cables was too much for doors alone. Further in, the machines got cleverer. I can hear gears from here.",
      shown: "the world map: the Overgrown Halls fully restored; the Sorting Works further in through thin mist",
    },
  ],
  journal: {
    page: 2,
    title: "Names",
    where: "tucked under the workbench in 2.3 (glows after the win)",
    text: "Log 3,152. Every door out here has a name starting with 02, the sign of a name set by hand. I'm keeping a list of them, in case my memory goes.",
  },
  farewell: {
    id: "F2-BYE-01",
    speaker: "You",
    text: "This floor is working again. Cellar finally got its answer. On to the gears.",
  },
};
