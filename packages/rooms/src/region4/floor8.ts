/** floors/floor-8.md · Crossings. From Floor 5 the key is a mark on the winning answer. */
import { keyFor } from "@wirelight/content";
import type { Topology } from "@wirelight/sim";
import { all, ran } from "../predicates";
import {
  type Access,
  type Controls,
  defineRoom,
  type Misconception,
  type Predicate,
  type SolutionStep,
} from "../types";
import {
  answeredAfterWake,
  changedNearAfterHearing,
  hasAddrOn,
  hasRoute,
  pingAnswered,
  ranOn,
  sysctlIs,
} from "./predicates";
import { cathedral, IP, MAC, STREET } from "./topology";

export const typed = (device: string, line: string, waitMs?: number): SolutionStep => ({
  device,
  line,
  source: "typed",
  ...(waitMs ? { waitMs } : {}),
});
export const click = (device: string, line: string, waitMs?: number): SolutionStep => ({
  device,
  line,
  source: "click",
  ...(waitMs ? { waitMs } : {}),
});

/** Every room of the cathedral can be walked into (8.1: "walk through crossing's room to reach it"). */
export function openRooms(t: Topology): Record<string, Access> {
  return Object.fromEntries(t.devices.map((d) => [d.id, { state: "enterable" } as const]));
}

/** From 8.3 the routing boards are behind cracked glass: readable, changed by typing (0040). */
export function crackedBoards(t: Topology): NonNullable<Controls["routingBoards"]> {
  return Object.fromEntries(t.devices.filter((d) => d.addrs?.length).map((d) => [d.id, "broken" as const]));
}

const FORWARD = "net.ipv4.ip_forward";
const ROUTE_CHANGE = /^ip route (?:add|del|delete|change|replace|append|flush)\b/;

/** Values the text names, from the topology (0055). */
const VARS = {
  observatory: IP.observatory,
  crossingNave: IP.crossing0,
  crossingCloister: IP.crossing1,
  archCloister: IP.arch0,
  archTower: IP.arch1,
  vesper: IP.vesper,
  lumen: IP.lumen,
  tower: STREET.tower,
  nowhere: "10.0.3.9",
};

// Detectors more than one room uses (8.B inherits them).
const farGateway: Misconception = {
  id: "far-gateway",
  detect: ran("observatory", /^ip route (?:add|replace) default via 10\.0\.2\.1$/),
};
const fixMyHouse: Misconception = {
  id: "fix-my-house",
  detect: ran("observatory", /^ip route (?:add|replace) 10\.0\.3\.0\/24\b/),
};
const viaFarDoor: Misconception = {
  id: "via-far-door",
  detect: ran("crossing", /^ip route (?:add|replace) \S+ via 10\.0\.3\.\d+$/),
};

// ── 8.1 · The Other Street ─────────────────────────────────────────────────────────────────

const otherId = "f8.other-street";
const otherTopo = cathedral({ observatoryGateway: false });
export const otherStreet = defineRoom({
  id: otherId,
  region: 4,
  floor: 8,
  order: 1,
  kind: "learn",
  pathTag: "building-block",
  content: otherId,
  vars: VARS,
  seed: 81,
  topology: otherTopo,
  faults: [],
  playerDevice: "observatory",
  access: openRooms(otherTopo),
  controls: { console: "typing" },
  tools: {},
  glow: "symptoms",
  winCondition: all(pingAnswered("observatory", IP.crossing0), pingAnswered("vesper", IP.crossing1)),
  key: { word: keyFor(otherId), via: "mark" },
  healthChecks: [],
  teaches: ["router"],
  uses: ["subnet", "ip-address", "ping"],
  cards: ["router", "navigator"],
  misconceptions: [
    { id: "same-street-trick", detect: hasAddrOn("observatory", "10.0.2.") },
    { id: "far-door-from-here", detect: ran("observatory", /^ping\b.*\s10\.0\.2\.1$/, 3) },
  ],
  detectorTests: [
    { misconception: "same-street-trick", steps: [typed("observatory", "ip addr add 10.0.2.5/24 dev eth0")] },
    {
      misconception: "far-door-from-here",
      steps: [
        typed("observatory", "ping -c 1 10.0.2.1"),
        typed("observatory", "ping -c 1 10.0.2.1"),
        typed("observatory", "ping -c 1 10.0.2.1"),
      ],
    },
  ],
  solution: [typed("observatory", "ping -c 1 10.0.1.1"), typed("vesper", "ping -c 1 10.0.2.1")],
});

// ── 8.2 · Across the Street ────────────────────────────────────────────────────────────────

const acrossId = "f8.across-the-street";
const acrossTopo = cathedral();
const observatoryGateway = hasRoute("observatory", "default", IP.crossing0);
export const acrossTheStreet = defineRoom({
  id: acrossId,
  region: 4,
  floor: 8,
  order: 2,
  kind: "learn",
  pathTag: "tool",
  content: acrossId,
  vars: VARS,
  seed: 82,
  topology: acrossTopo,
  faults: [{ kind: "route-remove", device: "observatory", dst: "default" }],
  playerDevice: "observatory",
  access: openRooms(acrossTopo),
  controls: { console: "typing", routingBoards: { observatory: "works" } },
  tools: { unlock: ["ip route"] },
  glow: "symptoms",
  // "Error: Nexthop has invalid gateway." is new here, so its subtitle shows.
  subtitles: true,
  winCondition: pingAnswered("observatory", IP.vesper),
  key: { word: keyFor(acrossId), via: "mark" },
  healthChecks: [{ id: "gateway", object: { kind: "board", device: "observatory" }, check: observatoryGateway }],
  teaches: ["default-gateway", "routing-table"],
  uses: ["router", "subnet", "ip-address", "ping"],
  cards: ["routing-board", "default-gateway"],
  commandMemory: "CMD-08",
  misconceptions: [
    farGateway,
    { id: "gateway-is-vesper", detect: ran("observatory", /^ip route (?:add|replace) default via 10\.0\.2\.7$/) },
    { id: "route-to-self", detect: ran("observatory", /^ip route (?:add|replace) default via 10\.0\.1\.5$/) },
  ],
  detectorTests: [
    { misconception: "far-gateway", steps: [click("observatory", "ip route add default via 10.0.2.1")] },
    { misconception: "gateway-is-vesper", steps: [click("observatory", "ip route add default via 10.0.2.7")] },
    { misconception: "route-to-self", steps: [typed("observatory", "ip route add default via 10.0.1.5")] },
  ],
  solution: [click("observatory", "ip route add default via 10.0.1.1"), typed("observatory", "ping -c 3 10.0.2.7")],
  altSolutions: [
    [typed("observatory", "ip route add default via 10.0.1.1"), typed("observatory", "ping -c 3 10.0.2.7")],
  ],
});

// ── 8.3 · Directions ───────────────────────────────────────────────────────────────────────

const directionsId = "f8.directions";
const towerTopo = cathedral({ tower: true });
/** Crossing has a way to the bell tower: a line for it, or a default, via arch. */
const crossingToTower: Predicate = (f) =>
  hasRoute("crossing", STREET.tower, IP.arch0)(f) || hasRoute("crossing", "default", IP.arch0)(f);
export const directions = defineRoom({
  id: directionsId,
  region: 4,
  floor: 8,
  order: 3,
  kind: "learn",
  pathTag: "core",
  content: directionsId,
  vars: VARS,
  seed: 83,
  topology: towerTopo,
  faults: [{ kind: "route-remove", device: "crossing", dst: STREET.tower }],
  playerDevice: "observatory",
  access: openRooms(towerTopo),
  controls: { console: "typing", routingBoards: crackedBoards(towerTopo) },
  tools: {},
  glow: "symptoms",
  // `Destination Net Unreachable` is new here.
  subtitles: true,
  winCondition: pingAnswered("observatory", IP.lumen),
  key: { word: keyFor(directionsId), via: "mark" },
  healthChecks: [{ id: "crossing-knows-tower", object: { kind: "board", device: "crossing" }, check: crossingToTower }],
  teaches: ["specific-route"],
  uses: ["routing-table", "default-gateway", "router"],
  cards: ["specific-route"],
  misconceptions: [fixMyHouse, viaFarDoor],
  detectorTests: [
    { misconception: "fix-my-house", steps: [typed("observatory", "ip route add 10.0.3.0/24 via 10.0.1.1")] },
    { misconception: "via-far-door", steps: [typed("crossing", "ip route add 10.0.3.0/24 via 10.0.3.1")] },
  ],
  solution: [typed("crossing", "ip route add 10.0.3.0/24 via 10.0.2.2"), typed("observatory", "ping -c 3 10.0.3.7")],
  // A default line on crossing, via arch, works too (floor-8.md 8.3 note).
  altSolutions: [[typed("crossing", "ip route add default via 10.0.2.2"), typed("observatory", "ping -c 3 10.0.3.7")]],
});

// ── 8.4 · No Way Back ──────────────────────────────────────────────────────────────────────

const noWayId = "f8.no-way-back";
const noWayTopo = cathedral();
export const noWayBack = defineRoom({
  id: noWayId,
  region: 4,
  floor: 8,
  order: 4,
  kind: "break",
  pathTag: "tool",
  content: noWayId,
  vars: VARS,
  seed: 84,
  topology: noWayTopo,
  faults: [{ kind: "route-remove", device: "vesper", dst: "default" }],
  playerDevice: "observatory",
  access: openRooms(noWayTopo),
  controls: { console: "typing", routingBoards: crackedBoards(noWayTopo), slate: { catch: true, capture: true } },
  tools: { unlock: ["tcpdump"] },
  glow: "symptoms",
  winCondition: pingAnswered("observatory", IP.vesper),
  key: { word: keyFor(noWayId), via: "mark" },
  healthChecks: [
    {
      id: "vesper-way-back",
      object: { kind: "board", device: "vesper" },
      check: hasRoute("vesper", "default", IP.crossing1),
    },
  ],
  teaches: ["return-path"],
  uses: ["routing-table", "default-gateway", "packet"],
  cards: ["capture"],
  commandMemory: "CMD-09",
  misconceptions: [
    { id: "blame-the-sender", detect: ran("observatory", ROUTE_CHANGE) },
    {
      id: "blame-crossing",
      detect: ranOn(["crossing"], /^ip route (?:add|del|delete|change|replace|flush)\b|^sysctl\s+-w\b/),
    },
  ],
  detectorTests: [
    {
      misconception: "blame-the-sender",
      steps: [typed("observatory", "ip route del default"), typed("observatory", "ip route add default via 10.0.1.1")],
    },
    { misconception: "blame-crossing", steps: [typed("crossing", `sysctl -w ${FORWARD}=1`)] },
  ],
  solution: [
    typed("observatory", "ping -c 4 10.0.2.7", 1000),
    // The Slate's Capture, in vesper's room: requests arrive, nothing leaves. It keeps listening.
    click("vesper", "tcpdump -n -i eth0", 4000),
    typed("vesper", "ip route add default via 10.0.2.1"),
    typed("observatory", "ping -c 3 10.0.2.7"),
  ],
});

// ── 8.5 · The Sleeping Keeper ──────────────────────────────────────────────────────────────

const sleepingId = "f8.sleeping-keeper";
const sleepingTopo = cathedral();
/** The lectern: one hand step on crossing (0042). */
const lectern = (args: string, waitMs = 200) => click("crossing", `lab keeper ${args}`, waitMs);
export const sleepingKeeper = defineRoom({
  id: sleepingId,
  region: 4,
  floor: 8,
  order: 5,
  kind: "break",
  pathTag: "tool",
  content: sleepingId,
  vars: { ...VARS, crossingNaveDoor: MAC.crossing0, vesperDoor: MAC.vesper, observatoryDoor: MAC.observatory },
  seed: 85,
  topology: sleepingTopo,
  faults: [
    { kind: "sysctl", device: "crossing", key: FORWARD, value: "0" },
    { kind: "keeper-asleep", device: "crossing", desk: "router" },
  ],
  playerDevice: "observatory",
  access: openRooms(sleepingTopo),
  controls: {
    console: "typing",
    routingBoards: crackedBoards(sleepingTopo),
    desk: "crossing",
    slate: { catch: true, capture: true },
  },
  tools: { unlock: ["sysctl"] },
  glow: "symptoms",
  // Three answers once the navigator does it itself (the key is a mark on the third).
  winCondition: answeredAfterWake("observatory", IP.vesper, "crossing", 3),
  key: { word: keyFor(sleepingId), via: "mark" },
  healthChecks: [
    { id: "forwarding-on", object: { kind: "keeper", device: "crossing" }, check: sysctlIs("crossing", FORWARD, "1") },
  ],
  teaches: ["ip-forwarding"],
  uses: ["routing-table", "neighbour-ledger", "arp", "packet", "frame", "encapsulation"],
  cards: ["lectern"],
  commandMemory: "CMD-10",
  misconceptions: [
    { id: "routes-again", detect: ranOn(["crossing", "observatory"], ROUTE_CHANGE) },
    // Sending the packet on in the frame it came in: addressed to crossing's own door on the nave.
    { id: "reuse-the-frame", detect: ran("crossing", /^lab keeper forward 02:00:00:00:00:21$/) },
    // Wrapping it as a house does, without the router's step of taking one off the countdown.
    { id: "skip-ttl", detect: ran("crossing", /^lab keeper wrap\b/) },
  ],
  detectorTests: [
    { misconception: "routes-again", steps: [typed("crossing", "ip route add 10.0.3.0/24 via 10.0.2.2")] },
    {
      misconception: "reuse-the-frame",
      steps: [typed("observatory", "ping -c 1 10.0.2.7", 200), lectern(`forward ${MAC.crossing0}`)],
    },
    {
      misconception: "skip-ttl",
      steps: [
        typed("observatory", "ping -c 1 10.0.2.7", 200),
        lectern("arp-ask 10.0.2.7"),
        lectern(`wrap ${MAC.vesper}`),
      ],
    },
  ],
  solution: [
    typed("observatory", "ping -c 1 10.0.2.7", 200),
    lectern("arp-ask 10.0.2.7"),
    lectern(`forward ${MAC.vesper}`),
    // Vesper's reply waits on the lectern too; the ledger already knows the observatory's door.
    lectern(`forward ${MAC.observatory}`, 1000),
    typed("crossing", `sysctl -w ${FORWARD}=1`, 200),
    typed("observatory", "ping -c 3 10.0.2.7"),
  ],
});

// ── 8.B · The Closed Crossing ──────────────────────────────────────────────────────────────

const closedId = "f8.boss-closed-crossing";
const closedTopo = cathedral({ tower: true });
export const closedCrossing = defineRoom({
  id: closedId,
  region: 4,
  floor: 8,
  order: 9,
  kind: "boss",
  pathTag: "boss",
  content: closedId,
  vars: VARS,
  seed: 89,
  topology: closedTopo,
  faults: [
    { kind: "route-remove", device: "observatory", dst: "default" },
    { kind: "route-remove", device: "crossing", dst: STREET.tower },
    { kind: "sysctl", device: "arch", key: FORWARD, value: "0" },
    // A door nobody has.
    { kind: "route-set", device: "lumen", route: { dst: "default", via: "10.0.3.9" } },
  ],
  playerDevice: "observatory",
  access: openRooms(closedTopo),
  controls: { console: "typing", routingBoards: crackedBoards(closedTopo), slate: { catch: true, capture: true } },
  tools: {},
  glow: "none",
  winCondition: pingAnswered("observatory", IP.lumen),
  key: { word: keyFor(closedId), via: "mark" },
  healthChecks: [
    { id: "observatory-gateway", object: { kind: "board", device: "observatory" }, check: observatoryGateway },
    { id: "crossing-knows-tower", object: { kind: "board", device: "crossing" }, check: crossingToTower },
    { id: "arch-forwards", object: { kind: "keeper", device: "arch" }, check: sysctlIs("arch", FORWARD, "1") },
    { id: "lumen-way-back", object: { kind: "board", device: "lumen" }, check: hasRoute("lumen", "default", IP.arch1) },
  ],
  hintTiming: { revealAfterMs: 12 * 60_000 },
  teaches: [],
  uses: ["router", "default-gateway", "routing-table", "specific-route", "return-path", "ip-forwarding"],
  cards: [],
  misconceptions: [
    farGateway,
    fixMyHouse,
    viaFarDoor,
    // Taking a working line off your own board: your requests already leave and cross.
    { id: "blame-the-sender", detect: ran("observatory", /^ip route (?:del|delete|change|replace|flush)\b/) },
    // Arch's board is right; it isn't allowed to forward.
    { id: "routes-again", detect: ran("arch", ROUTE_CHANGE) },
    {
      id: "one-direction",
      detect: changedNearAfterHearing("lumen", "> 10.0.3.7: ICMP echo request", ["observatory", "crossing", "arch"], 2),
    },
  ],
  detectorTests: [
    { misconception: "far-gateway", steps: [typed("observatory", "ip route add default via 10.0.2.1")] },
    { misconception: "fix-my-house", steps: [typed("observatory", "ip route add 10.0.3.0/24 via 10.0.1.1")] },
    { misconception: "via-far-door", steps: [typed("crossing", "ip route add 10.0.3.0/24 via 10.0.3.1")] },
    {
      misconception: "blame-the-sender",
      steps: [typed("observatory", "ip route add default via 10.0.1.1"), typed("observatory", "ip route del default")],
    },
    { misconception: "routes-again", steps: [typed("arch", "ip route add 10.0.1.0/24 via 10.0.2.1")] },
    {
      misconception: "one-direction",
      steps: [
        typed("observatory", "ip route add default via 10.0.1.1"),
        typed("crossing", "ip route add 10.0.3.0/24 via 10.0.2.2"),
        typed("arch", `sysctl -w ${FORWARD}=1`),
        typed("observatory", "ping -c 10 10.0.3.7", 1000),
        click("lumen", "tcpdump -n -i eth0", 3000),
        typed("crossing", "ip route add 10.0.4.0/24 via 10.0.2.2"),
        typed("observatory", "ip route add 10.0.4.0/24 via 10.0.1.1"),
      ],
    },
  ],
  solution: [
    typed("observatory", "ip route add default via 10.0.1.1"),
    typed("crossing", "ip route add 10.0.3.0/24 via 10.0.2.2"),
    typed("arch", `sysctl -w ${FORWARD}=1`),
    typed("lumen", "ip route del default"),
    typed("lumen", "ip route add default via 10.0.3.1"),
    typed("observatory", "ping -c 3 10.0.3.7"),
  ],
  altSolutions: [
    [
      typed("observatory", "ip route add default via 10.0.1.1"),
      typed("crossing", "ip route add default via 10.0.2.2"),
      typed("arch", `sysctl -w ${FORWARD}=1`),
      typed("lumen", "ip route replace default via 10.0.3.1"),
      typed("observatory", "ping -c 3 10.0.3.7"),
    ],
  ],
});
