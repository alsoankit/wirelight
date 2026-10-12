import { keyFor, lanternReply } from "@wirelight/content";
import { twoMachines } from "../floor0/topology";
import { corridorLit, labDelivered } from "../predicates";
import { defineRoom } from "../types";

const id = "prologue.first-message";
const key = keyFor(id);
const reply = lanternReply(key);
const send = { device: "observatory", line: 'lab send-frame --to 02:00:00:00:00:07 --msg "hello"' };

export default defineRoom({
  id,
  floor: -1,
  order: 0,
  kind: "prologue",
  content: id,
  seed: 1,
  topology: twoMachines(reply),
  faults: [],
  playerDevice: "observatory",
  access: {
    observatory: { state: "enterable" },
    lantern: { state: "locked-for-now" },
  },
  controls: { console: "hidden", workbench: false, sendButton: send, glassOnSend: true },
  tools: { unlock: ["lab send-frame"] },
  glow: "causes",
  winCondition: labDelivered("observatory", reply),
  key: { word: key, via: "lab-text" },
  healthChecks: [{ id: "wire-lit", object: { kind: "corridor", link: "wire" }, check: corridorLit("wire") }],
  cards: ["corridor", "message", "scrying-glass"],
  misconceptions: [],
  solution: [send],
  detectorTests: [],
});
