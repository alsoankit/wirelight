import type { RoomText } from "./types";

/** floors/prologue.md, word for word. */
export const firstMessage: RoomText = {
  title: "The First Message",
  mission: "There's someone at the other end of this cable. Press Send and see what happens.",
  access: { lantern: "Not yet. Send your message first." },
  notes: [
    "If you're reading this, you found my base. There's someone at the other end of that cable. I never got an answer. Maybe you will.",
  ],
  hints: [
    { text: "The big button is the only thing you need here." },
    { text: "Press Send, then watch the corridor." },
    { text: "A message goes out along the cable. Wait and see if anything comes back.", codex: "message" },
    { text: "Press Send once and keep your eyes on the Glass until a light returns." },
    { text: "Press Send. Your message travels to lantern, lantern answers, and the answer lights the corridor." },
  ],
  detectors: {},
  debrief: {
    happened:
      "That's a network: machines, a cable between them, and messages going back and forth. The corridor lit up when the answer came back. Remember that: sending isn't the same as being heard.",
    terms: [],
  },
  memories: [
    {
      id: "P-MEM-01",
      title: "The Glass",
      trigger: "the first time the Glass opens (New path: automatic; otherwise a button)",
      text: "This is the Glass. I used it to watch the whole floor at once. Every light you see moving is a message. Go on, follow that one with your eyes.",
      action: "hover the moving message",
    },
  ],
  guardian: [
    {
      q: "What is this place?",
      a: "This was the Knight's room, long ago. He called it the Observatory. Now it's yours, I think.",
    },
    {
      q: "What is that light in the corridor?",
      a: "A message. Machines used to send them all the time. I remember the corridors full of them…",
    },
    {
      q: "Why is everything so dark?",
      a: "The light went out a little at a time. Nobody was left who remembered how to keep it on.",
    },
    {
      q: "Who is at the other end?",
      a: "Someone who has been waiting a long time to hear from you. Send something and see.",
    },
  ],
  building: {
    id: "P-BLD-01",
    text: "I remember now… two machines, far apart, that wanted to talk. The first weavers built a passage between them and laid a copper thread along its floor. Whatever one machine said, the thread carried to the other.",
    shown: "weavers laying the glowing cable; the corridor and both rooms light up on the world map",
  },
  fieldGuide: [
    "Welcome to the palace",
    "How a room is laid out",
    "Looking at things",
    "Getting around",
    "Messages, corridors and marks",
    "The Scrying Glass",
    "Ruins and light",
    "Time",
    "When you're stuck",
    "The keeper",
    "Keys at a glance",
  ],
  voice: [
    { id: "P-GIFT-01", speaker: "Gardener", text: "Oh… you came. Welcome to the palace." },
    {
      id: "P-GIFT-02",
      speaker: "Gardener",
      text: "I've watched over the Knight's Observatory since he left. I've been waiting a long time for someone like you.",
    },
    {
      id: "P-GIFT-03",
      speaker: "Gardener",
      text: "Most people can't see the messages that travel these cables. Let me give you something.",
    },
    {
      id: "P-GIFT-04",
      speaker: "Gardener",
      text: "There. From now on you'll see them as small lights moving through the rooms and corridors. Watch them closely. Where they go, and where they stop, will tell you what's wrong.",
    },
    { id: "P-PATH-01", speaker: "Gardener", text: "Before we begin… how much do you already know?" },
  ],
};
