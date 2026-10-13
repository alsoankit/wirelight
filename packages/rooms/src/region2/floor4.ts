/** floors/floor-4.md · Memory and Loops. Two halls (hall-a, hall-b), Linux bridges with no loop protection. */
import { announcement, helloWithKey, keepsTheKey, keyFor, messengerMessage } from "@wirelight/content";
import type { LinkSpec } from "@wirelight/sim";
import { labDelivered, ran, ranThen } from "../predicates";
import { defineRoom, type Predicate, type SolutionStep } from "../types";
import {
  boardHas,
  calm,
  messengerHeard,
  noLoop,
  onlyOneHall,
  stalledAfter,
  stuckOnOneHall,
  waitedWithout,
} from "./predicates";
import { ANVIL, announcer, BEACON, BELL, BROADCAST, COMPASS, EMBER, LANTERN, QUILL, WREN, works } from "./topology";

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

// ── 4.1 · The Pinned Memory ────────────────────────────────────────────────────────────────

const pinnedId = "f4.pinned-memory";
const lanternKeyReply = helloWithKey("lantern", keyFor(pinnedId));
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
    observatory: { messenger: { to: LANTERN, msg: messengerMessage, intervalMs: 5000 } },
    machines: [
      // The old corridor: lantern's cable when it lived behind eth1. Its far end lies loose.
      { id: "alcove", mac: "02:00:00:00:00:14", door: "eth1", mute: true },
      // Quill says something once, then goes quiet: its line fades after 300 s (ageing).
      { id: "quill", mac: QUILL, door: "eth2", messenger: { to: "02:00:00:00:00:05", intervalMs: 3_600_000 } },
      // Lantern only answers; it never speaks first.
      { id: "lantern", mac: LANTERN, door: "eth3", reply: lanternKeyReply },
    ],
  }),
  faults: [
    { kind: "unplug", link: "hall-eth1", end: "alcove" },
    // Pinned by hand: `bridge fdb add 02:00:00:00:00:07 dev eth1 master static sticky`. Sticky, so
    // nothing but deleting it moves it (a plain static entry follows the machine on real Linux).
    { kind: "fdb-static", device: "hall", mac: LANTERN, port: "eth1", sticky: true },
  ],
  playerDevice: "observatory",
  access: { observatory: OPEN, hall: OPEN, quill: OPEN, lantern: OPEN, alcove: SEALED },
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
  winCondition: messengerHeard("observatory", "lantern", lanternKeyReply),
  key: { word: keyFor(pinnedId), via: "lab-text" },
  healthChecks: [
    { id: "board-lantern", object: { kind: "board", device: "hall" }, check: boardHas("hall", LANTERN, "eth3") },
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
  solution: [typed("hall", "bridge fdb show"), typed("hall", `bridge fdb del ${LANTERN} dev eth1 master`, 8000)],
});

// ── 4.2 · Who Has the Key? ─────────────────────────────────────────────────────────────────

const whoId = "f4.who-has-the-key";
const anvilReply = helloWithKey("anvil", keyFor(whoId));
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
      { id: "compass", mac: COMPASS, hall: "hall-a", door: "eth1" },
      { id: "beacon", mac: BEACON, hall: "hall-a", door: "eth2" },
      // Anvil's broadcast answer says it keeps the key.
      {
        id: "anvil",
        mac: ANVIL,
        hall: "hall-b",
        door: "eth1",
        broadcastReply: keepsTheKey("anvil"),
        reply: anvilReply,
      },
      { id: "bell", mac: BELL, hall: "hall-b", door: "eth2" },
      { id: "ember", mac: EMBER, hall: "hall-b", door: "eth3" },
    ],
    spans: [span],
  }),
  faults: [],
  playerDevice: "observatory",
  access: {
    observatory: OPEN,
    "hall-a": OPEN,
    "hall-b": OPEN,
    ...sealed("compass", "beacon", "anvil", "bell", "ember"),
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
      check: (f) => boardHas("hall-b", "02:00:00:00:00:05", "eth0")(f) && boardHas("hall-a", ANVIL, "eth3")(f),
    },
  ],
  teaches: ["broadcast-domain"],
  uses: ["broadcast", "flooding", "source-address", "mac-table"],
  cards: ["span"],
  misconceptions: [{ id: "only-hall-a", detect: onlyOneHall("hall-a", "hall-b", "observatory", ANVIL) }],
  detectorTests: [
    { misconception: "only-hall-a", steps: [typed("hall-a", "bridge fdb show"), bench(COMPASS, "hello")] },
  ],
  solution: [bench(BROADCAST, "who?"), bench(ANVIL, "hello")],
});

// ── 4.B ★ The Storm ────────────────────────────────────────────────────────────────────────

const stormId = "f4.boss-storm";
const wrenReply = helloWithKey("wren", keyFor(stormId));
/**
 * The spans are slow (8 kbit/s, 16 frames queued each way), so the storm stays watchable and
 * bounded: copies really circle, but at most a few dozen a second (tech/simulator.md).
 */
const STORM_LINK = { bandwidthBps: 8000, queueLimit: 16 };
const SPANS = ["span", "span-2"];
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
const machine = (id: string, mac: string, hall: string, door: string, last: number, reply?: string) => ({
  id,
  mac,
  hall,
  door,
  announcer: announcer(announcement(id), last),
  ...(reply ? { reply } : {}),
});
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
      machine("compass", COMPASS, "hall-a", "eth1", 13),
      machine("beacon", BEACON, "hall-a", "eth2", 11),
      machine("anvil", ANVIL, "hall-b", "eth1", 10),
      machine("bell", BELL, "hall-b", "eth2", 18),
      machine("wren", WREN, "hall-b", "eth3", 19, wrenReply),
    ],
    // Joined twice, "in case the first one broke": the loop is the room's first fault.
    spans: [
      { ...span, ...STORM_LINK },
      { id: "span-2", a: { device: "hall-a", iface: "eth4" }, b: { device: "hall-b", iface: "eth4" }, ...STORM_LINK },
    ],
  }),
  faults: [{ kind: "fdb-static", device: "hall-b", mac: WREN, port: "eth2", sticky: true }],
  playerDevice: "observatory",
  access: {
    observatory: OPEN,
    "hall-a": OPEN,
    "hall-b": OPEN,
    ...sealed("compass", "beacon", "anvil", "bell", "wren"),
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
    { id: "board-wren", object: { kind: "board", device: "hall-b" }, check: boardHas("hall-b", WREN, "eth3") },
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
      steps: [typed("hall-b", `bridge fdb del ${ANVIL} dev eth1 master`)],
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
    typed("hall-b", `bridge fdb del ${WREN} dev eth2 master`),
    bench(WREN, "hello"),
  ],
  altSolutions: [
    [
      click("hall-a", "lab cable unplug eth4"),
      typed("hall-b", `bridge fdb del ${WREN} dev eth2 master`),
      bench(WREN, "hello"),
    ],
    [
      typed("hall-a", "lab cable unplug eth3"),
      typed("hall-b", `bridge fdb del ${WREN} dev eth2 master`),
      bench(WREN, "hello"),
    ],
  ],
});
