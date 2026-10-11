import { keyFor } from "../content/keys";
import { twoMachines } from "../floor0/topology";
import { corridorLit, labDelivered } from "../predicates";
import { defineRoom } from "../types";

const id = "prologue.first-message";
const key = keyFor(id);
const reply = `hello from lantern — key: ${key}`;
const send = { device: "observatory", line: 'lab send-frame --to 02:00:00:00:00:07 --msg "hello"' };

export default defineRoom({
  id,
  floor: -1,
  order: 0,
  kind: "prologue",
  title: "The First Message",
  mission: "There's someone at the other end of this cable. Press Send and see what happens.",
  seed: 1,
  topology: twoMachines(reply),
  faults: [],
  playerDevice: "observatory",
  access: {
    observatory: { state: "enterable" },
    lantern: { state: "locked-for-now", text: "Not yet. Send your message first." },
  },
  controls: { console: "hidden", workbench: false, sendButton: send, glassOnSend: true },
  tools: { unlock: ["lab send-frame"] },
  glow: "causes",
  winCondition: labDelivered("observatory", reply),
  key: { word: key, via: "lab-text" },
  healthChecks: [{ id: "wire-lit", object: { kind: "corridor", link: "wire" }, check: corridorLit("wire") }],
  cards: ["corridor", "message", "scrying-glass"],
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
  misconceptions: [],
  debrief: {
    happened:
      "That's a network: machines, a cable between them, and messages going back and forth. The light came on when the answer came back. Remember that. Sending isn't the same as being heard.",
    terms: [],
  },
  solution: [send],
  detectorTests: [],
});
