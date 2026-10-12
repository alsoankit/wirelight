import { keyFor, lanternReply } from "@wirelight/content";
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

const id = "f0.boss-silent-line";
const key = keyFor(id);
const reply = lanternReply(key);

export default defineRoom({
  id,
  floor: 0,
  order: 9,
  kind: "boss",
  content: id,
  vars: { lanternMac: LANTERN_MAC },
  seed: 6,
  topology: twoMachines(reply, { messenger: true }),
  faults: [
    { kind: "iface-down", device: "observatory", iface: "eth0" },
    { kind: "card", device: "observatory", to: OLD_MAC },
  ],
  playerDevice: "observatory",
  access: { observatory: { state: "enterable" }, lantern: { state: "off-limits" } },
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
  misconceptions: [
    {
      id: "sending-into-a-dark-door",
      detect: failedSends("observatory", 2),
    },
    {
      id: "own-message-not-messenger",
      detect: all(commandFrameHeard("observatory", "lantern"), not(cardPointsTo("observatory", LANTERN_MAC))),
    },
    {
      id: "didnt-read-the-answer",
      detect: broadcastAgainAfterAnswer("observatory"),
    },
    {
      id: "not-addressed-to-them",
      detect: ignoredFrom("observatory", "lantern", "command"),
    },
  ],
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
