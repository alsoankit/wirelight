import { keyFor } from "../content/keys";
import { corridorLit, failedSends, labDelivered, linkUp } from "../predicates";
import { defineRoom } from "../types";
import { LANTERN_MAC, twoMachines } from "./topology";

const id = "f0.r3-lights-out";
const key = keyFor(id);
const reply = `hello from lantern — key: ${key}`;

export default defineRoom({
  id,
  floor: 0,
  order: 3,
  kind: "break",
  title: "Lights Out",
  mission: "Nothing gets through this cable at all. Not even a little.",
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
  notes: [
    "My console still works. I used to type into it for hours. Press ` to open it, and type `help` if you're not sure where to start.",
  ],
  hints: [
    { text: "Look closely at your own door's light." },
    { text: "Your console can show the state of your doors. Try `ip link`." },
    { text: "A door can be switched off on purpose. Then nothing goes through it.", codex: "ip-link" },
    { text: "Find your door in the list `ip link` prints, and bring it up." },
    {
      text: "Type `ip link set eth0 up`. Your door's light comes on, the corridor works again, and your next message gets through.",
    },
  ],
  misconceptions: [
    {
      id: "sending-into-a-dark-door",
      detect: failedSends("observatory", 2),
      note: "Your machine didn't even try to send. Look at your own door first.",
      tried: "You sent more messages, but your machine couldn't send anything while its door was switched off.",
    },
  ],
  debrief: {
    happened:
      "Your own door was switched off, so your machine wouldn't put anything on the cable at all. One command switched it on. The light came back, and your message went through.",
    terms: [
      { term: "interface", meaning: "A machine's network door, with a name like eth0. `ip link` lists them." },
      { term: "link up / down", meaning: "Whether a door is switched on. A link that's down carries nothing." },
    ],
  },
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
