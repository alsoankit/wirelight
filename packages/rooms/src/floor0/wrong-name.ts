import { keyFor } from "../content/keys";
import { all, cardPointsTo, commandFrameHeard, corridorLit, messengerAnswered, not } from "../predicates";
import { defineRoom } from "../types";
import { LANTERN_MAC, OLD_MAC, twoMachines } from "./topology";

const id = "f0.r2-wrong-name";
const key = keyFor(id);
const reply = `hello from lantern — key: ${key}`;

export default defineRoom({
  id,
  floor: 0,
  order: 2,
  kind: "break",
  title: "Wrong Name",
  mission: "Your machine keeps sending messages to your neighbor on its own. Your neighbor never answers.",
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
  notes: ["I set up a messenger to keep calling next door. It never once got an answer. I could never work out why."],
  hints: [
    { text: "The messages reach the door. Then what?" },
    { text: "You can catch a message in the corridor and look inside." },
    { text: "A frame is only taken in by the machine it's addressed to.", codex: "opening-a-frame" },
    { text: "Compare the 'to' inside a caught message with the plate on your neighbor's door." },
    {
      text: `The card on the desk says ${OLD_MAC}, but lantern's door is ${LANTERN_MAC}. Click the card and set it to lantern's address (it runs \`lab card set --to ${LANTERN_MAC}\`). The next message gets an answer.`,
    },
  ],
  misconceptions: [
    {
      id: "own-message-not-messenger",
      detect: all(commandFrameHeard("observatory", "lantern"), not(cardPointsTo("observatory", LANTERN_MAC))),
      note: "That got through. But your machine's own messenger is still calling the wrong name.",
      tried: "You sent your own message, which worked, but the messenger kept using the old address on its card.",
    },
  ],
  debrief: {
    happened:
      "The messenger was writing an old address on every frame. Lantern's door looked at each one, saw it wasn't for lantern, and ignored it. Once the card had lantern's real address, the very next frame was taken in and answered.",
    terms: [
      { term: "destination address", meaning: "The 'to' on a frame: the MAC address of the door it's meant for." },
      {
        term: "ignoring frames",
        meaning: "A network card quietly throws away every frame that isn't addressed to it (or to everyone).",
      },
    ],
  },
  solution: [{ device: "observatory", line: `lab card set --to ${LANTERN_MAC}` }],
  detectorTests: [
    {
      misconception: "own-message-not-messenger",
      steps: [{ device: "observatory", line: `lab send-frame --to ${LANTERN_MAC}` }],
    },
  ],
});
