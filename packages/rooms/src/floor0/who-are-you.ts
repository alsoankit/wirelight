import { keyFor } from "../content/keys";
import { broadcastAgainAfterAnswer, corridorLit, labDelivered } from "../predicates";
import { defineRoom } from "../types";
import { LANTERN_MAC, twoMachines } from "./topology";

const id = "f0.r4-who-are-you";
const key = keyFor(id);
const reply = `hello from lantern — key: ${key}`;
export const SEALED = "This room has been sealed for ages. You can watch its door, but you can't go in.";

export default defineRoom({
  id,
  floor: 0,
  order: 4,
  kind: "learn",
  title: "Who Are You?",
  mission: "Your neighbor's door is sealed, so you can't read their name. Get their key anyway.",
  seed: 5,
  topology: twoMachines(reply),
  faults: [],
  playerDevice: "observatory",
  access: { observatory: { state: "enterable" }, lantern: { state: "off-limits", reason: SEALED } },
  controls: { console: "typing", workbench: true, catching: true },
  tools: {},
  glow: "symptoms",
  winCondition: labDelivered("observatory", reply),
  key: { word: key, via: "lab-text" },
  healthChecks: [{ id: "wire-lit", object: { kind: "corridor", link: "wire" }, check: corridorLit("wire") }],
  cards: ["sealed-room"],
  notes: [
    "They sealed the room next door before I got here. I always wondered if there was an address every machine listens to.",
  ],
  hints: [
    { text: "If you don't know a name, can you call everyone?" },
    { text: "There's an address that every machine listens to. It's all f's: ff:ff:ff:ff:ff:ff." },
    { text: "Answers come with the sender's address written on them.", codex: "opening-a-frame" },
    { text: "Send to everyone, catch the answer, read its 'from', then send straight to that address." },
    {
      text: `Send a frame to ff:ff:ff:ff:ff:ff. Lantern answers "I'm here — lantern" from ${LANTERN_MAC}. Catch that answer, read its 'from', and send a frame to ${LANTERN_MAC}. The direct answer carries the key.`,
    },
  ],
  misconceptions: [
    {
      id: "didnt-read-the-answer",
      detect: broadcastAgainAfterAnswer("observatory"),
      note: "Someone answered. Did you look at who it was from?",
      tried: "You called everyone again after lantern had already answered, without using the address on its answer.",
    },
  ],
  debrief: {
    happened:
      "You couldn't read lantern's plate, so you called everyone at once. Lantern answered, and every answer carries the sender's own address. You read it, then wrote to lantern directly, and the direct answer brought the key.",
    terms: [
      { term: "broadcast", meaning: "A frame to everyone on the cable, addressed to ff:ff:ff:ff:ff:ff." },
      { term: "source address", meaning: "The 'from' on a frame: the MAC address of the door that sent it." },
    ],
  },
  solution: [
    { device: "observatory", line: "lab send-frame --to ff:ff:ff:ff:ff:ff" },
    { device: "observatory", line: `lab send-frame --to ${LANTERN_MAC}` },
  ],
  detectorTests: [
    {
      misconception: "didnt-read-the-answer",
      steps: [
        { device: "observatory", line: "lab send-frame --to ff:ff:ff:ff:ff:ff" },
        { device: "observatory", line: "lab send-frame --to ff:ff:ff:ff:ff:ff" },
      ],
    },
  ],
});
