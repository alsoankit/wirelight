/** The difftest's scenarios: each one a behaviour the rooms rely on, checked against real Linux. */

import type { DhcpServerSpec, Topology } from "@wirelight/sim";
import { cathedral, halls, lan, routed, switchNet } from "../../packages/sim/test/fixtures";
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
  {
    name: "cathedral: a routing loop (9.4): time exceeded from arch, no redirects for the nave",
    topology: cathedral(),
    steps: [{ device: "observatory", ping: { dst: "10.0.4.7", count: 2 }, settleMs: 6500 }],
  },
  {
    name: "cathedral: the loop broken by a route on arch",
    topology: cathedral(),
    faults: [{ kind: "route-set", device: "arch", route: { dst: "10.0.4.0/24", via: "10.0.3.2" } }],
    steps: [{ device: "observatory", ping: { dst: "10.0.4.7", count: 1 }, settleMs: 6500 }],
  },
  {
    name: "cathedral: crossing redirects gallery to arch, then gallery goes direct",
    topology: cathedral(),
    // Neighbours primed, and no settling into the routers' 5 s probes: see the loop case below.
    steps: [
      { device: "crossing", ping: { dst: "10.0.2.2", count: 1 }, settleMs: 0 },
      { device: "gallery", ping: { dst: "10.0.2.2", count: 1 }, settleMs: 0 },
      { device: "gallery", ping: { dst: "10.0.2.1", count: 1 }, settleMs: 0 },
      { device: "gallery", ping: { dst: "10.0.3.2", count: 3 }, settleMs: 300 },
      { device: "gallery", run: "ip route get 10.0.3.2", settleMs: 300 },
    ],
  },
  {
    name: "cathedral: the loop seen from the cloister: both routers redirect",
    topology: cathedral(),
    // Every address on the cloister known first: with unknown neighbours, the ARP exchanges the
    // redirects set off race each other within microseconds, in an order the simulator needn't copy.
    steps: [
      { device: "crossing", ping: { dst: "10.0.2.2", count: 1 }, settleMs: 0 },
      { device: "gallery", ping: { dst: "10.0.2.2", count: 1 }, settleMs: 0 },
      { device: "gallery", ping: { dst: "10.0.2.1", count: 1 }, settleMs: 0 },
      { device: "gallery", ping: { dst: "10.0.4.7", count: 3, waitS: 1 }, settleMs: 300 },
    ],
  },
  {
    name: "switch: two machines with one address: the first reply wins",
    topology: switchNet(),
    faults: [
      { kind: "addr-remove", device: "c", cidr: "10.0.0.3/24", dev: "eth0" },
      { kind: "addr-set", device: "c", cidr: "10.0.0.2/24", dev: "eth0" },
    ],
    steps: [{ device: "a", ping: { dst: "10.0.0.2", count: 2 }, settleMs: 6500 }],
  },
  {
    name: "switch: two machines with one address: the other one's ARP request flips the entry",
    topology: switchNet(),
    faults: [
      { kind: "addr-remove", device: "c", cidr: "10.0.0.3/24", dev: "eth0" },
      { kind: "addr-set", device: "c", cidr: "10.0.0.2/24", dev: "eth0" },
    ],
    steps: [
      { device: "a", ping: { dst: "10.0.0.2", count: 1 }, settleMs: 1500 },
      { device: "b", run: "ip neigh flush dev eth0", settleMs: 0 },
      { device: "b", ping: { dst: "10.0.0.1", count: 1 }, settleMs: 0 },
      { device: "a", ping: { dst: "10.0.0.2", count: 1 }, settleMs: 6500 },
    ],
  },
  {
    name: "switch: a permanent entry for a door that isn't there (6.B), then deleted",
    topology: switchNet(),
    steps: [
      { device: "a", run: "ip neigh add 10.0.0.2 lladdr 02:00:00:00:00:99 dev eth0 nud permanent", settleMs: 0 },
      { device: "a", ping: { dst: "10.0.0.2", count: 1, waitS: 1 }, settleMs: 0 },
      { device: "a", run: "ip neigh del 10.0.0.2 dev eth0", settleMs: 0 },
      { device: "a", ping: { dst: "10.0.0.2", count: 1 }, settleMs: 6500 },
    ],
  },
  {
    name: "square: the registry hands out a lease (ping check, offer, request, ack, ARP check), then a ping",
    topology: square(),
    needs: ["dhclient"],
    steps: [
      { device: "observatory", run: "dhclient -v eth0", settleMs: 6500 },
      { device: "observatory", ping: { dst: "10.0.1.7", count: 2 }, settleMs: 6500 },
    ],
  },
  {
    name: "square: the registry's first pick answers its ping, so it offers the next address",
    topology: square(),
    needs: ["dhclient"],
    faults: [{ kind: "addr-set", device: "kitchen", cidr: "10.0.1.149/24", dev: "eth0" }],
    steps: [{ device: "observatory", run: "dhclient -v eth0", settleMs: 6500 }],
  },
  {
    name: "square: no conflict check at the registry; the client's ARP check declines a taken address",
    topology: square({ pingCheck: false }),
    needs: ["dhclient"],
    faults: [{ kind: "addr-set", device: "kitchen", cidr: "10.0.1.149/24", dev: "eth0" }],
    steps: [{ device: "observatory", run: "dhclient -v eth0", settleMs: 9000 }],
  },
  {
    name: "square: dhclient -r gives the lease back",
    topology: square(),
    needs: ["dhclient"],
    steps: [
      { device: "observatory", run: "dhclient eth0", settleMs: 0 },
      { device: "observatory", run: "dhclient -r -v eth0", settleMs: 6500 },
    ],
  },
  {
    name: "halls (STP on): nothing passes while listening, one port blocks, traffic once forwarding; failover after unplugging the active span",
    topology: halls(true),
    steps: [
      { device: "a", ping: { dst: "10.0.0.2", count: 1, waitS: 1 }, settleMs: 34_000 },
      { device: "a", ping: { dst: "10.0.0.2", count: 2 }, settleMs: 500 },
      { device: "hall-a", run: "ip link set eth2 down", settleMs: 2000 },
      { device: "a", ping: { dst: "10.0.0.2", count: 1, waitS: 1 }, settleMs: 33_000 },
      // Linux picks a's reachable time at random (15–45 s): start the last ping from a fresh ARP.
      { device: "a", run: "ip neigh flush dev eth0", settleMs: 0 },
      { device: "a", ping: { dst: "10.0.0.2", count: 2 }, settleMs: 300 },
    ],
  },
  {
    name: "halls (STP off, loop closed): STP turned on at hall-a, then hall-b; hall-a blocks its own loop, traffic flows",
    topology: halls(false),
    steps: [
      { device: "hall-a", run: "ip link set br0 type bridge stp_state 1", settleMs: 5000 },
      { device: "hall-b", run: "ip link set br0 type bridge stp_state 1", settleMs: 4000 },
      { device: "a", ping: { dst: "10.0.0.2", count: 2 }, settleMs: 300 },
    ],
  },
];

/** Floor 7's square, small: observatory (no address), the registry (dnsmasq) and kitchen on a switch. */
function square(server: Partial<DhcpServerSpec> = {}): Topology {
  const host = (id: string, mac: string, cidr?: string) => ({
    id,
    hostname: id,
    kind: "host" as const,
    interfaces: [{ name: "eth0", mac }],
    addrs: cidr ? [{ dev: "eth0", cidr }] : [],
  });
  return {
    devices: [
      {
        id: "hall",
        hostname: "hall",
        kind: "host",
        interfaces: [
          { name: "eth1", mac: "02:00:00:00:00:11" },
          { name: "eth2", mac: "02:00:00:00:00:12" },
          { name: "eth3", mac: "02:00:00:00:00:13" },
        ],
        bridges: [{ name: "br0", ports: ["eth1", "eth2", "eth3"] }],
      },
      host("observatory", "02:00:00:00:00:05"),
      {
        ...host("registry", "02:00:00:00:00:02", "10.0.1.2/24"),
        dhcpServer: { range: ["10.0.1.100", "10.0.1.150"], leaseSecs: 3600, ...server },
      },
      host("kitchen", "02:00:00:00:00:07", "10.0.1.7/24"),
    ],
    links: [
      { id: "l1", a: { device: "hall", iface: "eth1" }, b: { device: "observatory", iface: "eth0" } },
      { id: "l2", a: { device: "hall", iface: "eth2" }, b: { device: "registry", iface: "eth0" } },
      { id: "l3", a: { device: "hall", iface: "eth3" }, b: { device: "kitchen", iface: "eth0" } },
    ],
  };
}
