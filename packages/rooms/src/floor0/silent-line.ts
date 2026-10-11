import { keyFor } from "../content/keys";
import {
  all,
  broadcastAgainAfterAnswer,
  cardPointsTo,
  commandFrameHeard,
  corridorLit,
  failedSends,
  ignoredFrom,
  linkUp,
  messengerAnswered,
  not,
} from "../predicates";
import { defineRoom } from "../types";
import { LANTERN_MAC, OLD_MAC, twoMachines } from "./topology";
import { SEALED } from "./who-are-you";

const id = "f0.boss-silent-line";
const key = keyFor(id);
const reply = `hello from lantern — key: ${key}`;

export default defineRoom({
  id,
  floor: 0,
  order: 9,
  kind: "boss",
  title: "The Silent Line",
  mission: "Your machine has been calling the other side for years, and nobody has ever answered. Make it heard.",
  seed: 6,
  topology: twoMachines(reply, { messenger: true }),
  faults: [
    { kind: "iface-down", device: "observatory", iface: "eth0" },
    { kind: "card", device: "observatory", to: OLD_MAC },
  ],
  playerDevice: "observatory",
  access: { observatory: { state: "enterable" }, lantern: { state: "off-limits", reason: SEALED } },
  controls: { console: "typing", workbench: true, card: true, catching: true },
  tools: {},
  glow: "none",
  winCondition: messengerAnswered("observatory", "lantern", reply),
  key: { word: key, via: "lab-text" },
  healthChecks: [
    {
      id: "door-up",
      object: { kind: "door", device: "observatory", iface: "eth0" },
      check: linkUp("observatory", "eth0"),
    },
    { id: "card", object: { kind: "card", device: "observatory" }, check: cardPointsTo("observatory", LANTERN_MAC) },
    { id: "wire-lit", object: { kind: "corridor", link: "wire" }, check: corridorLit("wire") },
  ],
  hintTiming: { revealAfterMs: 12 * 60_000 },
  cards: [],
  notes: ["This is where I gave up. The line has been silent as long as I can remember."],
  hints: [
    { text: "More than one thing is wrong here. Start with what you can see on your own door." },
    { text: "Your console, the card on your desk, and the corridor will each tell you something." },
    { text: "A message needs a working door, the right name, and a way to find that name out.", codex: "sealed-room" },
    { text: "Bring your door up. Then find out lantern's address without going in. Then fix the card." },
    {
      text: `Type \`ip link set eth0 up\`. Send a frame to ff:ff:ff:ff:ff:ff and read the 'from' on lantern's answer: ${LANTERN_MAC}. Then set the card: \`lab card set --to ${LANTERN_MAC}\`. The messenger's next message is answered with the key.`,
    },
  ],
  misconceptions: [
    {
      id: "sending-into-a-dark-door",
      detect: failedSends("observatory", 2),
      note: "Your machine didn't even try to send. Look at your own door first.",
      tried: "You tried to send while your door was still switched off.",
    },
    {
      id: "own-message-not-messenger",
      detect: all(commandFrameHeard("observatory", "lantern"), not(cardPointsTo("observatory", LANTERN_MAC))),
      note: "That got through. But your machine's own messenger is still calling the wrong name.",
      tried: "Your own message got through, but the messenger's card still had the old address.",
    },
    {
      id: "didnt-read-the-answer",
      detect: broadcastAgainAfterAnswer("observatory"),
      note: "Someone answered. Did you look at who it was from?",
      tried: "You called everyone again after lantern had already answered.",
    },
    {
      id: "not-addressed-to-them",
      detect: ignoredFrom("observatory", "lantern", "command"),
      note: "Your message reached their door. They looked at it and decided it wasn't for them. Whose name did you write on it?",
      tried: "You sent a frame with a name lantern doesn't answer to.",
    },
  ],
  debrief: {
    happened:
      "Three things kept the line silent. Your own door was switched off, so nothing left. The card had an old name on it, so lantern ignored every message. And lantern's room was sealed, so you had to call everyone and read the 'from' on the answer. You fixed all three, and the messenger was finally heard.",
    terms: [],
  },
  solution: [
    { device: "observatory", line: "ip link set eth0 up" },
    { device: "observatory", line: "lab send-frame --to ff:ff:ff:ff:ff:ff" },
    { device: "observatory", line: `lab card set --to ${LANTERN_MAC}` },
  ],
  detectorTests: [
    {
      misconception: "sending-into-a-dark-door",
      steps: [
        { device: "observatory", line: "lab send-frame --to ff:ff:ff:ff:ff:ff" },
        { device: "observatory", line: "lab send-frame --to ff:ff:ff:ff:ff:ff" },
      ],
    },
    {
      misconception: "own-message-not-messenger",
      steps: [
        { device: "observatory", line: "ip link set eth0 up" },
        { device: "observatory", line: `lab send-frame --to ${LANTERN_MAC}` },
      ],
    },
    {
      misconception: "didnt-read-the-answer",
      steps: [
        { device: "observatory", line: "ip link set eth0 up" },
        { device: "observatory", line: "lab send-frame --to ff:ff:ff:ff:ff:ff" },
        { device: "observatory", line: "lab send-frame --to ff:ff:ff:ff:ff:ff" },
      ],
    },
    {
      misconception: "not-addressed-to-them",
      steps: [
        { device: "observatory", line: "ip link set eth0 up" },
        { device: "observatory", line: `lab card set --to ${LANTERN_MAC}` },
        { device: "observatory", line: "lab send-frame --to 02:00:00:00:00:99" },
      ],
    },
  ],
});
