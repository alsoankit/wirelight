/** floors/floor-9.md · The Journey (the first release's finale). Keys are marks on the winning answer. */
import { keyFor } from "@wirelight/content";
import { all, ran } from "../predicates";
import { defineRoom, type Misconception, type Predicate } from "../types";
import { click, crackedBoards, openRooms, typed } from "./floor8";
import {
  compared,
  failedChangesWithoutLooking,
  hasRoute,
  holdsLease,
  noteFrom,
  pingAnswered,
  pingWithTtl,
  sysctlIs,
  tracedHops,
} from "./predicates";
import { cathedral, HOME, homeBox, IP, STREET } from "./topology";

const FORWARD = "net.ipv4.ip_forward";
const ROUTE_CHANGE = /^ip route (?:add|del|delete|change|replace|append|flush)\b/;
const EXCEEDED = "Time to live exceeded";

/** Values the text names, from the topology (0055). */
const VARS = {
  observatory: IP.observatory,
  crossingNave: IP.crossing0,
  archCloister: IP.arch0,
  archTower: IP.arch1,
  spireTower: IP.spire0,
  spireWindow: IP.spire1,
  lumen: IP.lumen,
  wren: IP.wren,
  halo: IP.halo,
  tower: STREET.tower,
  window: STREET.window,
  nowhere: "10.0.4.9",
};

/** Boards cracked, lecterns for watching only; the Slate with its tracer and compare (9.1 on). */
const controls = (t: ReturnType<typeof cathedral>) => ({
  console: "typing" as const,
  routingBoards: crackedBoards(t),
  slate: { catch: true, capture: true, trace: true },
});

// Detectors more than one room uses (9.B inherits them).
const ttlZero: Misconception = { id: "ttl-zero", detect: pingWithTtl("observatory", (t) => t === 0) };
const raiseTheTtl: Misconception = { id: "raise-the-ttl", detect: pingWithTtl("observatory", (t) => t > 64) };

// ── 9.1 · Two Envelopes ────────────────────────────────────────────────────────────────────

const envelopesId = "f9.two-envelopes";
const envelopesTopo = cathedral({ tower: true });
export const twoEnvelopes = defineRoom({
  id: envelopesId,
  region: 4,
  floor: 9,
  order: 1,
  kind: "learn",
  pathTag: "tool",
  content: envelopesId,
  vars: VARS,
  seed: 91,
  topology: envelopesTopo,
  faults: [],
  playerDevice: "observatory",
  access: openRooms(envelopesTopo),
  controls: controls(envelopesTopo),
  tools: { unlock: ["lab slate trace"] },
  glow: "symptoms",
  // Arch's lock opens on a compare showing a new frame around the same packet.
  winCondition: compared(
    (c) => c.samePacket && !c.sameStreet && c.changed.includes("frame.to") && c.changed.includes("frame.from"),
  ),
  key: { word: keyFor(envelopesId), via: "mark" },
  healthChecks: [],
  teaches: ["hop"],
  uses: ["frame", "packet", "encapsulation", "router", "routing-table", "mac-address", "ip-address"],
  cards: ["tracer", "compare", "hop"],
  misconceptions: [
    { id: "compare-same-street", detect: compared((c) => c.sameStreet) },
    { id: "compare-different-packets", detect: compared((c) => !c.samePacket) },
  ],
  detectorTests: [
    {
      // Two catches at the observatory's own door: two pings on one street.
      misconception: "compare-same-street",
      steps: [
        click("observatory", "lab slate catch --next --from 10.0.1.5", 100),
        typed("observatory", "ping -c 1 10.0.3.7", 2000),
        click("observatory", "lab slate catch --next --from 10.0.1.5", 100),
        typed("observatory", "ping -c 1 10.0.3.7", 2000),
        click("observatory", "lab slate compare 1 2"),
      ],
    },
    {
      misconception: "compare-different-packets",
      steps: [
        click("observatory", "lab slate trace --next", 100),
        typed("observatory", "ping -c 1 10.0.3.7", 2000),
        click("observatory", "lab slate trace --next", 100),
        typed("observatory", "ping -c 1 10.0.3.7", 2000),
        click("observatory", "lab slate compare 1 4"),
      ],
    },
  ],
  solution: [
    click("observatory", "lab slate trace --next", 100),
    typed("observatory", "ping -c 1 10.0.3.7", 2000),
    click("observatory", "lab slate compare 1 3"),
  ],
  // The nave catch with the cloister catch, as hint 5 says.
  altSolutions: [
    [
      click("observatory", "lab slate trace --next", 100),
      typed("observatory", "ping -c 1 10.0.3.7", 2000),
      click("observatory", "lab slate compare 1 2"),
    ],
  ],
});

// ── 9.2 · Show the Way ─────────────────────────────────────────────────────────────────────

const showId = "f9.show-the-way";
const showTopo = cathedral({ tower: true, wren: true });
export const showTheWay = defineRoom({
  id: showId,
  region: 4,
  floor: 9,
  order: 2,
  kind: "practice",
  pathTag: "building-block",
  content: showId,
  vars: VARS,
  seed: 92,
  topology: showTopo,
  faults: [{ kind: "route-remove", device: "wren", dst: "default" }],
  playerDevice: "observatory",
  access: openRooms(showTopo),
  controls: controls(showTopo),
  tools: {},
  glow: "symptoms",
  winCondition: (f) => pingAnswered("wren", IP.observatory)(f) && tracedHops("wren", 3)(f),
  key: { word: keyFor(showId), via: "mark" },
  healthChecks: [
    { id: "wren-gateway", object: { kind: "board", device: "wren" }, check: hasRoute("wren", "default", IP.arch1) },
  ],
  teaches: [],
  uses: ["routing-table", "default-gateway", "return-path", "hop"],
  cards: [],
  misconceptions: [
    { id: "gateway-far", detect: ran("wren", /^ip route (?:add|replace) default via (?!10\.0\.3\.)\S+$/) },
  ],
  detectorTests: [{ misconception: "gateway-far", steps: [typed("wren", "ip route add default via 10.0.2.1")] }],
  solution: [
    typed("wren", "ip route add default via 10.0.3.1"),
    click("wren", "lab slate trace --next", 100),
    typed("wren", "ping -c 1 10.0.1.5"),
  ],
});

// ── 9.3 · One Step Only ────────────────────────────────────────────────────────────────────

const oneStepId = "f9.one-step-only";
const oneStepTopo = cathedral({ tower: true });
const crossingLock = noteFrom("observatory", IP.crossing0, EXCEEDED);
const archLock = noteFrom("observatory", IP.arch0, EXCEEDED);
export const oneStepOnly = defineRoom({
  id: oneStepId,
  region: 4,
  floor: 9,
  order: 3,
  kind: "learn",
  pathTag: "core",
  content: oneStepId,
  vars: VARS,
  seed: 93,
  topology: oneStepTopo,
  faults: [],
  playerDevice: "observatory",
  access: openRooms(oneStepTopo),
  controls: controls(oneStepTopo),
  tools: {},
  glow: "symptoms",
  // `Time to live exceeded` and the `-t` errors are new here.
  subtitles: true,
  winCondition: (f) => crossingLock(f) && archLock(f),
  key: { word: keyFor(oneStepId), via: "mark" },
  healthChecks: [
    { id: "crossing-lock", object: { kind: "keeper", device: "crossing" }, check: crossingLock },
    { id: "arch-lock", object: { kind: "keeper", device: "arch" }, check: archLock },
  ],
  teaches: ["ttl", "icmp"],
  uses: ["hop", "router", "packet", "ping"],
  cards: ["ttl", "icmp-note"],
  commandMemory: "CMD-11",
  misconceptions: [ttlZero, { id: "ttl-too-big", detect: pingWithTtl("observatory", (t) => t >= 3, 2) }],
  detectorTests: [
    { misconception: "ttl-zero", steps: [typed("observatory", "ping -c 1 -t 0 10.0.3.7")] },
    {
      misconception: "ttl-too-big",
      steps: [typed("observatory", "ping -c 1 -t 3 10.0.3.7"), typed("observatory", "ping -c 1 -t 5 10.0.3.7")],
    },
  ],
  solution: [typed("observatory", "ping -c 1 -t 1 10.0.3.7"), typed("observatory", "ping -c 1 -t 2 10.0.3.7")],
});

// ── 9.4 · Round and Round ──────────────────────────────────────────────────────────────────

const roundId = "f9.round-and-round";
const windowTopo = cathedral({ tower: true, highWindow: true });
const archToWindow = hasRoute("arch", STREET.window, IP.spire0);
export const roundAndRound = defineRoom({
  id: roundId,
  region: 4,
  floor: 9,
  order: 4,
  kind: "break",
  pathTag: "core",
  content: roundId,
  vars: VARS,
  seed: 94,
  topology: windowTopo,
  faults: [{ kind: "route-remove", device: "arch", dst: STREET.window }],
  playerDevice: "observatory",
  access: openRooms(windowTopo),
  controls: controls(windowTopo),
  tools: {},
  glow: "symptoms",
  winCondition: pingAnswered("observatory", IP.halo),
  key: { word: keyFor(roundId), via: "mark" },
  healthChecks: [{ id: "arch-knows-window", object: { kind: "board", device: "arch" }, check: archToWindow }],
  teaches: ["routing-loop"],
  uses: ["ttl", "icmp", "routing-table", "specific-route", "default-gateway", "hop"],
  cards: ["routing-loop"],
  misconceptions: [
    { id: "fix-crossing", detect: ran("crossing", /^ip route (?:add|del|delete|change|replace)\b.*10\.0\.4\.0\/24/) },
    raiseTheTtl,
  ],
  detectorTests: [
    { misconception: "fix-crossing", steps: [typed("crossing", "ip route del 10.0.4.0/24")] },
    { misconception: "raise-the-ttl", steps: [typed("observatory", "ping -c 1 -t 255 10.0.4.7")] },
  ],
  solution: [typed("arch", "ip route add 10.0.4.0/24 via 10.0.3.2"), typed("observatory", "ping -c 3 10.0.4.7")],
});

// ── 9.B ★ The Crossing ─────────────────────────────────────────────────────────────────────

const crossingId = "f9.boss-crossing";
/** Crossing can reach a street through arch: a line for it, or a default via arch. */
const crossingVia =
  (street: string): Predicate =>
  (f) =>
    hasRoute("crossing", street, IP.arch0)(f) || hasRoute("crossing", "default", IP.arch0)(f);
export const theCrossing = defineRoom({
  id: crossingId,
  region: 4,
  floor: 9,
  order: 9,
  kind: "boss",
  pathTag: "boss",
  content: crossingId,
  vars: VARS,
  seed: 99,
  topology: windowTopo,
  faults: [
    { kind: "route-remove", device: "crossing", dst: STREET.tower },
    { kind: "route-remove", device: "crossing", dst: STREET.window },
    { kind: "route-remove", device: "arch", dst: STREET.window },
    { kind: "sysctl", device: "spire", key: FORWARD, value: "0" },
    // A door nobody has.
    { kind: "route-set", device: "halo", route: { dst: "default", via: "10.0.4.9" } },
  ],
  playerDevice: "observatory",
  access: openRooms(windowTopo),
  controls: controls(windowTopo),
  tools: {},
  glow: "none",
  winCondition: pingAnswered("observatory", IP.halo),
  key: { word: keyFor(crossingId), via: "mark" },
  healthChecks: [
    {
      id: "crossing-knows-the-way",
      object: { kind: "board", device: "crossing" },
      check: (f) => crossingVia(STREET.tower)(f) && crossingVia(STREET.window)(f),
    },
    { id: "arch-knows-window", object: { kind: "board", device: "arch" }, check: archToWindow },
    { id: "spire-forwards", object: { kind: "keeper", device: "spire" }, check: sysctlIs("spire", FORWARD, "1") },
    { id: "halo-way-back", object: { kind: "board", device: "halo" }, check: hasRoute("halo", "default", IP.spire1) },
  ],
  hintTiming: { revealAfterMs: 12 * 60_000 },
  teaches: [],
  uses: [
    "router",
    "routing-table",
    "default-gateway",
    "specific-route",
    "return-path",
    "ip-forwarding",
    "hop",
    "ttl",
    "icmp",
    "routing-loop",
  ],
  cards: [],
  misconceptions: [
    { id: "fix-my-house", detect: ran("observatory", ROUTE_CHANGE) },
    { id: "via-far-door", detect: ran("crossing", /^ip route (?:add|replace) \S+ via 10\.0\.[34]\.\d+$/) },
    // Spire's board is right; it isn't allowed to forward.
    { id: "routes-again", detect: ran("spire", ROUTE_CHANGE) },
    { id: "gateway-far", detect: ran("halo", /^ip route (?:add|replace) default via (?!10\.0\.4\.)\S+$/) },
    ttlZero,
    raiseTheTtl,
    { id: "step-by-step", detect: failedChangesWithoutLooking(3) },
  ],
  detectorTests: [
    { misconception: "fix-my-house", steps: [typed("observatory", "ip route add 10.0.4.0/24 via 10.0.1.1")] },
    { misconception: "via-far-door", steps: [typed("crossing", "ip route add 10.0.4.0/24 via 10.0.3.2")] },
    { misconception: "routes-again", steps: [typed("spire", "ip route add 10.0.1.0/24 via 10.0.3.1")] },
    { misconception: "gateway-far", steps: [typed("halo", "ip route replace default via 10.0.3.1")] },
    { misconception: "ttl-zero", steps: [typed("observatory", "ping -c 1 -t 0 10.0.4.7")] },
    { misconception: "raise-the-ttl", steps: [typed("observatory", "ping -c 1 -t 255 10.0.4.7")] },
    {
      misconception: "step-by-step",
      steps: [
        typed("crossing", "ip route add 10.0.4.0/24 via 10.0.4.1"),
        typed("arch", "ip route add 10.0.4.0/24 via 10.0.4.1"),
        typed("halo", "ip route add default via 10.0.4.1"),
      ],
    },
  ],
  solution: [
    typed("crossing", "ip route add 10.0.3.0/24 via 10.0.2.2"),
    typed("crossing", "ip route add 10.0.4.0/24 via 10.0.2.2"),
    typed("arch", "ip route add 10.0.4.0/24 via 10.0.3.2"),
    typed("spire", `sysctl -w ${FORWARD}=1`),
    typed("halo", "ip route del default"),
    typed("halo", "ip route add default via 10.0.4.1"),
    typed("observatory", "ping -c 3 10.0.4.7"),
  ],
  // A default line on crossing via arch instead of the two street lines (floor-9.md 9.B note).
  altSolutions: [
    [
      typed("crossing", "ip route add default via 10.0.2.2"),
      typed("arch", "ip route add 10.0.4.0/24 via 10.0.3.2"),
      typed("spire", `sysctl -w ${FORWARD}=1`),
      typed("halo", "ip route replace default via 10.0.4.1"),
      typed("observatory", "ping -c 3 10.0.4.7"),
    ],
  ],
});

// ── Secret · Inside Your Home Router ───────────────────────────────────────────────────────

/**
 * Region 4's secret room (floors/floor-9.md, "Secret room"): a small door at the foot of the spire.
 * One box, `home`, is a switch (`br0` over its home doors), a registry on that street (DHCP on
 * `br0`) and a router to the outside (`eth0`). The observatory is plugged in with no address; the
 * lease brings directions out via home; home isn't allowed to pass packets on until forwarding is on.
 */
const homeId = "f9.secret-home-router";
const homeTopo = homeBox();
export const insideYourHomeRouter = defineRoom({
  id: homeId,
  region: 4,
  floor: 9,
  order: 50,
  kind: "secret",
  pathTag: "all",
  content: homeId,
  vars: { home: HOME.home, world: HOME.world, homeOutside: HOME.homeOutside },
  seed: 950,
  topology: homeTopo,
  faults: [
    // Removing the address takes the default route through it too, as in Linux.
    { kind: "addr-remove", device: "observatory", cidr: `${HOME.observatory}/24`, dev: "eth0" },
    { kind: "sysctl", device: "home", key: FORWARD, value: "0" },
  ],
  playerDevice: "observatory",
  access: { observatory: { state: "enterable" }, home: { state: "enterable" }, world: { state: "off-limits" } },
  controls: {
    console: "typing",
    addressSlots: { "observatory:eth0": "broken" },
    routingBoards: { observatory: "broken", home: "broken" },
    slate: { catch: true, capture: true, trace: true },
  },
  tools: {},
  glow: "none",
  winCondition: all(holdsLease("observatory", ...HOME.pool), pingAnswered("observatory", HOME.world)),
  key: { word: keyFor(homeId), via: "mark" },
  healthChecks: [
    {
      id: "holds-lease",
      object: { kind: "slot", device: "observatory", iface: "eth0" },
      check: holdsLease("observatory", ...HOME.pool),
    },
    { id: "home-forwards", object: { kind: "keeper", device: "home" }, check: sysctlIs("home", FORWARD, "1") },
  ],
  teaches: [],
  uses: ["dhcp", "lease", "default-gateway", "router", "ip-forwarding", "return-path"],
  cards: ["home-box"],
  misconceptions: [
    { id: "write-your-own", detect: ran("observatory", /^ip addr add /) },
    { id: "forward-at-your-house", detect: ran("observatory", /^sysctl\s+-w\s+net\.ipv4\.ip_forward=1\b/) },
    { id: "route-at-home", detect: ran("home", ROUTE_CHANGE) },
  ],
  detectorTests: [
    { misconception: "write-your-own", steps: [typed("observatory", "ip addr add 192.168.1.120/24 dev eth0")] },
    { misconception: "forward-at-your-house", steps: [typed("observatory", `sysctl -w ${FORWARD}=1`)] },
    { misconception: "route-at-home", steps: [typed("home", "ip route add 10.0.9.0/24 via 10.0.9.2")] },
  ],
  solution: [
    typed("observatory", "dhclient -v eth0", 10_000),
    typed("observatory", `ping -c 2 ${HOME.world}`),
    typed("home", `sysctl -w ${FORWARD}=1`),
    typed("observatory", `ping -c 3 ${HOME.world}`),
  ],
  // Forwarding first, then the address: the same two fixes in the other order.
  altSolutions: [
    [
      typed("home", `sysctl -w ${FORWARD}=1`),
      typed("observatory", "dhclient -v eth0", 10_000),
      typed("observatory", `ping -c 3 ${HOME.world}`),
    ],
  ],
});
