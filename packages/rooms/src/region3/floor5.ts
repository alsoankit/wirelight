/** floors/floor-5.md · Addresses. From here, real IPv4: the messenger and `ping` send real echo requests. */
import { keyFor, lanternNewDoorReply, messengerMessage } from "@wirelight/content";
import { messengerPingAnswered, printed, ran, ranBefore } from "../predicates";
import { type Access, defineRoom, type Misconception, type SolutionStep } from "../types";
import { answeredBy, crossedBothWays, hasAddr, pingRanFor, pingsTo, ranAfterAnswer } from "./predicates";
import { CHAPEL, FORGE, IP, KITCHEN, LIBRARY, town } from "./topology";

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

const OPEN: Access = { state: "enterable" };
const LOCKED: Access = { state: "locked-for-now" };
/** The observatory and the square can be entered; the houses are locked (their text says why). */
const access = (houses: string[], open: string[] = []) => ({
  observatory: OPEN,
  square: OPEN,
  ...Object.fromEntries(houses.map((h) => [h, open.includes(h) ? OPEN : LOCKED])),
});

const OWN_ADDR = "10.0.1.5/24";
const ADD_OWN = `ip addr add ${OWN_ADDR} dev eth0`;
const noAddress = { kind: "addr-remove", device: "observatory", cidr: OWN_ADDR, dev: "eth0" } as const;
const ownAddress = {
  id: "address",
  object: { kind: "slot", device: "observatory", iface: "eth0" },
  check: hasAddr("observatory", OWN_ADDR),
} as const;

// Detectors shared by 5.2 and the boss.
const wrongHouse: Misconception = { id: "wrong-house", detect: ran("observatory", /^ip addr add 10\.0\.1\.7\/\d+ /) };
const noPrefix: Misconception = { id: "no-prefix", detect: ran("observatory", /^ip addr add [\d.]+ dev /) };
const pingForever: Misconception = { id: "ping-forever", detect: pingRanFor("observatory", 20_000) };

// ── 5.1 · Where, Not Who ───────────────────────────────────────────────────────────────────

const whereId = "f5.where-not-who";
const cardAnswered = messengerPingAnswered("observatory", IP.kitchen);
export const whereNotWho = defineRoom({
  id: whereId,
  region: 3,
  floor: 5,
  order: 1,
  kind: "learn",
  pathTag: "building-block",
  content: whereId,
  seed: 51,
  topology: town({
    houses: ["kitchen", "library", "forge"],
    messenger: { to: IP.kitchen, msg: messengerMessage, intervalMs: 3000 },
    // An old-style frame written to kitchen's new door gets an answer, without the key.
    lanternLab: { mode: "responder", reply: lanternNewDoorReply },
  }),
  // The card still holds kitchen's old door name.
  faults: [{ kind: "card", device: "observatory", to: "02:00:00:00:00:07" }],
  playerDevice: "observatory",
  access: access(["kitchen", "library", "forge"]),
  controls: { console: "typing", card: "works", catching: true },
  tools: {},
  glow: "symptoms",
  winCondition: cardAnswered,
  key: { word: keyFor(whereId), via: "mark" },
  healthChecks: [{ id: "card-answered", object: { kind: "card", device: "observatory" }, check: cardAnswered }],
  teaches: ["ip-address"],
  // The spec lists "switch"; Region 2 teaches the switch's ideas by these ids.
  uses: ["mac-address", "frame", "flooding"],
  cards: ["ip-address", "register"],
  misconceptions: [
    { id: "chase-the-new-name", detect: ran("observatory", /^lab card --to 02:00:00:00:00:17$/) },
    { id: "own-address", detect: ran("observatory", /^lab card --to 10\.0\.1\.5$/) },
  ],
  detectorTests: [
    { misconception: "chase-the-new-name", steps: [click("observatory", `lab card --to ${KITCHEN}`)] },
    { misconception: "own-address", steps: [click("observatory", `lab card --to ${IP.observatory}`)] },
  ],
  solution: [click("observatory", `lab card --to ${IP.kitchen}`)],
});

// ── 5.2 · A Place to Live ──────────────────────────────────────────────────────────────────

const placeId = "f5.place-to-live";
const lanternAnswered = answeredBy("observatory", IP.kitchen, KITCHEN);
export const placeToLive = defineRoom({
  id: placeId,
  region: 3,
  floor: 5,
  order: 2,
  kind: "learn",
  pathTag: "tool",
  content: placeId,
  seed: 52,
  topology: town({ houses: ["kitchen", "library", "forge"] }),
  faults: [noAddress],
  playerDevice: "observatory",
  access: access(["kitchen", "library", "forge"]),
  controls: { console: "typing", catching: true, addressSlots: { "observatory:eth0": "works" } },
  tools: { unlock: ["ip addr", "ping"] },
  glow: "symptoms",
  subtitles: true,
  winCondition: lanternAnswered,
  key: { word: keyFor(placeId), via: "mark" },
  healthChecks: [
    ownAddress,
    {
      id: "path-lit",
      object: { kind: "corridor", link: "path-observatory" },
      check: crossedBothWays("path-observatory"),
    },
  ],
  teaches: ["ping", "echo-request-reply"],
  uses: ["ip-address"],
  cards: ["address-slot", "echo"],
  commandMemory: "CMD-04",
  misconceptions: [
    // The spec's flow expects this first try (CMD-04's action); it's listed under "What you tried" so
    // the debrief can say why it failed.
    { id: "ping-no-address", detect: ranBefore("observatory", /^ping\b/, /^ip addr add /) },
    wrongHouse,
    noPrefix,
    pingForever,
  ],
  detectorTests: [
    { misconception: "ping-no-address", steps: [typed("observatory", "ping -c 1 10.0.1.7")] },
    {
      misconception: "wrong-house",
      steps: [click("observatory", "ip addr add 10.0.1.7/24 dev eth0"), typed("observatory", "ping -c 1 10.0.1.7")],
    },
    { misconception: "no-prefix", steps: [click("observatory", "ip addr add 10.0.1.5 dev eth0")] },
    {
      misconception: "ping-forever",
      steps: [click("observatory", ADD_OWN), typed("observatory", "ping 10.0.1.7", 25_000)],
    },
  ],
  solution: [click("observatory", ADD_OWN), typed("observatory", "ping -c 3 10.0.1.7")],
});

// ── 5.3 · Roll Call ────────────────────────────────────────────────────────────────────────

const rollId = "f5.roll-call";
const ROLL = [
  { ip: IP.kitchen, door: KITCHEN },
  { ip: IP.forge, door: FORGE },
  { ip: IP.library, door: LIBRARY },
  { ip: IP.chapel, door: CHAPEL },
];
export const rollCall = defineRoom({
  id: rollId,
  region: 3,
  floor: 5,
  order: 3,
  kind: "practice",
  pathTag: "building-block",
  content: rollId,
  seed: 53,
  topology: town({ houses: ["kitchen", "library", "forge", "chapel", "bakery"] }),
  faults: [noAddress, { kind: "iface-down", device: "bakery", iface: "eth0" }],
  playerDevice: "observatory",
  access: access(["kitchen", "library", "forge", "chapel", "bakery"]),
  controls: { console: "typing", catching: true, addressSlots: { "observatory:eth0": "broken" } },
  tools: {},
  glow: "symptoms",
  winCondition: (f) => ROLL.every((h) => answeredBy("observatory", h.ip, h.door)(f)),
  key: { word: keyFor(rollId), via: "mark" },
  healthChecks: [ownAddress],
  teaches: [],
  uses: ["ip-address", "ping", "echo-request-reply"],
  cards: [],
  commandMemory: "CMD-05",
  misconceptions: [{ id: "empty-house", detect: pingsTo("observatory", IP.bakery, 5) }],
  detectorTests: [
    {
      misconception: "empty-house",
      steps: [typed("observatory", ADD_OWN), typed("observatory", "ping -c 5 10.0.1.16", 10_000)],
    },
  ],
  solution: [
    typed("observatory", "ip addr"),
    typed("observatory", ADD_OWN),
    ...ROLL.map((h) => typed("observatory", `ping -c 1 ${h.ip}`)),
  ],
});

// ── 5.B · The Quiet Street ─────────────────────────────────────────────────────────────────

const quietId = "f5.boss-quiet-street";
const quietAnswered = messengerPingAnswered("observatory", IP.kitchen);
export const quietStreet = defineRoom({
  id: quietId,
  region: 3,
  floor: 5,
  order: 9,
  kind: "boss",
  pathTag: "boss",
  content: quietId,
  seed: 59,
  topology: town({
    houses: ["kitchen", "library", "forge"],
    messenger: { to: IP.kitchen, msg: messengerMessage, intervalMs: 3000 },
  }),
  faults: [
    noAddress,
    { kind: "iface-down", device: "square", iface: "eth1" },
    { kind: "card", device: "observatory", to: "10.0.1.70" },
  ],
  playerDevice: "observatory",
  access: access(["kitchen", "library", "forge"]),
  controls: {
    console: "typing",
    card: "works",
    catching: true,
    addressSlots: { "observatory:eth0": "broken" },
    plateSwitches: { "square:eth1": "broken" },
  },
  tools: {},
  glow: "none",
  winCondition: quietAnswered,
  key: { word: keyFor(quietId), via: "mark" },
  healthChecks: [
    ownAddress,
    {
      id: "square-door-up",
      object: { kind: "door", device: "square", iface: "eth1" },
      check: ({ world }) => world.oper("square", "eth1").up,
    },
    { id: "card-answered", object: { kind: "card", device: "observatory" }, check: quietAnswered },
  ],
  hintTiming: { revealAfterMs: 12 * 60_000 },
  teaches: [],
  uses: ["ip-address", "ping", "echo-request-reply", "link-up-down", "mac-address"],
  cards: [],
  misconceptions: [
    wrongHouse,
    noPrefix,
    pingForever,
    {
      id: "wrong-door-name",
      detect: (f) => printed("observatory", "Cannot find device")(f) || printed("square", "Cannot find device")(f),
    },
    { id: "ping-only-library", detect: ranAfterAnswer("observatory", IP.library, /^ip addr (add|del) /) },
  ],
  detectorTests: [
    { misconception: "wrong-house", steps: [typed("observatory", "ip addr add 10.0.1.7/24 dev eth0")] },
    { misconception: "no-prefix", steps: [typed("observatory", "ip addr add 10.0.1.5 dev eth0")] },
    {
      misconception: "ping-forever",
      steps: [typed("observatory", ADD_OWN), typed("observatory", "ping 10.0.1.7", 25_000)],
    },
    { misconception: "wrong-door-name", steps: [typed("square", "ip link set eth9 up")] },
    {
      misconception: "ping-only-library",
      steps: [
        typed("observatory", ADD_OWN),
        typed("observatory", "ping -c 1 10.0.1.12"),
        typed("observatory", "ping -c 1 10.0.1.7"),
        typed("observatory", ADD_OWN),
      ],
    },
  ],
  solution: [
    typed("observatory", ADD_OWN),
    typed("square", "ip link set eth1 up"),
    click("observatory", `lab card --to ${IP.kitchen}`),
  ],
});
