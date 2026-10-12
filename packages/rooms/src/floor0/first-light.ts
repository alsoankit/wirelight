import { keyFor, lanternReply } from "@wirelight/content";
import { corridorLit, ignoredFrom, labDelivered } from "../predicates";
import { defineRoom } from "../types";
import { LANTERN_MAC, OBSERVATORY_MAC, twoMachines } from "./topology";

const id = "f0.r1-first-light";
const key = keyFor(id);
const reply = lanternReply(key);

export default defineRoom({
  id,
  floor: 0,
  order: 1,
  kind: "learn",
  content: id,
  vars: { lanternMac: LANTERN_MAC },
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
  misconceptions: [
    {
      id: "not-addressed-to-them",
      detect: ignoredFrom("observatory", "lantern", "command"),
    },
  ],
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
