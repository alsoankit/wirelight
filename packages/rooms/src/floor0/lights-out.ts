import { keyFor, lanternReply } from "@wirelight/content";
import { corridorLit, failedSends, labDelivered, linkUp } from "../predicates";
import { defineRoom } from "../types";
import { LANTERN_MAC, twoMachines } from "./topology";

const id = "f0.r3-lights-out";
const key = keyFor(id);
const reply = lanternReply(key);

export default defineRoom({
  id,
  floor: 0,
  order: 3,
  kind: "break",
  content: id,
  seed: 4,
  topology: twoMachines(reply, { announcements: true }),
  faults: [{ kind: "iface-down", device: "observatory", iface: "eth0" }],
  playerDevice: "observatory",
  access: { observatory: { state: "enterable" }, lantern: { state: "enterable" } },
  controls: { console: "typing", workbench: true, catching: true },
  tools: { unlock: ["ip link"] },
  glow: "symptoms",
  winCondition: labDelivered("observatory", reply),
  key: { word: key, via: "lab-text" },
  healthChecks: [
    {
      id: "door-up",
      object: { kind: "door", device: "observatory", iface: "eth0" },
      check: linkUp("observatory", "eth0"),
    },
    { id: "wire-lit", object: { kind: "corridor", link: "wire" }, check: corridorLit("wire") },
  ],
  cards: ["console", "link-light", "ip-link"],
  misconceptions: [
    {
      id: "sending-into-a-dark-door",
      detect: failedSends("observatory", 2),
    },
  ],
  solution: [
    { device: "observatory", line: "ip link set eth0 up" },
    { device: "observatory", line: `lab send-frame --to ${LANTERN_MAC}` },
  ],
  detectorTests: [
    {
      misconception: "sending-into-a-dark-door",
      steps: [
        { device: "observatory", line: `lab send-frame --to ${LANTERN_MAC}` },
        { device: "observatory", line: `lab send-frame --to ${LANTERN_MAC}` },
      ],
    },
  ],
});
