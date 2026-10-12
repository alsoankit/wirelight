import { keyFor, lanternReply } from "@wirelight/content";
import { all, cardPointsTo, commandFrameHeard, corridorLit, messengerAnswered, not } from "../predicates";
import { defineRoom } from "../types";
import { LANTERN_MAC, OLD_MAC, twoMachines } from "./topology";

const id = "f0.r2-wrong-name";
const key = keyFor(id);
const reply = lanternReply(key);

export default defineRoom({
  id,
  floor: 0,
  order: 2,
  kind: "break",
  content: id,
  vars: { lanternMac: LANTERN_MAC, oldMac: OLD_MAC },
  seed: 3,
  topology: twoMachines(reply, { messenger: true, announcements: true }),
  faults: [{ kind: "card", device: "observatory", to: OLD_MAC }],
  playerDevice: "observatory",
  access: { observatory: { state: "enterable" }, lantern: { state: "enterable" } },
  controls: { console: "echo-only", workbench: true, card: true, catching: true },
  tools: { unlock: ["lab card"] },
  glow: "symptoms",
  winCondition: messengerAnswered("observatory", "lantern", reply),
  key: { word: key, via: "lab-text" },
  healthChecks: [
    { id: "card", object: { kind: "card", device: "observatory" }, check: cardPointsTo("observatory", LANTERN_MAC) },
    { id: "wire-lit", object: { kind: "corridor", link: "wire" }, check: corridorLit("wire") },
  ],
  cards: ["address-card", "capture-jar", "opening-a-frame", "knights-note"],
  misconceptions: [
    {
      id: "own-message-not-messenger",
      detect: all(commandFrameHeard("observatory", "lantern"), not(cardPointsTo("observatory", LANTERN_MAC))),
    },
  ],
  solution: [{ device: "observatory", line: `lab card set --to ${LANTERN_MAC}` }],
  detectorTests: [
    {
      misconception: "own-message-not-messenger",
      steps: [{ device: "observatory", line: `lab send-frame --to ${LANTERN_MAC}` }],
    },
  ],
});
