import type { RoomText } from "./types";

/** floors/prologue.md, word for word. */
export const firstMessage: RoomText = {
  title: "Wake Up and Say Hello",
  mission: "There's someone at the other end of this cable. Press Send and see what happens.",
  access: { kitchen: "Not yet. Send your message first." },
  notes: [
    "Note to self: there's someone at the other end of that cable. I sent a message and never got an answer. Try again when you wake up.",
  ],
  hints: [
    { text: "Press the Send button. It sends a message to kitchen, down the cable." },
    { text: "Press Send, then watch the corridor." },
    { text: "A message goes out along the cable. Wait and see if anything comes back.", codex: "message" },
    { text: "Press Send once and keep your eyes on the Map until a light returns." },
    { text: "Press Send. Your message travels to kitchen, kitchen answers, and the answer lights the corridor." },
  ],
  detectors: {},
  debrief: {
    happened:
      "That's a network: machines, a cable between them, and messages going back and forth. The corridor lit up when the answer came back. Sending a message doesn't prove it arrived: only an answer coming back does.",
    terms: [],
  },
  memories: [
    {
      id: "P-MEM-01",
      title: "The Map",
      trigger: "the first time the Map opens (New path: automatic; otherwise a button)",
      text: "This is my map: the whole floor at once. Every light moving on it is a message. I'll follow that one.",
      action: "hover the moving message",
    },
  ],
  questions: [
    {
      q: "What is this place?",
      a: "The room I shut down in. It's a machine, like every room here. The palace calls it the observatory, so that's its name.",
    },
    {
      q: "What is that light in the corridor?",
      a: "A message. Machines send them to each other along the cables. These corridors used to be full of them.",
    },
    {
      q: "Why is everything so dark?",
      a: "The machines stopped passing messages, a little at a time, and nobody was left to fix them. Fixing them is my job.",
    },
    {
      q: "Who is at the other end?",
      a: "Another machine. Send something and see if it answers.",
    },
  ],
  building: {
    id: "P-BLD-01",
    text: "Two machines, far apart, needed to talk. So a cable was laid between them. Whatever one machine sends, the cable carries to the other.",
    shown: "a glowing cable laid along a corridor; the corridor and both rooms light up on the map",
  },
  fieldGuide: [
    "Welcome to the palace",
    "How a room is laid out",
    "Looking at things",
    "Getting around",
    "Messages, corridors and marks",
    "The Map",
    "Ruins and light",
    "Time",
    "When you're stuck",
    "The keeper",
    "Keyboard shortcuts",
  ],
  voice: [
    { id: "P-GIFT-01", speaker: "You", text: "Power's back. I'm awake. How long was I switched off?" },
    {
      id: "P-GIFT-02",
      speaker: "You",
      text: "This is the room I shut down in. Everything's dark, and the machines have stopped talking to each other.",
    },
    {
      id: "P-GIFT-03",
      speaker: "You",
      text: "My message view is still off, so the messages on these cables are invisible to me. Switching it on.",
    },
    {
      id: "P-GIFT-04",
      speaker: "You",
      text: "There. Messages show up as small lights moving through the rooms and corridors. Where they go, and where they stop, will tell me what's wrong.",
    },
    { id: "P-PATH-01", speaker: "You", text: "Before I start: how much do I already know about networks?" },
  ],
};
