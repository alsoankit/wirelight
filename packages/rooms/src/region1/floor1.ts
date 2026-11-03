/** floors/floor-1.md · The Wire. Everything is done by clicking; no console yet (0032). */
import { helloWithKey, keyFor, lanternHello } from "@wirelight/content";
import {
  all,
  corridorLit,
  labDelivered,
  linkUp,
  not,
  ran,
  ranBefore,
  ranThen,
  stalledAfterFirstFix,
} from "../predicates";
import { type Controls, defineRoom, type Misconception, type SolutionStep } from "../types";
import { halls } from "./topology";

const click = (device: string, line: string, waitMs?: number): SolutionStep => ({
  device,
  line,
  source: "click",
  ...(waitMs ? { waitMs } : {}),
});
const readPlate = (device: string) => click(device, "ip link show eth0");
const PLATE = /^ip link show eth0$/;
const PLUG = /^lab cable plug eth0$/;
const UNPLUG = /^lab cable unplug eth0$/;
const BOTH_ROOMS = { observatory: { state: "enterable" }, kitchen: { state: "enterable" } } as const;
const keyMessage = (room: string) => helloWithKey("kitchen", keyFor(room));

const wireLit = { id: "wire-lit", object: { kind: "corridor", link: "wire" }, check: corridorLit("wire") } as const;
const doorUp = (device: string) => ({
  id: `${device}-door-up`,
  object: { kind: "door", device, iface: "eth0" } as const,
  check: linkUp(device, "eth0"),
});

/** Plate switches and cable ends all work on this floor: nothing is worn out before the gift of the voice. */
const working = (switches: boolean, ends: boolean): Controls => ({
  console: "hidden",
  ...(switches ? { plateSwitches: { "observatory:eth0": "works", "kitchen:eth0": "works" } } : {}),
  ...(ends ? { cableEnds: { "observatory:eth0": "works", "kitchen:eth0": "works" } } : {}),
});

const blamingLantern: Misconception = { id: "blaming-kitchen", detect: ranBefore("kitchen", PLATE, PLUG) };
const replugging: Misconception = { id: "replugging", detect: ranThen(UNPLUG, PLUG) };
const blamingLanternTest = { misconception: "blaming-kitchen", steps: [readPlate("kitchen")] };
const repluggingTest = {
  misconception: "replugging",
  steps: [click("observatory", "lab cable unplug eth0"), click("observatory", "lab cable plug eth0")],
};

// ── 1.1 · Two Rooms, One Cable ─────────────────────────────────────────────────────────────

const twoRoomsId = "f1.two-rooms";
const readLantern = ran("kitchen", PLATE);
export const twoRooms = defineRoom({
  id: twoRoomsId,
  region: 1,
  floor: 1,
  order: 1,
  kind: "learn",
  pathTag: "tool",
  content: twoRoomsId,
  seed: 11,
  topology: halls({ lanternMessage: lanternHello }),
  faults: [],
  playerDevice: "observatory",
  access: BOTH_ROOMS,
  controls: working(false, false),
  tools: { unlock: ["ip link"] },
  glow: "causes",
  // The lock opens when you know whose room it is: kitchen's plate has been read.
  winCondition: readLantern,
  key: { word: keyFor(twoRoomsId), via: "lock" },
  healthChecks: [
    { id: "kitchen-plate", object: { kind: "door", device: "kitchen", iface: "eth0" }, check: readLantern },
  ],
  teaches: ["interface"],
  uses: [],
  cards: ["door", "plate", "link-light"],
  misconceptions: [{ id: "staying-put", detect: all(ran("observatory", PLATE, 3), not(readLantern)) }],
  detectorTests: [
    {
      misconception: "staying-put",
      steps: [readPlate("observatory"), readPlate("observatory"), readPlate("observatory")],
    },
  ],
  solution: [readPlate("kitchen")],
});

// ── 1.2 · The Loose Cable ──────────────────────────────────────────────────────────────────

const looseId = "f1.loose-cable";
export const looseCable = defineRoom({
  id: looseId,
  region: 1,
  floor: 1,
  order: 2,
  kind: "break",
  pathTag: "tool",
  content: looseId,
  seed: 12,
  topology: halls({ lanternMessage: keyMessage(looseId) }),
  faults: [{ kind: "unplug", link: "wire", end: "observatory" }],
  playerDevice: "observatory",
  access: BOTH_ROOMS,
  controls: { console: "hidden", cableEnds: { "observatory:eth0": "works" } },
  tools: { unlock: ["lab cable"] },
  glow: "symptoms",
  winCondition: labDelivered("observatory", keyMessage(looseId)),
  key: { word: keyFor(looseId), via: "lab-text" },
  healthChecks: [doorUp("observatory"), wireLit],
  teaches: ["link", "link-light"],
  uses: ["interface"],
  cards: ["cable-end"],
  misconceptions: [blamingLantern],
  detectorTests: [blamingLanternTest],
  solution: [click("observatory", "lab cable plug eth0")],
});

// ── 1.3 · Both Ends ────────────────────────────────────────────────────────────────────────

const bothId = "f1.both-ends";
export const bothEnds = defineRoom({
  id: bothId,
  region: 1,
  floor: 1,
  order: 3,
  kind: "break",
  pathTag: "tool",
  content: bothId,
  seed: 13,
  topology: halls({ lanternMessage: keyMessage(bothId) }),
  faults: [{ kind: "iface-down", device: "kitchen", iface: "eth0" }],
  playerDevice: "observatory",
  access: BOTH_ROOMS,
  controls: working(true, true),
  tools: {},
  glow: "symptoms",
  winCondition: labDelivered("observatory", keyMessage(bothId)),
  key: { word: keyFor(bothId), via: "lab-text" },
  healthChecks: [doorUp("kitchen"), wireLit],
  teaches: ["link-up-down"],
  uses: ["interface", "link", "link-light"],
  cards: ["door-switch"],
  misconceptions: [replugging],
  detectorTests: [repluggingTest],
  solution: [click("kitchen", "ip link set eth0 up")],
});

// ── 1.B · The Dark Corridor ────────────────────────────────────────────────────────────────

const bossId = "f1.boss-dark-corridor";
const FIXES = [
  { device: "observatory", line: /^ip link set eth0 up$/ },
  { device: "kitchen", line: PLUG },
  { device: "kitchen", line: /^ip link set eth0 up$/ },
];
export const darkCorridor = defineRoom({
  id: bossId,
  region: 1,
  floor: 1,
  order: 9,
  kind: "boss",
  pathTag: "boss",
  content: bossId,
  seed: 19,
  topology: halls({ lanternMessage: keyMessage(bossId) }),
  faults: [
    { kind: "unplug", link: "wire", end: "kitchen" },
    { kind: "iface-down", device: "observatory", iface: "eth0" },
    { kind: "iface-down", device: "kitchen", iface: "eth0" },
  ],
  playerDevice: "observatory",
  access: BOTH_ROOMS,
  controls: working(true, true),
  tools: {},
  glow: "none",
  winCondition: labDelivered("observatory", keyMessage(bossId)),
  key: { word: keyFor(bossId), via: "lab-text" },
  healthChecks: [
    { id: "cable-in", object: { kind: "corridor", link: "wire" }, check: ({ world }) => !!world.links()[0]?.plugged },
    doorUp("observatory"),
    doorUp("kitchen"),
  ],
  hintTiming: { revealAfterMs: 12 * 60_000 },
  teaches: [],
  uses: ["interface", "link", "link-light", "link-up-down"],
  cards: [],
  misconceptions: [blamingLantern, replugging, { id: "one-fix-only", detect: stalledAfterFirstFix(FIXES, 20_000) }],
  detectorTests: [
    blamingLanternTest,
    {
      misconception: "replugging",
      steps: [click("observatory", "lab cable unplug eth0"), click("observatory", "lab cable plug eth0")],
    },
    { misconception: "one-fix-only", steps: [click("observatory", "ip link set eth0 up", 25_000)] },
  ],
  solution: [
    click("observatory", "ip link set eth0 up"),
    click("kitchen", "lab cable plug eth0"),
    click("kitchen", "ip link set eth0 up"),
  ],
});
