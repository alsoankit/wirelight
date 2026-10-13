/** floors/floor-3.md · The Switch. The hall is a Linux bridge; the player sorts by hand first (0042). */
import { helloWithKey, helloWithKeyPart, keyFor, messengerMessage } from "@wirelight/content";
import { labDelivered, linkUp, printed, ran, sentTo } from "../predicates";
import { defineRoom, type Misconception, type Predicate, type SolutionStep } from "../types";
import {
  behind,
  boardHas,
  boardHasBehind,
  broadcastBeforeLink,
  handSend,
  keeperAwake,
  messengerHeard,
  readBoardTwiceIdle,
  sortedByHand,
} from "./predicates";
import { ANVIL, BEACON, BELL, BROADCAST, COMPASS, EMBER, GATE, LANTERN, QUILL, THISTLE, WREN, works } from "./topology";

const step = (source: "typed" | "click") => (device: string, line: string, waitMs?: number) =>
  ({ device, line, source, ...(waitMs ? { waitMs } : {}) }) as SolutionStep;
const typed = step("typed");
const click = step("click");
/** The workbench seals and sends a frame (lab send-frame), from the observatory. */
const bench = (to: string, msg: string, waitMs?: number) =>
  click("observatory", `lab send-frame --to ${to} --msg "${msg}"`, waitMs);
/** A click at the keeper's desk in the hall (lab keeper …). */
const desk = (line: string, waitMs?: number) => click("hall", `lab keeper ${line}`, waitMs);
const readBoard = typed("hall", "bridge fdb show");

const SEALED = { state: "off-limits" } as const;
const OPEN = { state: "enterable" } as const;
const sealed = (...ids: string[]) => Object.fromEntries(ids.map((id) => [id, SEALED]));
/** Compass and beacon write to each other now and then (3.2, 3.B). */
const chatter = [
  { id: "compass", mac: COMPASS, door: "eth1", messenger: { to: BEACON, intervalMs: 7000 } },
  { id: "beacon", mac: BEACON, door: "eth2", messenger: { to: COMPASS, intervalMs: 9000 } },
];

// Detectors more than one room uses.
const expectsListed: Misconception = { id: "expects-gate-listed", detect: readBoardTwiceIdle("hall") };
const guessing: Misconception = { id: "guessing", detect: sentTo("observatory", "unknown", 2) };
const wrongConsole: Misconception = { id: "wrong-console", detect: ran("observatory", /^bridge fdb\b/) };
const expectsListedTest = { misconception: "expects-gate-listed", steps: [readBoard, readBoard] };
const guessingTest = {
  misconception: "guessing",
  steps: [bench("02:00:00:00:00:08", "hi"), bench("02:00:00:00:00:09", "hi")],
};
const wrongConsoleTest = { misconception: "wrong-console", steps: [typed("observatory", "bridge fdb show")] };

// ── 3.1 · Many Doors ───────────────────────────────────────────────────────────────────────

const manyDoorsId = "f3.many-doors";
const anvilReply = helloWithKey("anvil", keyFor(manyDoorsId));
/** Three frames sorted right by hand, at least one sent out every other door: the keeper remembers. */
const sortedEnough: Predicate = sortedByHand("hall", 3);
export const manyDoors = defineRoom({
  id: manyDoorsId,
  region: 2,
  floor: 3,
  order: 1,
  kind: "learn",
  pathTag: "core",
  content: manyDoorsId,
  seed: 31,
  topology: works({
    observatory: { messenger: { to: ANVIL, msg: messengerMessage, intervalMs: 6000 } },
    machines: [
      { id: "lantern", mac: LANTERN, door: "eth1" },
      { id: "quill", mac: QUILL, door: "eth2" },
      { id: "anvil", mac: ANVIL, door: "eth3", reply: anvilReply },
    ],
  }),
  faults: [{ kind: "keeper-asleep", device: "hall", desk: "switch" }],
  playerDevice: "observatory",
  access: { observatory: OPEN, hall: OPEN, lantern: OPEN, quill: OPEN, anvil: OPEN },
  controls: {
    console: "typing",
    desk: "hall",
    macBoards: { hall: "works" },
    workbench: "works",
    card: "works",
    catching: true,
  },
  // The board is readable here: clicking it runs `bridge fdb show` ("the machine heard"), so the
  // tool is there from this room; 3.2 is where it's typed and explained (CMD-02).
  tools: { unlock: ["lab keeper", "bridge fdb"] },
  glow: "causes",
  winCondition: (f) => keeperAwake("hall")(f) && labDelivered("observatory", anvilReply)(f),
  key: { word: keyFor(manyDoorsId), via: "lab-text" },
  healthChecks: [
    {
      id: "board-knows",
      object: { kind: "board", device: "hall" },
      check: (f) => boardHas("hall", "02:00:00:00:00:05")(f) && boardHas("hall", ANVIL)(f),
    },
    { id: "keeper-awake", object: { kind: "keeper", device: "hall" }, check: keeperAwake("hall") },
  ],
  teaches: ["mac-table", "flooding"],
  uses: ["frame", "mac-address", "destination-address", "source-address"],
  cards: ["switch", "mac-board", "keepers-desk"],
  misconceptions: [
    { id: "back-where-it-came", detect: handSend("hall", (s) => s.where === s.inPort) },
    {
      id: "guess-a-door",
      detect: handSend(
        "hall",
        (s, f) => s.where !== "flood" && s.known === null && s.where !== s.inPort && !behind(f, "hall", s.where, s.dst),
      ),
    },
    { id: "flood-everything", detect: handSend("hall", (s) => s.known !== null && s.where === "flood") },
    { id: "forgot-to-remember", detect: handSend("hall", (s) => !s.srcKnown, 2) },
  ],
  detectorTests: [
    { misconception: "back-where-it-came", steps: [desk("send eth0")] },
    { misconception: "guess-a-door", steps: [desk("send eth1")] },
    {
      misconception: "flood-everything",
      steps: [
        desk("learn 02:00:00:00:00:05 eth0", 100),
        desk("send flood", 500),
        desk(`learn ${ANVIL} eth3`, 100),
        desk("send eth0", 2500),
        desk("send flood"),
      ],
    },
    { misconception: "forgot-to-remember", steps: [desk("send flood", 500), desk("send eth0")] },
  ],
  // The messenger's first frame waits at the desk from 1.5 s, its next from 7.5 s.
  solution: [
    desk("learn 02:00:00:00:00:05 eth0", 100),
    desk("send flood", 500),
    desk(`learn ${ANVIL} eth3`, 100),
    desk("send eth0", 2500),
    desk("send eth3"),
  ],
  rules: [
    // biome-ignore lint/suspicious/noThenProperty: the room format's rule shape (RoomDef.rules).
    { id: "keeper-remembers", when: sortedEnough, then: { kind: "wake-keeper", device: "hall" } },
  ],
});

// ── 3.2 · The Keeper's Memory ──────────────────────────────────────────────────────────────

const memoryId = "f3.keepers-memory";
const gateReply = helloWithKey("gate", keyFor(memoryId));
export const keepersMemory = defineRoom({
  id: memoryId,
  region: 2,
  floor: 3,
  order: 2,
  kind: "learn",
  pathTag: "tool",
  content: memoryId,
  seed: 32,
  topology: works({
    observatory: { messenger: { to: "", msg: messengerMessage } },
    machines: [...chatter, { id: "gate", mac: GATE, door: "eth3", reply: gateReply }],
  }),
  faults: [],
  playerDevice: "observatory",
  access: { observatory: OPEN, hall: OPEN, ...sealed("compass", "beacon", "gate") },
  controls: { console: "typing", macBoards: { hall: "broken" }, workbench: "works", card: "works", catching: true },
  tools: {},
  glow: "symptoms",
  winCondition: labDelivered("observatory", gateReply),
  key: { word: keyFor(memoryId), via: "lab-text" },
  healthChecks: [
    { id: "board-eth3", object: { kind: "board", device: "hall" }, check: boardHasBehind("hall", "eth3") },
  ],
  teaches: ["learning-from-the-source"],
  uses: ["mac-table", "flooding", "broadcast", "source-address"],
  cards: ["clouded-board"],
  commandMemory: "CMD-02",
  misconceptions: [expectsListed, guessing, wrongConsole],
  detectorTests: [expectsListedTest, guessingTest, wrongConsoleTest],
  solution: [bench(BROADCAST, "who?"), readBoard, bench(GATE, "hello")],
  altSolutions: [[bench(BROADCAST, "who?"), readBoard, click("observatory", `lab card --to ${GATE}`)]],
});

// ── 3.3 · Find Everyone ────────────────────────────────────────────────────────────────────

const findId = "f3.find-everyone";
const findKey = keyFor(findId);
const third = Math.ceil(findKey.length / 3);
const parts = [findKey.slice(0, third), findKey.slice(third, 2 * third), findKey.slice(2 * third)];
const letters = [
  { id: "ember", mac: EMBER, door: "eth1" },
  { id: "thistle", mac: THISTLE, door: "eth2" },
  { id: "bell", mac: BELL, door: "eth3" },
].map((m, i) => ({ ...m, reply: helloWithKeyPart(m.id, i + 1, 3, parts[i] as string) }));
const letterAnswered = (i: number) => {
  const m = letters[i] as (typeof letters)[number];
  return messengerHeard("observatory", m.id, m.reply);
};
/** A card given the name behind a different door than its own (card N is door N). */
const swappedDoors: Predicate = (f) =>
  f.trace.some((e) => {
    if (e.kind !== "cmd.exec" || e.device !== "observatory") return false;
    const m = e.line.match(/^lab card --messenger (\d) --to (\S+)$/);
    if (!m) return false;
    const n = Number(m[1]);
    return [1, 2, 3].some((door) => door !== n && behind(f, "hall", `eth${door}`, (m[2] as string).toLowerCase()));
  });
export const findEveryone = defineRoom({
  id: findId,
  region: 2,
  floor: 3,
  order: 3,
  kind: "practice",
  pathTag: "building-block",
  content: findId,
  seed: 33,
  topology: works({
    observatory: { messengers: letters.map((m) => ({ to: m.mac, msg: messengerMessage })) },
    machines: letters,
  }),
  // The Knight wrote only the doors: every card is blank.
  faults: [1, 2, 3].map((n) => ({ kind: "card", device: "observatory", to: "", messenger: n }) as const),
  playerDevice: "observatory",
  access: { observatory: OPEN, hall: OPEN, ...sealed("ember", "thistle", "bell") },
  controls: { console: "typing", macBoards: { hall: "broken" }, workbench: "works", card: "works", catching: true },
  tools: {},
  glow: "symptoms",
  winCondition: (f) => [0, 1, 2].every((i) => letterAnswered(i)(f)),
  key: { word: findKey, via: "lab-text" },
  healthChecks: [0, 1, 2].map((i) => ({
    id: `card-${i + 1}-answered`,
    object: { kind: "card", device: "observatory" } as const,
    check: letterAnswered(i),
  })),
  teaches: [],
  uses: ["mac-table", "learning-from-the-source", "broadcast"],
  cards: [],
  misconceptions: [{ id: "swapped-doors", detect: swappedDoors }],
  detectorTests: [
    { misconception: "swapped-doors", steps: [click("observatory", `lab card --messenger 1 --to ${THISTLE}`)] },
  ],
  solution: [
    bench(BROADCAST, "who?"),
    readBoard,
    click("observatory", `lab card --messenger 1 --to ${EMBER}`),
    click("observatory", `lab card --messenger 2 --to ${THISTLE}`),
    click("observatory", `lab card --messenger 3 --to ${BELL}`),
  ],
});

// ── 3.B · The Busy Hall ────────────────────────────────────────────────────────────────────

const busyId = "f3.boss-busy-hall";
const wrenReply = helloWithKey("wren", keyFor(busyId));
export const busyHall = defineRoom({
  id: busyId,
  region: 2,
  floor: 3,
  order: 9,
  kind: "boss",
  pathTag: "boss",
  content: busyId,
  seed: 39,
  topology: works({
    observatory: { messenger: { to: WREN, msg: messengerMessage } },
    machines: [
      { ...(chatter[0] as (typeof chatter)[number]) },
      { id: "wren", mac: WREN, door: "eth2", reply: wrenReply },
      { ...(chatter[1] as (typeof chatter)[number]), door: "eth3" },
    ],
  }),
  faults: [
    { kind: "iface-down", device: "hall", iface: "eth2" },
    { kind: "card", device: "observatory", to: "02:00:00:00:00:66" },
  ],
  playerDevice: "observatory",
  access: { observatory: OPEN, hall: OPEN, ...sealed("compass", "beacon", "wren") },
  controls: {
    console: "typing",
    plateSwitches: { "hall:eth2": "broken" },
    macBoards: { hall: "broken" },
    workbench: "works",
    card: "works",
    catching: true,
  },
  tools: {},
  glow: "none",
  winCondition: messengerHeard("observatory", "wren", wrenReply),
  key: { word: keyFor(busyId), via: "lab-text" },
  healthChecks: [
    { id: "eth2-up", object: { kind: "door", device: "hall", iface: "eth2" }, check: linkUp("hall", "eth2") },
    { id: "board-wren", object: { kind: "board", device: "hall" }, check: boardHas("hall", WREN, "eth2") },
    {
      id: "card-answered",
      object: { kind: "card", device: "observatory" },
      check: messengerHeard("observatory", "wren", wrenReply),
    },
  ],
  hintTiming: { revealAfterMs: 12 * 60_000 },
  teaches: [],
  uses: [
    "link-up-down",
    "mac-address",
    "destination-address",
    "source-address",
    "broadcast",
    "mac-table",
    "flooding",
    "learning-from-the-source",
  ],
  cards: [],
  misconceptions: [
    expectsListed,
    wrongConsole,
    guessing,
    { id: "wrong-door-name", detect: printed("hall", "Cannot find device") },
    { id: "broadcast-before-link", detect: broadcastBeforeLink("observatory", "hall", "eth2") },
  ],
  detectorTests: [
    expectsListedTest,
    wrongConsoleTest,
    guessingTest,
    { misconception: "wrong-door-name", steps: [typed("hall", "ip link set eth5 up")] },
    { misconception: "broadcast-before-link", steps: [bench(BROADCAST, "who?"), readBoard] },
  ],
  solution: [
    typed("hall", "ip link set eth2 up"),
    bench(BROADCAST, "who?"),
    readBoard,
    click("observatory", `lab card --to ${WREN}`),
  ],
});
