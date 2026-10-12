import { keyFor, lanternReply } from "@wirelight/content";
import { broadcastAgainAfterAnswer, corridorLit, labDelivered } from "../predicates";
import { defineRoom } from "../types";
import { LANTERN_MAC, twoMachines } from "./topology";

const id = "f0.r4-who-are-you";
const key = keyFor(id);
const reply = lanternReply(key);

export default defineRoom({
  id,
  floor: 0,
  order: 4,
  kind: "learn",
  content: id,
  vars: { lanternMac: LANTERN_MAC },
  seed: 5,
  topology: twoMachines(reply),
  faults: [],
  playerDevice: "observatory",
  access: { observatory: { state: "enterable" }, lantern: { state: "off-limits" } },
  controls: { console: "typing", workbench: true, catching: true },
  tools: {},
  glow: "symptoms",
  winCondition: labDelivered("observatory", reply),
  key: { word: key, via: "lab-text" },
  healthChecks: [{ id: "wire-lit", object: { kind: "corridor", link: "wire" }, check: corridorLit("wire") }],
  cards: ["sealed-room"],
  misconceptions: [
    {
      id: "didnt-read-the-answer",
      detect: broadcastAgainAfterAnswer("observatory"),
    },
  ],
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
