/** floors/floor-7.md · Neighbourhoods. Streets and the `/24`; the registry hands out addresses (DHCP). */
import { keyFor } from "@wirelight/content";
import type { DeviceSpec } from "@wirelight/sim";
import { all, not, ran } from "../predicates";
import { type Access, defineRoom, type Misconception, type Predicate, type SolutionStep } from "../types";
import { answeredBy, claims, echoReplies, hasAddr, onStreet } from "./predicates";
import { CELLAR, CHAPEL, FORGE, IP, KITCHEN, LIBRARY, town } from "./topology";

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
const OWN = "10.0.1.5/24";

/**
 * The registry's address service (7.2, 7.B): dnsmasq's choices, measured (decision 0063). Addresses
 * .100 to .150, the lowest free one first (`--dhcp-sequential-ip`, so the first lease is .100 as the
 * spec says), no ping check before offering (7.B note), and no router option (routes wait for Floor 8).
 */
const registryService: Partial<DeviceSpec> = {
  dhcpServer: { range: ["10.0.1.100", "10.0.1.150"], pingCheck: false, sequential: true, router: null },
};

/** The observatory got its address from the registry: dhclient ran cleanly and it holds one from the pool. */
const holdsLease: Predicate = (f) =>
  // dhclient keeps running after it binds (its exec has no exit code yet); it reports success when
  // it goes to the background, as a proc.exit with 0.
  f.trace.some((e) => {
    if (e.kind !== "cmd.exec" || e.device !== "observatory" || !/^dhclient\b/.test(e.line)) return false;
    return (
      e.exitCode === 0 ||
      f.trace.some(
        (x) => x.kind === "proc.exit" && x.device === "observatory" && x.execId === e.execId && x.exitCode === 0,
      )
    );
  }) &&
  (f.world.device("observatory")?.addrs.some((a) => {
    const n = Number(a.ip.split(".")[3]);
    return a.ip.startsWith("10.0.1.") && n >= 100 && n <= 150 && a.prefix === 24;
  }) ??
    false);

const TAKEN = /^ip addr add 10\.0\.1\.(2|7|10|12|14|18)\/\d+ /;
const guessANumber: Misconception = { id: "guess-a-number", detect: ran("observatory", TAKEN) };
const wrongPrefix = (device: string | null): Misconception => ({
  id: "right-street-wrong-prefix",
  detect: ran(device, /^ip addr add 10\.0\.1\.\d+(\/(?!24\b)\d+)? dev /),
});

// ── 7.1 · Same Street? ─────────────────────────────────────────────────────────────────────

const sameStreetId = "f7.same-street";
export const sameStreet = defineRoom({
  id: sameStreetId,
  region: 3,
  floor: 7,
  order: 1,
  kind: "learn",
  pathTag: "core",
  content: sameStreetId,
  seed: 71,
  topology: town({ houses: ["kitchen", "library", "forge"] }),
  // The observatory lives on the lane, 10.0.2.0/24: a different street.
  faults: [
    { kind: "addr-remove", device: "observatory", cidr: OWN, dev: "eth0" },
    { kind: "addr-set", device: "observatory", cidr: "10.0.2.5/24", dev: "eth0" },
  ],
  playerDevice: "observatory",
  access: access(["kitchen", "library", "forge"]),
  controls: { console: "typing", slate: SLATE, addressSlots: { "observatory:eth0": "works" } },
  tools: {},
  glow: "symptoms",
  winCondition: answeredBy("observatory", IP.kitchen, KITCHEN),
  key: { word: keyFor(sameStreetId), via: "mark" },
  healthChecks: [
    {
      id: "on-the-square",
      object: { kind: "slot", device: "observatory", iface: "eth0" },
      check: onStreet("observatory", "10.0.1."),
    },
  ],
  teaches: ["subnet", "prefix-length"],
  uses: ["ip-address", "ping", "arp"],
  cards: ["street-sign", "prefix"],
  misconceptions: [
    wrongPrefix("observatory"),
    { id: "take-lanterns-house", detect: ran("observatory", /^ip addr add 10\.0\.1\.7\/\d+ /) },
    { id: "ping-the-lane", detect: ran("observatory", /^ping\b.*\s10\.0\.2\.\d+$/) },
  ],
  detectorTests: [
    { misconception: "right-street-wrong-prefix", steps: [click("observatory", "ip addr add 10.0.1.5/16 dev eth0")] },
    { misconception: "take-lanterns-house", steps: [click("observatory", "ip addr add 10.0.1.7/24 dev eth0")] },
    { misconception: "ping-the-lane", steps: [typed("observatory", "ping -c 1 10.0.2.7")] },
  ],
  solution: [
    click("observatory", "ip addr del 10.0.2.5/24 dev eth0"),
    click("observatory", `ip addr add ${OWN} dev eth0`),
    typed("observatory", "ping -c 3 10.0.1.7"),
  ],
});

// ── 7.2 · Ask for an Address ───────────────────────────────────────────────────────────────

const askId = "f7.ask-for-an-address";
export const askForAnAddress = defineRoom({
  id: askId,
  region: 3,
  floor: 7,
  order: 2,
  kind: "learn",
  pathTag: "tool",
  content: askId,
  seed: 72,
  topology: town({
    houses: ["kitchen", "library", "forge", "chapel", "registry"],
    extra: { registry: registryService },
  }),
  faults: [{ kind: "addr-remove", device: "observatory", cidr: OWN, dev: "eth0" }],
  playerDevice: "observatory",
  // The registry's room is open: journal page 7 is there.
  access: access(["kitchen", "library", "forge", "chapel", "registry"], ["registry"]),
  controls: { console: "typing", slate: SLATE, addressSlots: { "observatory:eth0": "broken" } },
  tools: { unlock: ["dhclient"] },
  glow: "symptoms",
  winCondition: all(holdsLease, answeredBy("observatory", IP.kitchen, KITCHEN)),
  key: { word: keyFor(askId), via: "mark" },
  healthChecks: [
    { id: "holds-lease", object: { kind: "slot", device: "observatory", iface: "eth0" }, check: holdsLease },
  ],
  teaches: ["dhcp", "lease"],
  uses: ["subnet", "prefix-length", "broadcast", "ip-address", "ping"],
  cards: ["registry", "lease"],
  commandMemory: "CMD-07",
  misconceptions: [
    guessANumber,
    { id: "dhclient-wrong-door", detect: ran("observatory", /^dhclient(\s+-\S+)*\s+(?!eth0$)\S+$/) },
  ],
  detectorTests: [
    { misconception: "guess-a-number", steps: [typed("observatory", "ip addr add 10.0.1.10/24 dev eth0")] },
    { misconception: "dhclient-wrong-door", steps: [typed("observatory", "dhclient -v eth1")] },
  ],
  solution: [typed("observatory", "dhclient -v eth0", 10_000), typed("observatory", "ping -c 3 10.0.1.7")],
});

// ── 7.B ★ The Census ───────────────────────────────────────────────────────────────────────

const censusId = "f7.boss-census";
const CENSUS = [
  { ip: IP.kitchen, door: KITCHEN },
  { ip: IP.library, door: LIBRARY },
  { ip: IP.forge, door: FORGE },
  { ip: IP.chapel, door: CHAPEL },
  { ip: IP.cellar, door: CELLAR },
];
const answeredCensus = (f: Parameters<Predicate>[0]) =>
  CENSUS.filter((h) => echoReplies(f, "observatory").some((r) => r.ip === h.ip && r.mac === h.door));
/** Four of the five answered, and then the player pinged one of those four again. */
const censusSkip: Predicate = (f) => {
  const replies = echoReplies(f, "observatory");
  return f.trace.some((e) => {
    if (e.kind !== "cmd.exec" || e.device !== "observatory" || !/^ping\b/.test(e.line)) return false;
    const heard = CENSUS.filter((h) => replies.some((r) => r.t < e.t && r.ip === h.ip && r.mac === h.door));
    return heard.length === 4 && heard.some((h) => e.line.endsWith(` ${h.ip}`));
  });
};
const FIX_BELL = [
  typed("chapel", "ip addr del 10.0.1.100/24 dev eth0"),
  typed("chapel", "ip addr add 10.0.1.18/24 dev eth0"),
];
const FIX_MOTH = [
  typed("cellar", "ip addr del 10.0.2.14/24 dev eth0"),
  typed("cellar", "ip addr add 10.0.1.14/24 dev eth0"),
];
const ASK = typed("observatory", "dhclient -v eth0", 10_000);
const ROLL = CENSUS.map((h) => typed("observatory", `ping -c 1 ${h.ip}`));
export const census = defineRoom({
  id: censusId,
  region: 3,
  floor: 7,
  order: 9,
  kind: "boss",
  pathTag: "boss",
  content: censusId,
  seed: 79,
  topology: town({
    houses: ["kitchen", "library", "forge", "chapel", "cellar", "registry"],
    extra: { registry: registryService },
  }),
  faults: [
    { kind: "addr-remove", device: "observatory", cidr: OWN, dev: "eth0" },
    { kind: "addr-remove", device: "cellar", cidr: "10.0.1.14/24", dev: "eth0" },
    { kind: "addr-set", device: "cellar", cidr: "10.0.2.14/24", dev: "eth0" },
    { kind: "addr-remove", device: "chapel", cidr: "10.0.1.18/24", dev: "eth0" },
    { kind: "addr-set", device: "chapel", cidr: "10.0.1.100/24", dev: "eth0" },
  ],
  playerDevice: "observatory",
  access: access(["kitchen", "library", "forge", "chapel", "cellar", "registry"], ["chapel", "cellar"]),
  controls: {
    console: "typing",
    slate: SLATE,
    ledgers: { observatory: "works" },
    addressSlots: { "observatory:eth0": "broken", "chapel:eth0": "broken", "cellar:eth0": "broken" },
  },
  tools: {},
  glow: "none",
  winCondition: (f) => answeredCensus(f).length === CENSUS.length,
  key: { word: keyFor(censusId), via: "mark" },
  healthChecks: [
    { id: "holds-lease", object: { kind: "slot", device: "observatory", iface: "eth0" }, check: holdsLease },
    {
      id: "cellar-on-the-square",
      object: { kind: "slot", device: "cellar", iface: "eth0" },
      check: hasAddr("cellar", "10.0.1.14/24"),
    },
    {
      id: "chapel-own-house",
      object: { kind: "slot", device: "chapel", iface: "eth0" },
      check: all(hasAddr("chapel", "10.0.1.18/24"), not(claims("chapel", "10.0.1.100"))),
    },
  ],
  hintTiming: { revealAfterMs: 12 * 60_000 },
  teaches: [],
  uses: ["subnet", "prefix-length", "dhcp", "lease", "duplicate-address", "ip-address", "ping", "neighbour-ledger"],
  cards: [],
  misconceptions: [
    guessANumber,
    wrongPrefix(null),
    { id: "flush-and-hope", detect: ran("observatory", /^ip neigh (flush|del)\b/, 2) },
    { id: "change-my-address", detect: ran("observatory", /^ip addr (add|del) /) },
    { id: "census-skip", detect: censusSkip },
  ],
  detectorTests: [
    { misconception: "guess-a-number", steps: [typed("observatory", "ip addr add 10.0.1.10/24 dev eth0")] },
    { misconception: "right-street-wrong-prefix", steps: [typed("cellar", "ip addr add 10.0.1.14/16 dev eth0")] },
    {
      misconception: "flush-and-hope",
      steps: [typed("observatory", "ip neigh flush dev eth0"), typed("observatory", "ip neigh flush dev eth0")],
    },
    { misconception: "change-my-address", steps: [typed("observatory", "ip addr add 10.0.1.120/24 dev eth0")] },
    {
      misconception: "census-skip",
      steps: [...FIX_BELL, ASK, ...ROLL.slice(0, 4), typed("observatory", `ping -c 1 ${IP.kitchen}`)],
    },
  ],
  solution: [...FIX_BELL, ...FIX_MOTH, ASK, ...ROLL],
  // Asking the registry first: the observatory's client checks .100 (arping -D), finds chapel on it,
  // declines and takes the next address (decision 0063); fixing chapel after still works.
  altSolutions: [
    [
      ASK,
      ...FIX_BELL,
      typed("cellar", "ip addr del 10.0.2.14/24 dev eth0"),
      typed("cellar", "ip addr add 10.0.1.14/24 dev eth0", 90_000),
      ...ROLL,
    ],
  ],
});

// ── Secret · The Binary Behind /24 ─────────────────────────────────────────────────────────

/**
 * Region 3's secret room (floors/floor-7.md, "Secret room"): behind the street sign, after the census.
 * The observatory's plate says `/25`: one bit more of street, so the square is cut in two halves
 * (.0–.127 and .128–.255). Kitchen (.7) still answers; chapel, at .200 on the same square, is on the
 * other half, so the observatory doesn't even try (`connect: Network is unreachable`). Giving the
 * house its `/24` back makes the street whole. No `ip route` yet (Floor 8), so the only fix is the prefix.
 */
const secretBinaryId = "f7.secret-binary";
const BELL_HOUSE = "10.0.1.200";
export const binaryBehind24 = defineRoom({
  id: secretBinaryId,
  region: 3,
  floor: 7,
  order: 50,
  kind: "secret",
  pathTag: "all",
  content: secretBinaryId,
  vars: { chapel: BELL_HOUSE, kitchen: IP.kitchen },
  seed: 750,
  topology: town({
    houses: ["kitchen", "chapel"],
    extra: { chapel: { addrs: [{ dev: "eth0", cidr: `${BELL_HOUSE}/24` }] } },
  }),
  faults: [
    { kind: "addr-remove", device: "observatory", cidr: OWN, dev: "eth0" },
    { kind: "addr-set", device: "observatory", cidr: "10.0.1.5/25", dev: "eth0" },
  ],
  playerDevice: "observatory",
  // Chapel's door is open: moving chapel instead is a detector.
  access: access(["kitchen", "chapel"], ["chapel"]),
  controls: { console: "typing", slate: SLATE, addressSlots: { "observatory:eth0": "broken" } },
  tools: {},
  glow: "none",
  winCondition: answeredBy("observatory", BELL_HOUSE, CHAPEL),
  key: { word: keyFor(secretBinaryId), via: "mark" },
  healthChecks: [
    {
      id: "whole-street",
      object: { kind: "slot", device: "observatory", iface: "eth0" },
      check: hasAddr("observatory", OWN),
    },
  ],
  teaches: [],
  uses: ["ip-address", "subnet", "prefix-length", "ping"],
  cards: ["thirty-two-bits"],
  misconceptions: [
    // A shorter prefix than the square's: chapel answers, but the street is now far bigger than the square.
    { id: "street-too-big", detect: ran("observatory", /^ip addr add 10\.0\.1\.\d+\/(1?\d|2[0-3]) /) },
    // Moving house to chapel's half: chapel answers, kitchen no longer does.
    {
      id: "other-half",
      detect: ran("observatory", /^ip addr add 10\.0\.1\.(12[89]|1[3-9]\d|2[0-4]\d|25[0-5])\/25 /),
    },
    { id: "move-chapel", detect: ran("chapel", /^ip addr (add|del) /) },
  ],
  detectorTests: [
    { misconception: "street-too-big", steps: [typed("observatory", "ip addr add 10.0.1.5/16 dev eth0")] },
    { misconception: "other-half", steps: [typed("observatory", "ip addr add 10.0.1.130/25 dev eth0")] },
    {
      misconception: "move-chapel",
      steps: [
        typed("chapel", "ip addr del 10.0.1.200/24 dev eth0"),
        typed("chapel", "ip addr add 10.0.1.100/24 dev eth0"),
      ],
    },
  ],
  solution: [
    typed("observatory", "ip addr del 10.0.1.5/25 dev eth0"),
    typed("observatory", `ip addr add ${OWN} dev eth0`),
    typed("observatory", "ping -c 3 10.0.1.200"),
  ],
  // Keeping the half-street address and adding the whole street's beside it also works.
  altSolutions: [[typed("observatory", `ip addr add ${OWN} dev eth0`), typed("observatory", "ping -c 3 10.0.1.200")]],
});
