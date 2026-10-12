import type { RoomText } from "./types";

export const firstMessage: RoomText = {
  title: "The First Message",
  mission: "There's someone at the other end of this cable. Press Send and see what happens.",
  access: { lantern: "Not yet. Send your message first." },
  notes: [
    "If you're reading this, you found my base. There's someone at the other end of that cable. I never got an answer. Maybe you will.",
    "I also left a field guide in the menu at the top left. Press M if you ever want to know how things work down here.",
  ],
  hints: [
    { text: "The big button is the only thing you need here." },
    { text: "Press Send, then watch the corridor." },
    { text: "A message goes out along the cable. Wait and see if anything comes back.", codex: "message" },
    { text: "Press Send once and keep your eyes on the Glass until the light returns." },
    { text: "Press Send. Your message travels to lantern, lantern answers, and the answer lights the corridor." },
  ],
  detectors: {},
  debrief: {
    happened:
      "That's a network: machines, a cable between them, and messages going back and forth. The light came on when the answer came back. Remember that. Sending isn't the same as being heard.",
    terms: [],
  },
};
