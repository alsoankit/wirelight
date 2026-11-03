/** floors/floor-6.md · Envelopes. The Slate replaces the capture jar (0043); the house's keeper by hand (0042). */
import { keyFor, lanternLampsRemember } from "@wirelight/content";
import type { Fault } from "@wirelight/sim";
import { all, not, ran } from "../predicates";
import { type Access, defineRoom, type Misconception, type SolutionStep } from "../types";
import {
  answeredBy,
  askedWhatTheLedgerKnew,
  claims,
  hasAddr,
  keeperAwake,
  lastAnswersFrom,
  ledgerHas,
  openedFramesOnly,
  openedToMessage,
  waitedOnLedger,
  wrappedTo,
} from "./predicates";
import { FORGE, IP, KITCHEN, LANTERN_OLD, town } from "./topology";

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
const access = (houses: string[], open: string[] = []) => ({
  observatory: OPEN,
  square: OPEN,
  ...Object.fromEntries(houses.map((h) => [h, open.includes(h) ? OPEN : LOCKED])),
});
const SLATE = { catch: true } as const;

// ── 6.1 · Inside the Envelope ──────────────────────────────────────────────────────────────

const envelopeId = "f6.inside-the-envelope";
const openedLantern = openedToMessage(KITCHEN);
export const insideTheEnvelope = defineRoom({
  id: envelopeId,
  region: 3,
  floor: 6,
  order: 1,
  kind: "learn",
  pathTag: "tool",
  content: envelopeId,
  seed: 61,
  topology: town({
    houses: ["kitchen", "library", "forge"],
    lanternAnnounces: { text: lanternLampsRemember(keyFor(envelopeId)) },
  }),
  faults: [],
  playerDevice: "observatory",
  access: access(["kitchen", "library", "forge"]),
  controls: { console: "typing", slate: SLATE },
  tools: { unlock: ["lab slate"] },
  glow: "symptoms",
  winCondition: openedLantern,
  key: { word: keyFor(envelopeId), via: "mark" },
  // Nothing is broken here: the room comes back to life once the sealed letter is opened all the way.
  healthChecks: [
    { id: "letter-opened", object: { kind: "door", device: "observatory", iface: "eth0" }, check: openedLantern },
  ],
  teaches: ["packet", "encapsulation"],
  uses: ["frame", "mac-address", "broadcast", "ip-address"],
  cards: ["slate", "packet"],
  misconceptions: [{ id: "frame-is-everything", detect: openedFramesOnly(3) }],
  detectorTests: [
    {
      misconception: "frame-is-everything",
      steps: [
        click("observatory", "lab slate catch --next", 7000),
        click("observatory", "lab slate catch --next", 7000),
        click("observatory", "lab slate catch --next", 7000),
        click("observatory", "lab slate open 1"),
        click("observatory", "lab slate open 2"),
        click("observatory", "lab slate open 3"),
      ],
    },
  ],
  solution: [
    click("observatory", `lab slate catch --next --from ${IP.kitchen}`, 8000),
    click("observatory", "lab slate open 1 --layer message"),
  ],
});

// ── 6.2 · Who Has This Address? ────────────────────────────────────────────────────────────

const whoHasId = "f6.who-has-this-address";
export const whoHasThisAddress = defineRoom({
  id: whoHasId,
  region: 3,
  floor: 6,
  order: 2,
  kind: "learn",
  pathTag: "tool",
  content: whoHasId,
  seed: 62,
  topology: town({ houses: ["kitchen", "library", "forge"] }),
  faults: [{ kind: "keeper-asleep", device: "observatory", desk: "host" }],
  playerDevice: "observatory",
  access: access(["kitchen", "library", "forge"]),
  controls: { console: "typing", desk: "observatory", ledgers: { observatory: "works" }, slate: SLATE },
  tools: { unlock: ["ip neigh"] },
  glow: "symptoms",
  winCondition: answeredBy("observatory", IP.kitchen, KITCHEN),
  key: { word: keyFor(whoHasId), via: "mark" },
  healthChecks: [
    {
      id: "ledger-has-kitchen",
      object: { kind: "ledger", device: "observatory" },
      check: ledgerHas("observatory", IP.kitchen, KITCHEN),
    },
    { id: "keeper-awake", object: { kind: "keeper", device: "observatory" }, check: keeperAwake("observatory") },
  ],
  teaches: ["arp", "neighbour-ledger"],
  uses: ["packet", "encapsulation", "frame", "broadcast", "mac-address", "ip-address", "ping"],
  cards: ["neighbour-ledger", "arp-question"],
  commandMemory: "CMD-06",
  misconceptions: [
    { id: "wrap-with-ip", detect: ran("observatory", /^lab keeper wrap \d+\.\d+\.\d+\.\d+$/) },
    { id: "wrap-to-everyone", detect: ran("observatory", /^lab keeper wrap ff:ff:ff:ff:ff:ff$/i) },
    { id: "ask-again", detect: askedWhatTheLedgerKnew("observatory") },
  ],
  detectorTests: [
    {
      misconception: "wrap-with-ip",
      steps: [typed("observatory", "ping -c 3 10.0.1.7", 500), click("observatory", "lab keeper wrap 10.0.1.7")],
    },
    {
      misconception: "wrap-to-everyone",
      steps: [
        typed("observatory", "ping -c 3 10.0.1.7", 500),
        click("observatory", "lab keeper wrap ff:ff:ff:ff:ff:ff"),
      ],
    },
    {
      misconception: "ask-again",
      steps: [
        typed("observatory", "ping -c 3 10.0.1.7", 500),
        click("observatory", "lab keeper arp-ask 10.0.1.7", 500),
        click("observatory", "lab keeper arp-ask 10.0.1.7"),
      ],
    },
  ],
  solution: [
    typed("observatory", "ping -c 3 10.0.1.7", 500),
    click("observatory", "lab keeper arp-ask 10.0.1.7", 500),
    click("observatory", `lab keeper wrap ${KITCHEN}`, 1100),
    click("observatory", `lab keeper wrap ${KITCHEN}`),
    typed("observatory", "ip neigh"),
  ],
  // After two packets wrapped by hand to kitchen's door, the keeper remembers (F6-KEEP-01).
  rules: [
    {
      id: "keeper-remembers",
      when: wrappedTo("observatory", KITCHEN, 2),
      // biome-ignore lint/suspicious/noThenProperty: the room format names a rule's effect `then` (types.ts).
      then: { kind: "wake-keeper", device: "observatory" },
    },
  ],
});

// ── 6.3 · Two of Me ────────────────────────────────────────────────────────────────────────

const twoId = "f6.two-of-me";
const quillOwnHouse = all(hasAddr("library", "10.0.1.12/24"), not(claims("library", IP.kitchen)));
const flushAndHope: Misconception = {
  id: "flush-and-hope",
  detect: ran("observatory", /^ip neigh (flush|del)\b/, 2),
};
const changeMyAddress: Misconception = { id: "change-my-address", detect: ran("observatory", /^ip addr (add|del) /) };
const deleteLantern: Misconception = { id: "delete-kitchen", detect: ran("kitchen", /^ip addr del 10\.0\.1\.7\b/) };
export const twoOfMe = defineRoom({
  id: twoId,
  region: 3,
  floor: 6,
  order: 3,
  kind: "break",
  pathTag: "core",
  content: twoId,
  seed: 63,
  // The Knight's messenger keeps pinging kitchen, so the answers (and who sends them) keep coming.
  // Kitchen and library each call on the observatory now and then; on real Linux the ledger keeps the
  // first answer and switches only when the other house asks the observatory something itself
  // (decision 0061), so these calls are what make the stranger answer "sometimes".
  topology: town({
    houses: ["kitchen", "library", "forge"],
    messenger: { to: IP.kitchen, intervalMs: 2000 },
    extra: {
      kitchen: { messenger: { to: "10.0.1.5", intervalMs: 9000 } },
      library: { messenger: { to: "10.0.1.5", intervalMs: 13_000 } },
    },
  }),
  faults: [
    { kind: "addr-remove", device: "library", cidr: "10.0.1.12/24", dev: "eth0" },
    { kind: "addr-set", device: "library", cidr: "10.0.1.7/24", dev: "eth0" },
  ],
  playerDevice: "observatory",
  access: access(["kitchen", "library", "forge"], ["kitchen", "library"]),
  controls: {
    console: "typing",
    slate: SLATE,
    ledgers: { observatory: "works" },
    addressSlots: { "library:eth0": "broken" },
  },
  tools: {},
  glow: "symptoms",
  winCondition: all(quillOwnHouse, lastAnswersFrom("observatory", IP.kitchen, KITCHEN, 3)),
  key: { word: keyFor(twoId), via: "mark" },
  healthChecks: [
    {
      id: "one-claims-kitchen",
      object: { kind: "slot", device: "library", iface: "eth0" },
      check: not(claims("library", IP.kitchen)),
    },
    {
      id: "library-at-12",
      object: { kind: "slot", device: "library", iface: "eth0" },
      check: hasAddr("library", "10.0.1.12/24"),
    },
  ],
  teaches: ["duplicate-address"],
  uses: ["arp", "neighbour-ledger", "ip-address", "mac-address", "ping"],
  cards: ["two-answers"],
  misconceptions: [flushAndHope, changeMyAddress, deleteLantern],
  detectorTests: [
    {
      misconception: "flush-and-hope",
      steps: [typed("observatory", "ip neigh flush dev eth0"), typed("observatory", "ip neigh flush dev eth0")],
    },
    { misconception: "change-my-address", steps: [typed("observatory", "ip addr del 10.0.1.5/24 dev eth0")] },
    { misconception: "delete-kitchen", steps: [typed("kitchen", "ip addr del 10.0.1.7/24 dev eth0")] },
  ],
  solution: [
    typed("library", "ip addr del 10.0.1.7/24 dev eth0"),
    typed("library", "ip addr add 10.0.1.12/24 dev eth0", 90_000),
  ],
});

// ── 6.B · The Mixed-Up Letters ─────────────────────────────────────────────────────────────

const mixedId = "f6.boss-mixed-up-letters";
/** A pinned ledger line for kitchen's old door (`ip neigh add 10.0.1.7 lladdr 02:00:00:00:00:07 dev eth0 nud permanent`). */
const pinnedLine = {
  kind: "neigh-permanent",
  device: "observatory",
  ip: IP.kitchen,
  mac: LANTERN_OLD,
  dev: "eth0",
} as const satisfies Fault;
export const mixedUpLetters = defineRoom({
  id: mixedId,
  region: 3,
  floor: 6,
  order: 9,
  kind: "boss",
  pathTag: "boss",
  content: mixedId,
  seed: 69,
  topology: town({ houses: ["kitchen", "library", "forge", "chapel"] }),
  faults: [
    pinnedLine,
    { kind: "addr-remove", device: "chapel", cidr: "10.0.1.18/24", dev: "eth0" },
    { kind: "addr-set", device: "chapel", cidr: "10.0.1.10/24", dev: "eth0" },
  ],
  playerDevice: "observatory",
  access: access(["kitchen", "library", "forge", "chapel"], ["kitchen", "chapel"]),
  controls: {
    console: "typing",
    slate: SLATE,
    ledgers: { observatory: "works" },
    addressSlots: { "observatory:eth0": "broken", "chapel:eth0": "broken" },
  },
  tools: {},
  glow: "none",
  winCondition: all(answeredBy("observatory", IP.kitchen, KITCHEN), answeredBy("observatory", IP.forge, FORGE)),
  key: { word: keyFor(mixedId), via: "mark" },
  healthChecks: [
    {
      id: "no-pinned-line",
      object: { kind: "ledger", device: "observatory" },
      check: not(ledgerHas("observatory", IP.kitchen, LANTERN_OLD)),
    },
    {
      id: "chapel-own-house",
      object: { kind: "slot", device: "chapel", iface: "eth0" },
      check: all(hasAddr("chapel", "10.0.1.18/24"), not(claims("chapel", IP.forge))),
    },
  ],
  hintTiming: { revealAfterMs: 12 * 60_000 },
  teaches: [],
  uses: ["arp", "neighbour-ledger", "duplicate-address", "ip-address", "mac-address", "ping", "packet"],
  cards: [],
  misconceptions: [
    flushAndHope,
    changeMyAddress,
    { id: "delete-kitchen", detect: ran("kitchen", /^ip addr del 10\.0\.1\.7\b/) },
    { id: "permanent-again", detect: waitedOnLedger("observatory", 30_000) },
  ],
  detectorTests: [
    {
      misconception: "flush-and-hope",
      steps: [typed("observatory", "ip neigh flush dev eth0"), typed("observatory", "ip neigh flush dev eth0")],
    },
    { misconception: "change-my-address", steps: [typed("observatory", "ip addr del 10.0.1.5/24 dev eth0")] },
    { misconception: "delete-kitchen", steps: [typed("kitchen", "ip addr del 10.0.1.7/24 dev eth0")] },
    {
      misconception: "permanent-again",
      steps: [typed("observatory", "ip neigh", 35_000), typed("observatory", "ip neigh")],
    },
  ],
  solution: [
    typed("observatory", "ip neigh"),
    typed("observatory", "ip neigh del 10.0.1.7 dev eth0"),
    typed("chapel", "ip addr del 10.0.1.10/24 dev eth0"),
    typed("chapel", "ip addr add 10.0.1.18/24 dev eth0"),
    typed("observatory", "ping -c 3 10.0.1.7"),
    typed("observatory", "ping -c 3 10.0.1.10"),
  ],
});
