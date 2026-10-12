/** The difftest's scenarios: each one a behaviour the rooms rely on, checked against real Linux. */
import { lan, routed, switchNet } from "../../packages/sim/test/fixtures";
import type { Scenario } from "./scenario";

export const SCENARIOS: Scenario[] = [
  {
    name: "lan: first ping (ARP, echo, the replier's DELAY probe 5 s later)",
    topology: lan(),
    steps: [{ device: "observatory", ping: { dst: "10.0.0.7", count: 2 }, settleMs: 6500 }],
  },
  {
    name: "lan: a host that isn't there (3 ARP requests, then host unreachable)",
    topology: lan(),
    steps: [{ device: "observatory", ping: { dst: "10.0.0.99", count: 1 }, settleMs: 500 }],
  },
  {
    name: "lan: no route at all",
    topology: lan(),
    steps: [{ device: "observatory", ping: { dst: "192.168.9.9", count: 1 }, settleMs: 200 }],
  },
  {
    name: "switch: flood, learn, forward",
    topology: switchNet(),
    steps: [
      { device: "a", ping: { dst: "10.0.0.2", count: 1 }, settleMs: 300 },
      { device: "c", ping: { dst: "10.0.0.1", count: 1 }, settleMs: 300 },
    ],
  },
  {
    name: "switch: a sticky static entry on the wrong port misdirects traffic",
    topology: switchNet(),
    faults: [{ kind: "fdb-static", device: "hall", mac: "02:00:00:00:00:02", port: "eth3", sticky: true }],
    steps: [{ device: "a", ping: { dst: "10.0.0.2", count: 1, waitS: 2 }, settleMs: 300 }],
  },
  {
    name: "routed: through the router (TTL 63)",
    topology: routed(true),
    steps: [{ device: "left", ping: { dst: "10.0.2.20", count: 1 }, settleMs: 300 }],
  },
  {
    name: "routed: forwarding off drops quietly",
    topology: routed(false),
    steps: [{ device: "left", ping: { dst: "10.0.2.20", count: 1, waitS: 2 }, settleMs: 300 }],
  },
  {
    name: "routed: TTL 1 earns 'time exceeded'",
    topology: routed(true),
    steps: [{ device: "left", ping: { dst: "10.0.2.20", count: 1, ttl: 1 }, settleMs: 300 }],
  },
  {
    name: "routed: no route at the router earns 'net unreachable'",
    topology: routed(true),
    steps: [{ device: "left", ping: { dst: "10.9.9.9", count: 1 }, settleMs: 300 }],
  },
];
