/** floors/floor-7.md · Neighbourhoods. Streets and the `/24`; the registry hands out addresses (DHCP). */
import { keyFor } from "@wirelight/content";
import type { DeviceSpec } from "@wirelight/sim";
import { all, not, ran } from "../predicates";
import { type Access, defineRoom, type Misconception, type Predicate, type SolutionStep } from "../types";
import { answeredBy, claims, echoReplies, hasAddr, onStreet } from "./predicates";
import { ANVIL, BELL, IP, LANTERN, MOTH, QUILL, town } from "./topology";

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
  topology: town({ houses: ["lantern", "quill", "anvil"] }),
  // The observatory lives on the lane, 10.0.2.0/24: a different street.
  faults: [
    { kind: "addr-remove", device: "observatory", cidr: OWN, dev: "eth0" },
    { kind: "addr-set", device: "observatory", cidr: "10.0.2.5/24", dev: "eth0" },
  ],
  playerDevice: "observatory",
  access: access(["lantern", "quill", "anvil"]),
  controls: { console: "typing", slate: SLATE, addressSlots: { "observatory:eth0": "works" } },
  tools: {},
  glow: "symptoms",
  winCondition: answeredBy("observatory", IP.lantern, LANTERN),
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
    { misconception: "right-street-wrong-prefix", steps: [click("observatory", "ip addr add 10.0.1.5/32 dev eth0")] },
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
  topology: town({ houses: ["lantern", "quill", "anvil", "bell", "registry"], extra: { registry: registryService } }),
  faults: [{ kind: "addr-remove", device: "observatory", cidr: OWN, dev: "eth0" }],
  playerDevice: "observatory",
  // The registry's room is open: journal page 7 is there.
  access: access(["lantern", "quill", "anvil", "bell", "registry"], ["registry"]),
  controls: { console: "typing", slate: SLATE, addressSlots: { "observatory:eth0": "broken" } },
  tools: { unlock: ["dhclient"] },
  glow: "symptoms",
  winCondition: all(holdsLease, answeredBy("observatory", IP.lantern, LANTERN)),
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
  { ip: IP.lantern, door: LANTERN },
  { ip: IP.quill, door: QUILL },
  { ip: IP.anvil, door: ANVIL },
  { ip: IP.bell, door: BELL },
  { ip: IP.moth, door: MOTH },
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
  typed("bell", "ip addr del 10.0.1.100/24 dev eth0"),
  typed("bell", "ip addr add 10.0.1.18/24 dev eth0"),
];
const FIX_MOTH = [
  typed("moth", "ip addr del 10.0.2.14/24 dev eth0"),
  typed("moth", "ip addr add 10.0.1.14/24 dev eth0"),
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
    houses: ["lantern", "quill", "anvil", "bell", "moth", "registry"],
    extra: { registry: registryService },
  }),
  faults: [
    { kind: "addr-remove", device: "observatory", cidr: OWN, dev: "eth0" },
    { kind: "addr-remove", device: "moth", cidr: "10.0.1.14/24", dev: "eth0" },
    { kind: "addr-set", device: "moth", cidr: "10.0.2.14/24", dev: "eth0" },
    { kind: "addr-remove", device: "bell", cidr: "10.0.1.18/24", dev: "eth0" },
    { kind: "addr-set", device: "bell", cidr: "10.0.1.100/24", dev: "eth0" },
  ],
  playerDevice: "observatory",
  access: access(["lantern", "quill", "anvil", "bell", "moth", "registry"], ["bell", "moth"]),
  controls: {
    console: "typing",
    slate: SLATE,
    ledgers: { observatory: "works" },
    addressSlots: { "observatory:eth0": "broken", "bell:eth0": "broken", "moth:eth0": "broken" },
  },
  tools: {},
  glow: "none",
  winCondition: (f) => answeredCensus(f).length === CENSUS.length,
  key: { word: keyFor(censusId), via: "mark" },
  healthChecks: [
    { id: "holds-lease", object: { kind: "slot", device: "observatory", iface: "eth0" }, check: holdsLease },
    {
      id: "moth-on-the-square",
      object: { kind: "slot", device: "moth", iface: "eth0" },
      check: hasAddr("moth", "10.0.1.14/24"),
    },
    {
      id: "bell-own-house",
      object: { kind: "slot", device: "bell", iface: "eth0" },
      check: all(hasAddr("bell", "10.0.1.18/24"), not(claims("bell", "10.0.1.100"))),
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
    { misconception: "right-street-wrong-prefix", steps: [typed("moth", "ip addr add 10.0.1.14/16 dev eth0")] },
    {
      misconception: "flush-and-hope",
      steps: [typed("observatory", "ip neigh flush dev eth0"), typed("observatory", "ip neigh flush dev eth0")],
    },
    { misconception: "change-my-address", steps: [typed("observatory", "ip addr add 10.0.1.120/24 dev eth0")] },
    {
      misconception: "census-skip",
      steps: [...FIX_BELL, ASK, ...ROLL.slice(0, 4), typed("observatory", `ping -c 1 ${IP.lantern}`)],
    },
  ],
  solution: [...FIX_BELL, ...FIX_MOTH, ASK, ...ROLL],
  // Asking the registry first: the observatory's client checks .100 (arping -D), finds bell on it,
  // declines and takes the next address (decision 0063); fixing bell after still works.
  altSolutions: [
    [
      ASK,
      ...FIX_BELL,
      typed("moth", "ip addr del 10.0.2.14/24 dev eth0"),
      typed("moth", "ip addr add 10.0.1.14/24 dev eth0", 90_000),
      ...ROLL,
    ],
  ],
});
