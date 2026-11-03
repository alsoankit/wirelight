/** floors/floor-2.md · Names on the Wire. The console arrives with the gift of the voice (2.4, 0032). */
import { helloWithKey, keyFor, messengerMessage, mothCall } from "@wirelight/content";
import { corridorLit, labDelivered, linkUp, messengerAnswered, printed, quietAfter, ran, sentTo } from "../predicates";
import { defineRoom, type Misconception, type Predicate, type SolutionStep } from "../types";
import { BROADCAST, CELLAR, halls, KITCHEN, LIBRARY, OBSERVATORY } from "./topology";

const typed = (device: string, line: string, waitMs?: number): SolutionStep => ({
  device,
  line,
  source: "typed",
  ...(waitMs ? { waitMs } : {}),
});
const click = (device: string, line: string, waitMs?: number): SolutionStep => ({
  device,
  line,
  source: "click",
  ...(waitMs ? { waitMs } : {}),
});
/** The workbench seals and sends a frame (lab send-frame), from the observatory. */
const bench = (to: string, msg: string, dev?: string, waitMs?: number) =>
  click("observatory", `lab send-frame${dev ? ` --dev ${dev}` : ""} --to ${to} --msg "${msg}"`, waitMs);

const wireLit = { id: "wire-lit", object: { kind: "corridor", link: "wire" }, check: corridorLit("wire") } as const;
const LANTERN_ROOM = { observatory: { state: "enterable" }, kitchen: { state: "enterable" } } as const;

// Detectors shared by several rooms.
const linkBlame: Misconception = { id: "link-blame", detect: ran(null, /^ip link set \S+ down$|^lab cable unplug/) };
const cardToSelf: Misconception = {
  id: "card-to-self",
  detect: ran("observatory", /^lab card --to 02:00:00:00:00:05$/),
};
const guessing: Misconception = { id: "guessing", detect: sentTo("observatory", "unknown", 2, "eth1") };
const wrongDoor: Misconception = { id: "wrong-door", detect: sentTo("observatory", BROADCAST, 1, "eth0") };
const wrongDoorName: Misconception = { id: "wrong-door-name", detect: printed("observatory", "Cannot find device") };

/**
 * Clicks on the worn-out switch after the gift of the voice. The gift comes with the first click,
 * or after 20 s; clicks after it count (2.4 keeps-clicking).
 */
function clicksAfterGift(control: string, n: number): Predicate {
  return ({ trace }) => {
    const start = trace[0]?.t ?? 0;
    const touches = trace.filter(
      (e) => e.kind === "control.touch" && e.device === "observatory" && e.control === control,
    );
    const first = touches[0];
    if (!first) return false;
    const gift = Math.min(first.t, start + 20_000);
    return touches.filter((e) => e !== first || first.t > gift).filter((e) => e.t >= gift).length >= n;
  };
}

// ── 2.1 · First Light ──────────────────────────────────────────────────────────────────────

const firstLightId = "f2.first-light";
const firstLightReply = helloWithKey("kitchen", keyFor(firstLightId));
export const firstLight = defineRoom({
  id: firstLightId,
  region: 1,
  floor: 2,
  order: 1,
  kind: "learn",
  pathTag: "tool",
  content: firstLightId,
  seed: 21,
  topology: halls({ lanternReply: firstLightReply, announcements: true }),
  faults: [],
  playerDevice: "observatory",
  access: LANTERN_ROOM,
  controls: {
    console: "hidden",
    workbench: "works",
    plateSwitches: { "observatory:eth0": "works", "kitchen:eth0": "works" },
    cableEnds: { "observatory:eth0": "works", "kitchen:eth0": "works" },
  },
  tools: { unlock: ["workbench"] },
  glow: "symptoms",
  winCondition: labDelivered("observatory", firstLightReply),
  key: { word: keyFor(firstLightId), via: "lab-text" },
  healthChecks: [wireLit],
  teaches: ["frame", "mac-address"],
  uses: ["interface"],
  cards: ["frame", "mac-address", "workbench"],
  misconceptions: [
    { id: "own-name", detect: ran("observatory", /^lab send-frame\b.*--to 02:00:00:00:00:05\b/) },
    // The workbench refuses a frame with no name in its To slot.
    { id: "no-name", detect: ran("observatory", /^lab send-frame(?!.*--to \S)/, 2) },
  ],
  detectorTests: [
    { misconception: "own-name", steps: [bench(OBSERVATORY, "hi")] },
    {
      misconception: "no-name",
      steps: [click("observatory", 'lab send-frame --msg "hi"'), click("observatory", 'lab send-frame --msg "hi"')],
    },
  ],
  solution: [bench(KITCHEN, "hello")],
});

// ── 2.2 · Wrong Name ───────────────────────────────────────────────────────────────────────

const wrongNameId = "f2.wrong-name";
const wrongNameReply = helloWithKey("kitchen", keyFor(wrongNameId));
export const wrongName = defineRoom({
  id: wrongNameId,
  region: 1,
  floor: 2,
  order: 2,
  kind: "break",
  pathTag: "tool",
  content: wrongNameId,
  seed: 22,
  topology: halls({
    lanternReply: wrongNameReply,
    announcements: true,
    messenger: { to: KITCHEN, msg: messengerMessage },
  }),
  faults: [{ kind: "card", device: "observatory", to: "02:00:00:00:00:08" }],
  playerDevice: "observatory",
  access: LANTERN_ROOM,
  controls: {
    console: "hidden",
    workbench: "works",
    card: "works",
    catching: true,
    plateSwitches: { "observatory:eth0": "works", "kitchen:eth0": "works" },
    cableEnds: { "observatory:eth0": "works", "kitchen:eth0": "works" },
  },
  tools: { unlock: ["lab card"] },
  glow: "symptoms",
  winCondition: messengerAnswered("observatory", "kitchen", wrongNameReply),
  key: { word: keyFor(wrongNameId), via: "lab-text" },
  healthChecks: [
    {
      id: "card-answered",
      object: { kind: "card", device: "observatory" },
      check: messengerAnswered("observatory", "kitchen", wrongNameReply),
    },
  ],
  teaches: ["destination-address"],
  uses: ["frame", "mac-address"],
  cards: ["messenger", "capture-jar", "ignored-mark", "everyone-address"],
  misconceptions: [linkBlame, cardToSelf],
  detectorTests: [
    {
      misconception: "link-blame",
      steps: [click("observatory", "ip link set eth0 down"), click("observatory", "ip link set eth0 up")],
    },
    { misconception: "card-to-self", steps: [click("observatory", `lab card --to ${OBSERVATORY}`)] },
  ],
  solution: [click("observatory", `lab card --to ${KITCHEN}`)],
});

// ── 2.3 · Who Are You? ─────────────────────────────────────────────────────────────────────

const whoId = "f2.who-are-you";
const quillReply = helloWithKey("library", keyFor(whoId));
export const whoAreYou = defineRoom({
  id: whoId,
  region: 1,
  floor: 2,
  order: 3,
  kind: "learn",
  pathTag: "core",
  content: whoId,
  seed: 23,
  topology: halls({
    announcements: true,
    second: { id: "library", mac: LIBRARY, link: "vine", reply: quillReply },
  }),
  faults: [],
  playerDevice: "observatory",
  access: { ...LANTERN_ROOM, library: { state: "off-limits" } },
  controls: { console: "hidden", workbench: "works", catching: true },
  tools: {},
  glow: "symptoms",
  winCondition: labDelivered("observatory", quillReply),
  key: { word: keyFor(whoId), via: "lab-text" },
  healthChecks: [{ id: "vine-lit", object: { kind: "corridor", link: "vine" }, check: corridorLit("vine") }],
  teaches: ["broadcast", "source-address"],
  uses: ["frame", "mac-address", "destination-address"],
  cards: ["sealed-room", "source-address"],
  misconceptions: [
    guessing,
    wrongDoor,
    { id: "stopped-at-hello", detect: quietAfter("observatory", "I'm here — library", "eth1", 60_000) },
  ],
  detectorTests: [
    {
      misconception: "guessing",
      steps: [bench("02:00:00:00:00:08", "hi", "eth1"), bench("02:00:00:00:00:09", "hi", "eth1")],
    },
    { misconception: "wrong-door", steps: [bench(BROADCAST, "who are you?", "eth0")] },
    { misconception: "stopped-at-hello", steps: [bench(BROADCAST, "who are you?", "eth1", 65_000)] },
  ],
  solution: [bench(BROADCAST, "who are you?", "eth1"), bench(LIBRARY, "hello", "eth1")],
});

// ── 2.4 · Lights Out ───────────────────────────────────────────────────────────────────────

const lightsId = "f2.lights-out";
const lightsMessage = helloWithKey("kitchen", keyFor(lightsId));
export const lightsOut = defineRoom({
  id: lightsId,
  region: 1,
  floor: 2,
  order: 4,
  kind: "break",
  pathTag: "tool",
  content: lightsId,
  seed: 24,
  topology: halls({ lanternMessage: lightsMessage, announcements: true }),
  faults: [{ kind: "iface-down", device: "observatory", iface: "eth0" }],
  playerDevice: "observatory",
  access: LANTERN_ROOM,
  controls: {
    console: "typing",
    workbench: "works",
    catching: true,
    plateSwitches: { "observatory:eth0": "broken", "kitchen:eth0": "works" },
  },
  tools: {},
  glow: "symptoms",
  winCondition: labDelivered("observatory", lightsMessage),
  key: { word: keyFor(lightsId), via: "lab-text" },
  healthChecks: [
    {
      id: "door-up",
      object: { kind: "door", device: "observatory", iface: "eth0" },
      check: linkUp("observatory", "eth0"),
    },
    wireLit,
  ],
  teaches: [],
  uses: ["interface", "link-up-down", "mac-address"],
  cards: ["console"],
  commandMemory: "CMD-01",
  misconceptions: [
    wrongDoorName,
    { id: "down-not-up", detect: ran("observatory", /^ip link set eth0 down$/) },
    { id: "keeps-clicking", detect: clicksAfterGift("switch:eth0", 3) },
  ],
  detectorTests: [
    { misconception: "wrong-door-name", steps: [typed("observatory", "ip link set eth1 up")] },
    { misconception: "down-not-up", steps: [typed("observatory", "ip link set eth0 down")] },
    {
      misconception: "keeps-clicking",
      steps: [
        { device: "observatory", touch: "switch:eth0" },
        { device: "observatory", touch: "switch:eth0" },
        { device: "observatory", touch: "switch:eth0" },
        { device: "observatory", touch: "switch:eth0" },
      ],
    },
  ],
  solution: [typed("observatory", "ip link"), typed("observatory", "ip link set eth0 up")],
});

// ── 2.B ★ The Silent Line ──────────────────────────────────────────────────────────────────

const bossId = "f2.boss-silent-line";
const mothReply = helloWithKey("cellar", keyFor(bossId));
export const silentLine = defineRoom({
  id: bossId,
  region: 1,
  floor: 2,
  order: 9,
  kind: "boss",
  pathTag: "boss",
  content: bossId,
  seed: 29,
  topology: halls({
    announcements: true,
    messenger: { to: "", dev: "eth1", msg: messengerMessage },
    second: {
      id: "cellar",
      mac: CELLAR,
      link: "root",
      reply: mothReply,
      calls: { to: "02:00:00:00:00:66", msg: mothCall, intervalMs: 5000 },
    },
  }),
  faults: [{ kind: "iface-down", device: "observatory", iface: "eth1" }],
  playerDevice: "observatory",
  access: { ...LANTERN_ROOM, cellar: { state: "off-limits" } },
  controls: {
    console: "typing",
    workbench: "works",
    card: "works",
    catching: true,
    plateSwitches: { "observatory:eth0": "works", "observatory:eth1": "broken" },
  },
  tools: {},
  glow: "none",
  winCondition: messengerAnswered("observatory", "cellar", mothReply),
  key: { word: keyFor(bossId), via: "lab-text" },
  healthChecks: [
    {
      id: "eth1-up",
      object: { kind: "door", device: "observatory", iface: "eth1" },
      check: linkUp("observatory", "eth1"),
    },
    {
      id: "card-answered",
      object: { kind: "card", device: "observatory" },
      check: messengerAnswered("observatory", "cellar", mothReply),
    },
    { id: "root-lit", object: { kind: "corridor", link: "root" }, check: corridorLit("root") },
  ],
  hintTiming: { revealAfterMs: 12 * 60_000 },
  teaches: [],
  uses: ["interface", "link-up-down", "frame", "mac-address", "destination-address", "broadcast", "source-address"],
  cards: [],
  misconceptions: [
    wrongDoorName,
    guessing,
    wrongDoor,
    cardToSelf,
    { id: "link-blame", detect: ran("observatory", /^ip link set eth0 down$/) },
    { id: "fix-moths-calls", detect: ran("observatory", /^lab send-frame\b.*--to 02:00:00:00:00:66\b/) },
  ],
  detectorTests: [
    { misconception: "wrong-door-name", steps: [typed("observatory", "ip link set eth2 up")] },
    {
      misconception: "guessing",
      steps: [
        typed("observatory", "ip link set eth1 up"),
        bench("02:00:00:00:00:08", "hi", "eth1"),
        bench("02:00:00:00:00:09", "hi", "eth1"),
      ],
    },
    { misconception: "wrong-door", steps: [bench(BROADCAST, "who?", "eth0")] },
    { misconception: "card-to-self", steps: [click("observatory", `lab card --to ${OBSERVATORY}`)] },
    { misconception: "link-blame", steps: [click("observatory", "ip link set eth0 down")] },
    {
      misconception: "fix-moths-calls",
      steps: [typed("observatory", "ip link set eth1 up"), bench("02:00:00:00:00:66", "hello", "eth1")],
    },
  ],
  solution: [
    typed("observatory", "ip link set eth1 up"),
    bench(BROADCAST, "who?", "eth1"),
    click("observatory", `lab card --to ${CELLAR}`),
  ],
  // Cellar's own calls arrive as ignored marks once eth1 is up; catching one shows cellar's name.
  altSolutions: [[typed("observatory", "ip link set eth1 up"), click("observatory", `lab card --to ${CELLAR}`)]],
});

// ── Secret · Why 48 bits? (Region 1's secret room, decision 0065) ──────────────────────────

const VAULT = "00:1b:21:3a:4f:9c";
const secretId = "f2.secret-48-bits";
const relicReply = helloWithKey("vault", keyFor(secretId));
export const why48Bits = defineRoom({
  id: secretId,
  region: 1,
  floor: 2,
  order: 50,
  kind: "secret",
  pathTag: "all",
  content: secretId,
  seed: 250,
  topology: halls({ second: { id: "vault", mac: VAULT, link: "seam", reply: relicReply } }),
  faults: [],
  playerDevice: "observatory",
  access: { ...LANTERN_ROOM, vault: { state: "off-limits" } },
  controls: { console: "typing", workbench: "works", catching: true },
  tools: {},
  glow: "none",
  winCondition: labDelivered("observatory", relicReply),
  key: { word: keyFor(secretId), via: "lab-text" },
  healthChecks: [{ id: "seam-lit", object: { kind: "corridor", link: "seam" }, check: corridorLit("seam") }],
  teaches: [],
  uses: ["frame", "mac-address", "broadcast", "source-address"],
  cards: ["makers-mark"],
  misconceptions: [{ id: "guessed-02", detect: ran("observatory", /^lab send-frame\b.*--dev eth1\b.*--to 02:/) }],
  detectorTests: [{ misconception: "guessed-02", steps: [bench("02:00:00:00:00:0d", "hi", "eth1")] }],
  solution: [bench(BROADCAST, "who?", "eth1"), bench(VAULT, "hello", "eth1")],
});
