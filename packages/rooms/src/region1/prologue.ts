/** floors/prologue.md · The First Message. */
import { keyFor, lanternReply } from "@wirelight/content";
import { corridorLit, labDelivered } from "../predicates";
import { defineRoom } from "../types";
import { halls, LANTERN } from "./topology";

const id = "p.first-message";
const key = keyFor(id);
const reply = lanternReply(key);
const send = { device: "observatory", line: `lab send-frame --to ${LANTERN} --msg "hello"`, source: "click" as const };

export const firstMessage = defineRoom({
  id,
  region: 1,
  floor: 0,
  order: 0,
  kind: "prologue",
  pathTag: "all",
  content: id,
  seed: 1,
  topology: halls({ lanternReply: reply }),
  faults: [],
  playerDevice: "observatory",
  access: { observatory: { state: "enterable" }, lantern: { state: "locked-for-now" } },
  controls: { console: "hidden", sendButton: send, glassOnSend: true },
  tools: { unlock: ["lab send-frame"] },
  glow: "causes",
  winCondition: labDelivered("observatory", reply),
  key: { word: key, via: "lab-text" },
  healthChecks: [{ id: "wire-lit", object: { kind: "corridor", link: "wire" }, check: corridorLit("wire") }],
  teaches: [],
  uses: [],
  cards: ["cable", "message", "scrying-glass"],
  misconceptions: [],
  detectorTests: [],
  solution: [send],
});
