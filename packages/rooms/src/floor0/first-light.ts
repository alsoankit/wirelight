import { keyFor } from "../content/keys";
import { corridorLit, ignoredFrom, labDelivered } from "../predicates";
import { defineRoom } from "../types";
import { LANTERN_MAC, OBSERVATORY_MAC, twoMachines } from "./topology";

const id = "f0.r1-first-light";
const key = keyFor(id);
const reply = `hello from lantern — key: ${key}`;

export default defineRoom({
  id,
  floor: 0,
  order: 1,
  kind: "learn",
  title: "First Light",
  mission: "There's someone at the other end of this cable. Say hello, and make sure the message is for them.",
  seed: 2,
  topology: twoMachines(reply),
  faults: [],
  playerDevice: "observatory",
  access: { observatory: { state: "enterable" }, lantern: { state: "enterable" } },
  controls: { console: "echo-only", workbench: true },
  tools: { unlock: ["lab send-frame", "workbench"] },
  glow: "causes",
  winCondition: labDelivered("observatory", reply),
  key: { word: key, via: "lab-text" },
  healthChecks: [{ id: "wire-lit", object: { kind: "corridor", link: "wire" }, check: corridorLit("wire") }],
  cards: ["door", "plate", "frame", "mac-address", "workbench"],
  notes: ["My workbench is still here. I never did finish that letter. Whoever's next door must be wondering."],
  hints: [
    { text: "Every door has a plate. What does your neighbor's say?" },
    { text: "Walk down the corridor. You can go into their room." },
    { text: "A frame only gets taken in by the door it's addressed to.", codex: "mac-address" },
    { text: "Copy the address from your neighbor's door plate into the 'to' field, then send." },
    {
      text: `Your neighbor's door, eth0 in lantern's room, has the address ${LANTERN_MAC}. Put that in the workbench's 'to' field and press Send. The frame goes down the cable, lantern sees it's for them, and answers with the key.`,
    },
  ],
  misconceptions: [
    {
      id: "not-addressed-to-them",
      detect: ignoredFrom("observatory", "lantern", "command"),
      note: "Your message reached their door. They looked at it and decided it wasn't for them. Whose name did you write on it?",
      tried: "You sent a frame that wasn't addressed to lantern, so lantern's door ignored it.",
    },
  ],
  debrief: {
    happened:
      "You wrote lantern's address on the frame, and lantern's door took it in because it was meant for them. Then lantern wrote your address on its answer and sent it back the same way.",
    terms: [
      {
        term: "frame",
        meaning: "The envelope a message travels in across one cable: who it's to, who it's from, and the message.",
      },
      { term: "MAC address", meaning: "The name of one network door, six pairs of characters like 02:00:00:00:00:07." },
    ],
  },
  solution: [{ device: "observatory", line: `lab send-frame --to ${LANTERN_MAC} --msg "hello"` }],
  detectorTests: [
    {
      misconception: "not-addressed-to-them",
      steps: [{ device: "observatory", line: `lab send-frame --to ${OBSERVATORY_MAC}` }],
    },
    {
      misconception: "not-addressed-to-them",
      steps: [{ device: "observatory", line: "lab send-frame --to 00:00:00:00:00:00" }],
    },
  ],
});
