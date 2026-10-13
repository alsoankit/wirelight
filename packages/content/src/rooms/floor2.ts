import type { FloorText, RoomText } from "./types";

/** floors/floor-2.md, word for word. */

export const firstLight: RoomText = {
  title: "First Light",
  mission: "The big button is gone. Lantern is still waiting to hear from you.",
  notes: [],
  hints: [
    { text: "The table is waiting for something in its first slot." },
    { text: "Every door's name is written on its plate." },
    { text: "A frame needs the name of the door it's going to: its MAC address.", codex: "mac-address" },
    { text: "Read lantern's plate, write that name in the To slot, add any message, then seal and send." },
    {
      text: "Put `02:00:00:00:00:07` (lantern's name, from its plate) in To, any word in Message, then Seal and send. Lantern answers with the key.",
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
      "Your message travelled in a frame, an envelope addressed with the name of lantern's door. That name is its MAC address. Lantern saw its own name on the frame and answered.",
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
      text: "I built this table to write my own messages. Who it's to goes here, what you want to say goes here. Then seal it and send it.",
      action: "drag a word into the Message slot",
    },
  ],
  guardian: [
    {
      q: "Who is the message for?",
      a: "Every door has a name, written on its plate. I think… you write the name of the door you want.",
    },
    {
      q: "What are all those numbers?",
      a: "That's a door's name. Six pairs. The weavers burned one into every door, so no two were alike.",
    },
    {
      q: "Why did the frame come back to me?",
      a: "You wrote your own door's name. It went nowhere at all.",
      after: "own-name",
    },
  ],
  building: {
    id: "F2-BLD-01",
    text: "When more machines came, a plain thread wasn't enough. The weavers wrapped every message in an envelope, and wrote on it the name of the door it was for.",
    shown: "a message folded into a frame; the to written in glowing ink",
  },
  fieldGuide: ["The workbench", "Doors and plates"],
};

export const wrongName: RoomText = {
  title: "Wrong Name",
  mission: "Someone in your room keeps sending messages to lantern. Lantern never answers.",
  notes: [],
  hints: [
    { text: "Look at lantern's door. Something is piling up there." },
    { text: "You can catch one of those messages and look inside." },
    { text: "A door takes in only frames that carry its own name as the to.", codex: "ignored-mark" },
    {
      text: "Catch one of the messenger's frames, compare its to with lantern's plate, then fix the messenger's card.",
    },
    {
      text: "The card says `02:00:00:00:00:08`; lantern's door is `02:00:00:00:00:07`. Click the card and change it (`lab card --to 02:00:00:00:00:07`). Lantern's next answer carries the key.",
    },
  ],
  detectors: {
    "link-blame": {
      note: "The corridor is lit. Messages are getting there. What happens when they arrive?",
      tried: "You switched a door or replugged the cable, but the link was working.",
    },
    "card-to-self": {
      note: "Now the messenger is writing to you. Who should it be writing to?",
      tried: "You put your own door's name on the messenger's card.",
    },
  },
  debrief: {
    happened:
      "The messenger was writing a name no door has. Every frame reached lantern's door, but lantern only takes frames with its own name as the to, so it ignored them. With the right name on the card, lantern answered.",
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
      text: "You can catch a message without stopping it. Aim, and time slows down. Click it.",
      action: "catch one message",
    },
    {
      id: "F2-MEM-03",
      title: "Opening a catch",
      trigger: "after the first catch",
      text: "Open it. The top line is who it's to, then who it's from, then what it says.",
      action: "open the catch",
    },
  ],
  guardian: [
    {
      q: "What are those marks at lantern's door?",
      a: "Messages that got there… and went no further. Lantern didn't think they were meant for it.",
    },
    { q: "Is lantern ignoring us?", a: "A door only takes what has its own name on it. I remember that much." },
    {
      q: "Why does lantern talk to everyone?",
      a: "That one is written to everyone. All doors listen to that name.",
      after: "caught-announcement",
    },
  ],
  building: {
    id: "F2-BLD-02",
    text: "So that no machine would have to read everyone's post, the weavers taught every door to look at the to first, and let anything else fall away.",
    shown: "a door glancing at frames, accepting one, letting another fade",
  },
  fieldGuide: ["Catching and opening messages", "The messenger and its card", "Messages, corridors and marks"],
};

export const whoAreYou: RoomText = {
  title: "Who Are You?",
  mission:
    "A second door in your room has opened, and someone is behind it. The room beyond is sealed, and you don't know their name.",
  access: { quill: "Sealed. You can't go in, but anything you send can." },
  notes: ["Found a room I couldn't get into. Didn't know who lived there. So I shouted."],
  hints: [
    { text: "You can't read quill's plate. Can quill tell you its name?" },
    { text: "Remember the address that means everyone?", codex: "everyone-address" },
    { text: "Send a frame to everyone, then look at who the answer is from.", codex: "source-address" },
    {
      text: "Send to `ff:ff:ff:ff:ff:ff` out of eth1, catch or open the answer, read its from, then send to that name.",
    },
    {
      text: "Send to `ff:ff:ff:ff:ff:ff` on eth1. Quill answers `I'm here — quill` from `02:00:00:00:00:0c`. Send a frame to `02:00:00:00:00:0c`, and quill answers with the key.",
    },
  ],
  detectors: {
    guessing: {
      note: "Guessing names could take forever. Is there a name that everyone listens to?",
      tried: "You guessed names that no door has.",
    },
    "wrong-door": {
      note: "Lantern answered. But the sealed room is behind your other door.",
      tried: "You sent out of eth0, toward lantern, but quill is behind eth1.",
    },
    "stopped-at-hello": {
      note: "Quill answered you. Who was that answer from?",
      tried: "Quill told you who it was, and you waited a while before speaking to it by name.",
    },
  },
  debrief: {
    happened:
      "You didn't know quill's name, so you called to everyone with the broadcast address. Quill answered, and every answer carries the name of the door that sent it, its source. Then you could speak to quill by name.",
    terms: [
      { id: "broadcast", term: "broadcast", meaning: "a frame for everyone, sent to ff:ff:ff:ff:ff:ff" },
      { id: "source-address", term: "source address", meaning: "the from on a frame: who sent it" },
    ],
  },
  guardian: [
    {
      q: "How can I learn its name?",
      a: "If you can't read the plate… maybe it will tell you, if you call out to everyone.",
    },
    {
      q: "What does from mean on a frame?",
      a: "The name of the door that sent it. Every answer carries the name of who answered.",
    },
    {
      q: "Why won't quill give me the key?",
      a: "It told you who it is. Perhaps it wants to be spoken to by name.",
      after: "broadcast-sent",
    },
  ],
  building: {
    id: "F2-BLD-03",
    text: "The weavers added a second line to every envelope: who it's from. And one name they kept for no door at all, the name that means everyone.",
    shown: "the from line written; a broadcast frame spreading to every door at once",
  },
  fieldGuide: ["Sealed rooms", "Sending to everyone"],
};

export const lightsOut: RoomText = {
  title: "Lights Out",
  mission: "Your door has gone dark, and its switch won't move.",
  notes: [],
  hints: [
    { text: "The switch won't help any more. What else can talk to this machine?" },
    { text: "The console. Ask the machine about its doors." },
    { text: "`ip link` lists every door and whether it's switched on.", codex: "console" },
    { text: "Look for your door's state in the list, then tell the machine to switch that door on." },
    {
      text: "Type `ip link` to see `eth0 … state DOWN`, then `ip link set eth0 up`. Both lights come on and lantern's next message carries the key.",
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
      tried: "You kept clicking the broken switch after the console woke.",
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
      title: "The console",
      trigger: "right after CMD-01",
      text: "Type, then press Enter. If you're not sure, `man ip` tells you more, and Tab finishes a word for you. Up arrow brings back what you typed.",
      action: "press the up arrow once",
    },
  ],
  guardian: [
    {
      q: "Why did the switch break?",
      a: "Everything here was left alone too long. The deeper you go, the more of them you'll find like that.",
    },
    {
      q: "What is the console?",
      a: "The machine's own voice. It answers in its own words, and it does exactly what you tell it.",
    },
    { q: "What does state DOWN mean?", a: "Switched off. You knew that already, when you could still use the switch." },
  ],
  building: {
    id: "F2-BLD-04",
    text: "The weavers gave every machine a voice of its own, deep inside, that would always answer its own words, even when every switch and lever had crumbled.",
    shown: "a console carved into the wall, its runes glowing",
  },
  fieldGuide: ["The console", "Typing commands", "Command book"],
  voice: [
    { id: "F2-NOTE-01", speaker: "Knight", text: "That switch is finished. It won't move again." },
    { id: "F2-GIFT-01", speaker: "moss spirit", text: "Its switch is broken. So many of them are, now." },
    {
      id: "F2-GIFT-02",
      speaker: "moss spirit",
      text: "But a machine never forgets its own voice. If you speak to it in its own words, it will listen.",
    },
    {
      id: "F2-GIFT-03",
      speaker: "moss spirit",
      text: "I gave you the sight to see their messages. Now I'll give you the voice, to speak to them.",
    },
    { id: "F2-GIFT-04", speaker: "moss spirit", text: "The words are old. Start by asking it about its doors." },
  ],
};

export const silentLine: RoomText = {
  title: "The Silent Line",
  mission: "Deep in the old halls, someone has been calling for years and never been answered. Answer them.",
  access: { moth: "Sealed. You can't go in, but anything you send can." },
  notes: [],
  hints: [
    { text: "Three things stand between you and moth. Start with your doors." },
    { text: "One of your doors is off, and its switch is gone. The console still works." },
    {
      text: "Once the door works, you need moth's name: from a broadcast, or from the from on something moth sends.",
      codex: "source-address",
    },
    { text: "Switch eth1 on with the console, learn moth's name, then put it on the messenger's card." },
    {
      text: "`ip link set eth1 up`; catch one of moth's frames (or broadcast on eth1) and read its from: `02:00:00:00:00:0e`; set the messenger's card to it. Moth answers with the key.",
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
      note: "Lantern answered. But moth is behind your other door.",
      tried: "You called out of eth0, toward lantern, but moth is behind eth1.",
    },
    "card-to-self": {
      note: "Now the messenger is writing to you. Who should it be writing to?",
      tried: "You put your own door's name on the messenger's card.",
    },
    "link-blame": {
      note: "Your door is on and the corridor works. What does the messenger need now?",
      tried: "You switched a working door off and on again.",
    },
    "fix-moths-calls": {
      note: "Moth is calling a name nobody has. You can't fix moth from here, but you can answer it yourself.",
      tried: "You sent to the name moth calls, but no door has it.",
    },
  },
  debrief: {
    happened:
      "Three things kept moth unheard: your door was off, the messenger had no name to send to, and you didn't know moth's name. You switched the door on in the machine's own words, learned moth's name from what it sent, and gave the messenger the right card. A link, a frame, two names: that's everything the old halls were built on.",
    terms: [],
  },
  voice: [
    {
      id: "F2-BOSS-01",
      speaker: "moss spirit",
      text: "Down here, at the very bottom of the old halls, someone has been calling since before I can remember. Nobody has ever answered.",
    },
  ],
};

export const floor2: FloorText = {
  name: "Names on the Wire",
  memory: [
    {
      id: "F2-FM-01",
      title: "The problem",
      text: "When there were only two machines, the thread was enough. But more came, and more doors, and a message could reach a door that wasn't meant for it.",
    },
    {
      id: "F2-FM-02",
      title: "What they built",
      text: "So the weavers made the envelope, the frame. A to, a from, and the message inside. They burned a name into every door, and kept one name for everyone.",
    },
    {
      id: "F2-FM-03",
      title: "Ride-along",
      text: "The door reads the to. Its own name, or everyone's: it opens. Anything else: it lets it fall.",
      shown:
        "a frame sealed at the workbench rides through eth0 to lantern's door, which reads the to and lets it in; a broadcast reaches two doors and both take it in; a third frame, for someone else, stops at a door and fades",
    },
    {
      id: "F2-FM-04",
      title: "What they couldn't solve",
      text: "But one machine with many doors, and many machines on each… the weavers couldn't keep up. Below us, the clockwork folk built something cleverer. I hear its gears, sometimes.",
      shown: "the world map: the Overgrown Halls fully restored; the Sorting Works below through thin mist",
    },
  ],
  journal: {
    page: 2,
    title: "Names",
    where: "tucked under the workbench in 2.3 (glows after the win)",
    text: "Every door down here has a name burned into it. They all start with 02, the way they do when somebody chose them by hand instead of the factory. I wonder who sat down and named them all.",
  },
  farewell: {
    id: "F2-BYE-01",
    speaker: "moss spirit",
    text: "The owl below will remember the rest, I think. Thank you for answering moth. Thank you for answering all of us.",
  },
};
