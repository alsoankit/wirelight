/** floors/floor-4.md · Memory and Loops. Two halls (hall-a, hall-b), Linux bridges with no loop protection. */
import { announcement, helloWithKey, keepsTheKey, keyFor, messengerMessage } from "@wirelight/content";
import type { LinkSpec } from "@wirelight/sim";
import { labDelivered, ran, ranThen } from "../predicates";
import { defineRoom, type Predicate, type SolutionStep } from "../types";
import {
  boardHas,
  calm,
  cutBeforePeace,
  cutTheHeldOne,
  loopAgain,
  messengerHeard,
  noLoop,
  onlyOneHall,
  peaceInOneHall,
  type SpanEnds,
  sentInStorm,
  spareTookOver,
  stalledAfter,
  stormPassed,
  stormThenThrough,
  stpOn,
  stuckOnOneHall,
  waitedWithout,
} from "./predicates";
import {
  ATTIC,
  announcer,
  BAKERY,
  BROADCAST,
  CHAPEL,
  FORGE,
  KITCHEN,
  LAUNDRY,
  LIBRARY,
  PANTRY,
  works,
} from "./topology";

const step = (source: "typed" | "click") => (device: string, line: string, waitMs?: number) =>
  ({ device, line, source, ...(waitMs ? { waitMs } : {}) }) as SolutionStep;
const typed = step("typed");
const click = step("click");
const bench = (to: string, msg: string, waitMs?: number) =>
  click("observatory", `lab send-frame --to ${to} --msg "${msg}"`, waitMs);

const SEALED = { state: "off-limits" } as const;
const OPEN = { state: "enterable" } as const;
const sealed = (...ids: string[]) => Object.fromEntries(ids.map((id) => [id, SEALED]));
const HALLS = [
  { id: "hall-a", base: 0xa0, doors: 4 },
  { id: "hall-b", base: 0xb0, doors: 4 },
];
const span: LinkSpec = { id: "span", a: { device: "hall-a", iface: "eth3" }, b: { device: "hall-b", iface: "eth0" } };
/**
 * The spans are slow (8 kbit/s, 16 frames queued each way), so the storm stays watchable and
 * bounded: copies really circle, but at most a few dozen a second (tech/simulator.md).
 */
const STORM_LINK = { bandwidthBps: 8000, queueLimit: 16 };
const SPANS = ["span", "span-2"];
/** The second span, "in case the first one broke" (4.3's spare, 4.B's and the Peacekeeper's loop). */
const span2: LinkSpec = {
  id: "span-2",
  a: { device: "hall-a", iface: "eth4" },
  b: { device: "hall-b", iface: "eth4" },
};
/** Each span's two ends. */
const SPAN_ENDS: SpanEnds = {
  span: [
    ["hall-a", "eth3"],
    ["hall-b", "eth0"],
  ],
  "span-2": [
    ["hall-a", "eth4"],
    ["hall-b", "eth4"],
  ],
};
/** A machine that announces itself every 8 s (a broadcast, so a loop has something to circle). */
const machine = (id: string, mac: string, hall: string, door: string, last: number, reply?: string) => ({
  id,
  mac,
  hall,
  door,
  announcer: announcer(announcement(id), last),
  ...(reply ? { reply } : {}),
});

// ── 4.1 · The Pinned Memory ────────────────────────────────────────────────────────────────

const pinnedId = "f4.pinned-memory";
const lanternKeyReply = helloWithKey("kitchen", keyFor(pinnedId));
export const pinnedMemory = defineRoom({
  id: pinnedId,
  region: 2,
  floor: 4,
  order: 1,
  kind: "break",
  pathTag: "tool",
  content: pinnedId,
  seed: 41,
  topology: works({
    observatory: { messenger: { to: KITCHEN, msg: messengerMessage, intervalMs: 5000 } },
    machines: [
      // The old corridor: kitchen's cable when it lived behind eth1. Its far end lies loose.
      { id: "alcove", mac: "02:00:00:00:00:14", door: "eth1", mute: true },
      // Library says something once, then goes quiet: its line fades after 300 s (ageing).
      { id: "library", mac: LIBRARY, door: "eth2", messenger: { to: "02:00:00:00:00:05", intervalMs: 3_600_000 } },
      // Kitchen only answers; it never speaks first.
      { id: "kitchen", mac: KITCHEN, door: "eth3", reply: lanternKeyReply },
    ],
  }),
  faults: [
    { kind: "unplug", link: "hall-eth1", end: "alcove" },
    // Pinned by hand: `bridge fdb add 02:00:00:00:00:07 dev eth1 master static sticky`. Sticky, so
    // nothing but deleting it moves it (a plain static entry follows the machine on real Linux).
    { kind: "fdb-static", device: "hall", mac: KITCHEN, port: "eth1", sticky: true },
  ],
  playerDevice: "observatory",
  access: { observatory: OPEN, hall: OPEN, library: OPEN, kitchen: OPEN, alcove: SEALED },
  controls: {
    console: "typing",
    macBoards: { hall: "broken" },
    timeControl: true,
    cableEnds: { "hall:eth1": "works" },
    workbench: "works",
    catching: true,
  },
  tools: {},
  glow: "symptoms",
  winCondition: messengerHeard("observatory", "kitchen", lanternKeyReply),
  key: { word: keyFor(pinnedId), via: "lab-text" },
  healthChecks: [
    { id: "board-kitchen", object: { kind: "board", device: "hall" }, check: boardHas("hall", KITCHEN, "eth3") },
  ],
  teaches: ["ageing", "static-entry"],
  uses: ["mac-table", "learning-from-the-source"],
  cards: ["pinned-memory"],
  commandMemory: "CMD-03",
  misconceptions: [
    { id: "replug-old-cable", detect: ran("hall", /^lab cable plug eth1$/) },
    { id: "wait-for-fade", detect: waitedWithout(600_000, /^bridge fdb del 02:00:00:00:00:07\b/) },
    { id: "delete-wrong-line", detect: ran("hall", /^bridge fdb del 02:00:00:00:00:0c\b/) },
  ],
  detectorTests: [
    { misconception: "replug-old-cable", steps: [click("hall", "lab cable plug eth1")] },
    // Time sped up: 700 s of network time pass.
    { misconception: "wait-for-fade", steps: [typed("hall", "bridge fdb show", 700_000)] },
    { misconception: "delete-wrong-line", steps: [typed("hall", "bridge fdb del 02:00:00:00:00:0c dev eth2 master")] },
  ],
  solution: [typed("hall", "bridge fdb show"), typed("hall", `bridge fdb del ${KITCHEN} dev eth1 master`, 8000)],
});

// ── 4.2 · Who Has the Key? ─────────────────────────────────────────────────────────────────

const whoId = "f4.who-has-the-key";
const anvilReply = helloWithKey("forge", keyFor(whoId));
export const whoHasTheKey = defineRoom({
  id: whoId,
  region: 2,
  floor: 4,
  order: 2,
  kind: "learn",
  pathTag: "building-block",
  content: whoId,
  seed: 42,
  topology: works({
    halls: HALLS,
    machines: [
      { id: "pantry", mac: PANTRY, hall: "hall-a", door: "eth1" },
      { id: "attic", mac: ATTIC, hall: "hall-a", door: "eth2" },
      // Forge's broadcast answer says it keeps the key.
      {
        id: "forge",
        mac: FORGE,
        hall: "hall-b",
        door: "eth1",
        broadcastReply: keepsTheKey("forge"),
        reply: anvilReply,
      },
      { id: "chapel", mac: CHAPEL, hall: "hall-b", door: "eth2" },
      { id: "bakery", mac: BAKERY, hall: "hall-b", door: "eth3" },
    ],
    spans: [span],
  }),
  faults: [],
  playerDevice: "observatory",
  access: {
    observatory: OPEN,
    "hall-a": OPEN,
    "hall-b": OPEN,
    ...sealed("pantry", "attic", "forge", "chapel", "bakery"),
  },
  controls: {
    console: "typing",
    macBoards: { "hall-a": "broken", "hall-b": "broken" },
    workbench: "works",
    catching: true,
  },
  tools: {},
  glow: "symptoms",
  winCondition: labDelivered("observatory", anvilReply),
  key: { word: keyFor(whoId), via: "lab-text" },
  healthChecks: [
    {
      // Something crossed the span both ways: each hall learned a name from the other side.
      id: "span-crossed",
      object: { kind: "corridor", link: "span" },
      check: (f) => boardHas("hall-b", "02:00:00:00:00:05", "eth0")(f) && boardHas("hall-a", FORGE, "eth3")(f),
    },
  ],
  teaches: ["broadcast-domain"],
  uses: ["broadcast", "flooding", "source-address", "mac-table"],
  cards: ["span"],
  misconceptions: [{ id: "only-hall-a", detect: onlyOneHall("hall-a", "hall-b", "observatory", FORGE) }],
  detectorTests: [
    { misconception: "only-hall-a", steps: [typed("hall-a", "bridge fdb show"), bench(PANTRY, "hello")] },
  ],
  solution: [bench(BROADCAST, "who?"), bench(FORGE, "hello")],
});

// ── 4.3 · The Spare Cable (decision 0067) ──────────────────────────────────────────────────

const spareId = "f4.spare-cable";
const anvilSpareReply = helloWithKey("forge", keyFor(spareId));
export const spareCable = defineRoom({
  id: spareId,
  region: 2,
  floor: 4,
  order: 3,
  kind: "learn",
  pathTag: "core",
  content: spareId,
  seed: 43,
  topology: works({
    halls: HALLS.map((h) => ({ ...h, doors: 5 })),
    machines: [
      machine("pantry", PANTRY, "hall-a", "eth1", 13),
      machine("attic", ATTIC, "hall-a", "eth2", 11),
      machine("forge", FORGE, "hall-b", "eth1", 10, anvilSpareReply),
      machine("chapel", CHAPEL, "hall-b", "eth2", 18),
    ],
    // A spare: plugged in at hall-a, its other end lying by hall-b's eth4.
    spans: [
      { ...span, ...STORM_LINK },
      { ...span2, ...STORM_LINK },
    ],
  }),
  faults: [{ kind: "unplug", link: "span-2", end: "hall-b" }],
  playerDevice: "observatory",
  access: {
    observatory: OPEN,
    "hall-a": OPEN,
    "hall-b": OPEN,
    ...sealed("pantry", "attic", "forge", "chapel"),
  },
  controls: {
    console: "typing",
    cableEnds: { "hall-a:eth3": "works", "hall-a:eth4": "works", "hall-b:eth0": "works", "hall-b:eth4": "works" },
    // Working boards: the room is about watching names jump between doors.
    macBoards: { "hall-a": "works", "hall-b": "works" },
    workbench: "works",
    catching: true,
    timeControl: true,
  },
  tools: {},
  glow: "symptoms",
  winCondition: stormThenThrough(SPAN_ENDS, "observatory", anvilSpareReply),
  key: { word: keyFor(spareId), via: "lab-text" },
  healthChecks: [{ id: "storm-passed", object: { kind: "corridor", link: "span-2" }, check: stormPassed(SPANS) }],
  teaches: ["switching-loop", "broadcast-storm"],
  uses: ["broadcast", "flooding", "mac-table", "learning-from-the-source", "broadcast-domain"],
  cards: ["loop"],
  misconceptions: [
    { id: "message-in-the-storm", detect: sentInStorm("observatory", SPANS) },
    { id: "loop-again", detect: loopAgain(SPAN_ENDS) },
  ],
  detectorTests: [
    {
      misconception: "message-in-the-storm",
      steps: [click("hall-b", "lab cable plug eth4", 15_000), bench(FORGE, "hello")],
    },
    {
      misconception: "loop-again",
      steps: [
        click("hall-b", "lab cable plug eth4", 15_000),
        click("hall-b", "lab cable unplug eth4", 10_000),
        click("hall-b", "lab cable plug eth4"),
      ],
    },
  ],
  solution: [
    // The storm: a few announcements' worth of copies, circling.
    click("hall-b", "lab cable plug eth4", 15_000),
    typed("hall-b", "bridge fdb show", 3000),
    click("hall-b", "lab cable unplug eth4", 10_000),
    bench(FORGE, "hello"),
  ],
  altSolutions: [
    [
      click("hall-b", "lab cable plug eth4", 15_000),
      click("hall-a", "lab cable unplug eth3", 10_000),
      bench(FORGE, "hello"),
    ],
    [
      click("hall-b", "lab cable plug eth4", 15_000),
      typed("hall-a", "ip link set eth4 down", 10_000),
      bench(FORGE, "hello"),
    ],
  ],
});

// ── 4.B ★ The Storm ────────────────────────────────────────────────────────────────────────

const stormId = "f4.boss-storm";
const wrenReply = helloWithKey("laundry", keyFor(stormId));
/** A span's door switched off or its cable pulled, at either hall. */
const BREAKS = /^ip link set eth[034] down$|^lab cable unplug eth[034]$/;
const MENDS = /^ip link set eth[034] up$|^lab cable plug eth[034]$/;
const wrenAnswered = (trace: Parameters<Predicate>[0]["trace"]) =>
  trace.some((e) => e.kind === "app.deliver" && e.device === "observatory" && e.text === wrenReply);
/** A cable plugged in at a hall while both spans still joined them (the storm running). */
const moreCables: Predicate = ({ trace }) => {
  for (const e of trace) {
    if (e.kind !== "cmd.exec" || (e.device !== "hall-a" && e.device !== "hall-b")) continue;
    if (BREAKS.test(e.line) && e.exitCode === 0) return false;
    if (/^lab cable plug /.test(e.line)) return true;
  }
  return false;
};
export const storm = defineRoom({
  id: stormId,
  region: 2,
  floor: 4,
  order: 9,
  kind: "boss",
  pathTag: "boss",
  content: stormId,
  seed: 49,
  topology: works({
    halls: HALLS.map((h) => ({ ...h, doors: 5 })),
    machines: [
      machine("pantry", PANTRY, "hall-a", "eth1", 13),
      machine("attic", ATTIC, "hall-a", "eth2", 11),
      machine("forge", FORGE, "hall-b", "eth1", 10),
      machine("chapel", CHAPEL, "hall-b", "eth2", 18),
      machine("laundry", LAUNDRY, "hall-b", "eth3", 19, wrenReply),
    ],
    // Joined twice, "in case the first one broke": the loop is the room's first fault.
    spans: [
      { ...span, ...STORM_LINK },
      { ...span2, ...STORM_LINK },
    ],
  }),
  faults: [{ kind: "fdb-static", device: "hall-b", mac: LAUNDRY, port: "eth2", sticky: true }],
  playerDevice: "observatory",
  access: {
    observatory: OPEN,
    "hall-a": OPEN,
    "hall-b": OPEN,
    ...sealed("pantry", "attic", "forge", "chapel", "laundry"),
  },
  controls: {
    console: "typing",
    cableEnds: { "hall-a:eth4": "works", "hall-b:eth4": "works" },
    plateSwitches: {
      "hall-a:eth3": "broken",
      "hall-a:eth4": "broken",
      "hall-b:eth0": "broken",
      "hall-b:eth4": "broken",
    },
    macBoards: { "hall-a": "broken", "hall-b": "broken" },
    workbench: "works",
    catching: true,
  },
  tools: {},
  glow: "none",
  winCondition: labDelivered("observatory", wrenReply),
  key: { word: keyFor(stormId), via: "lab-text" },
  healthChecks: [
    { id: "no-loop", object: { kind: "corridor", link: "span-2" }, check: noLoop(SPANS) },
    { id: "board-laundry", object: { kind: "board", device: "hall-b" }, check: boardHas("hall-b", LAUNDRY, "eth3") },
    { id: "calm", object: { kind: "corridor", link: "span" }, check: calm(SPANS, 2000, 20) },
  ],
  hintTiming: { revealAfterMs: 12 * 60_000 },
  teaches: [],
  uses: [
    "link-up-down",
    "broadcast",
    "mac-table",
    "flooding",
    "learning-from-the-source",
    "static-entry",
    "broadcast-domain",
    "switching-loop",
    "broadcast-storm",
  ],
  cards: [],
  misconceptions: [
    { id: "replug-old-cable", detect: ranThen(BREAKS, MENDS) },
    { id: "delete-wrong-line", detect: ran("hall-b", /^bridge fdb del (?!02:00:00:00:00:13\b)/) },
    { id: "only-hall-a", detect: stuckOnOneHall("hall-a", "hall-b", 60_000) },
    { id: "more-cables", detect: moreCables },
    { id: "only-the-loop", detect: stalledAfter(BREAKS, 30_000, wrenAnswered) },
  ],
  detectorTests: [
    {
      misconception: "replug-old-cable",
      steps: [click("hall-a", "lab cable unplug eth4"), click("hall-a", "lab cable plug eth4")],
    },
    {
      misconception: "delete-wrong-line",
      steps: [typed("hall-b", `bridge fdb del ${FORGE} dev eth1 master`)],
    },
    {
      misconception: "only-hall-a",
      // A minute in hall-a, reading its board again and again. The runner gives each step one
      // advance with the simulator's event budget (SIM-31), so a storm's minute comes in pieces.
      steps: Array.from({ length: 5 }, () => typed("hall-a", "bridge fdb show", 14_000)),
    },
    { misconception: "more-cables", steps: [click("hall-a", "lab cable plug eth4")] },
    { misconception: "only-the-loop", steps: [typed("hall-b", "ip link set eth4 down", 35_000)] },
  ],
  solution: [
    typed("hall-b", "ip link set eth4 down"),
    typed("hall-b", `bridge fdb del ${LAUNDRY} dev eth2 master`),
    bench(LAUNDRY, "hello"),
  ],
  altSolutions: [
    [
      click("hall-a", "lab cable unplug eth4"),
      typed("hall-b", `bridge fdb del ${LAUNDRY} dev eth2 master`),
      bench(LAUNDRY, "hello"),
    ],
    [
      typed("hall-a", "lab cable unplug eth3"),
      typed("hall-b", `bridge fdb del ${LAUNDRY} dev eth2 master`),
      bench(LAUNDRY, "hello"),
    ],
  ],
});

// ── Secret · The Peacekeeper (Region 2's secret room, decisions 0065, 0067) ────────────────

const peaceId = "f4.secret-peacekeeper";
const wrenPeaceReply = helloWithKey("laundry", keyFor(peaceId));
const STP_ON = "ip link set br0 type bridge stp_state 1";
export const peacekeeper = defineRoom({
  id: peaceId,
  region: 2,
  floor: 4,
  order: 50,
  kind: "secret",
  pathTag: "all",
  content: peaceId,
  seed: 450,
  // The storm hall again, joined twice, the storm raging; no pinned line this time. The halls'
  // bridges run no spanning tree until the player turns it on (Linux's default, stp_state 0).
  topology: works({
    halls: HALLS.map((h) => ({ ...h, doors: 5 })),
    machines: [
      machine("pantry", PANTRY, "hall-a", "eth1", 13),
      machine("attic", ATTIC, "hall-a", "eth2", 11),
      machine("forge", FORGE, "hall-b", "eth1", 10),
      machine("chapel", CHAPEL, "hall-b", "eth2", 18),
      machine("laundry", LAUNDRY, "hall-b", "eth3", 19, wrenPeaceReply),
    ],
    spans: [
      { ...span, ...STORM_LINK },
      { ...span2, ...STORM_LINK },
    ],
  }),
  faults: [],
  playerDevice: "observatory",
  access: {
    observatory: OPEN,
    "hall-a": OPEN,
    "hall-b": OPEN,
    ...sealed("pantry", "attic", "forge", "chapel", "laundry"),
  },
  controls: {
    console: "typing",
    cableEnds: { "hall-a:eth3": "works", "hall-a:eth4": "works", "hall-b:eth0": "works", "hall-b:eth4": "works" },
    macBoards: { "hall-a": "works", "hall-b": "works" },
    workbench: "works",
    catching: true,
    // A held door takes about 30 s to open: fast-forward helps.
    timeControl: true,
  },
  tools: { unlock: ["bridge link"] },
  glow: "none",
  winCondition: spareTookOver(SPAN_ENDS, ["hall-a", "hall-b"], "observatory", wrenPeaceReply),
  key: { word: keyFor(peaceId), via: "lab-text" },
  healthChecks: [
    {
      id: "peace-kept",
      object: { kind: "board", device: "hall-a" },
      check: (f) => stpOn(f, "hall-a") && stpOn(f, "hall-b"),
    },
    {
      id: "spare-took-over",
      object: { kind: "corridor", link: "span-2" },
      check: spareTookOver(SPAN_ENDS, ["hall-a", "hall-b"], "observatory", wrenPeaceReply),
    },
    { id: "calm", object: { kind: "corridor", link: "span" }, check: calm(SPANS, 2000, 20) },
  ],
  teaches: [],
  uses: ["broadcast", "flooding", "mac-table", "link-up-down", "switching-loop", "broadcast-storm"],
  cards: ["peacekeeper"],
  misconceptions: [
    { id: "cut-before-peace", detect: cutBeforePeace(SPAN_ENDS) },
    { id: "peace-in-one-hall", detect: peaceInOneHall(["hall-a", "hall-b"], 40_000) },
    { id: "cut-the-held-one", detect: cutTheHeldOne(SPAN_ENDS) },
  ],
  detectorTests: [
    { misconception: "cut-before-peace", steps: [click("hall-a", "lab cable unplug eth4")] },
    { misconception: "peace-in-one-hall", steps: [typed("hall-a", STP_ON, 45_000)] },
    {
      misconception: "cut-the-held-one",
      steps: [typed("hall-a", STP_ON), typed("hall-b", STP_ON), click("hall-a", "lab cable unplug eth4")],
    },
  ],
  solution: [
    typed("hall-a", STP_ON),
    typed("hall-b", STP_ON),
    typed("hall-a", "bridge link show", 1000),
    typed("hall-b", "bridge link show", 1000),
    // The span that carries traffic goes. The held door (hall-a's eth4, holding hall-a's own note)
    // waits for that note to go stale (20 s), then listens 15 s, learns 15 s, and forwards.
    click("hall-a", "lab cable unplug eth3", 55_000),
    typed("hall-b", "bridge link show", 1000),
    bench(LAUNDRY, "hello"),
  ],
  altSolutions: [
    [
      typed("hall-b", STP_ON),
      typed("hall-a", STP_ON, 40_000),
      typed("hall-a", "bridge link show", 1000),
      // hall-b's eth4 is the held door by now: it listens at once, and forwards 30 s later.
      typed("hall-b", "ip link set eth0 down", 40_000),
      bench(LAUNDRY, "hello"),
    ],
  ],
});
