import type { RouteSpec, Topology } from "../src";

/** A switch: `hall` bridges eth1..eth3 (br0); hosts a, b, c hang off it. */
export function switchNet(): Topology {
  const host = (id: string, n: number) => ({
    id,
    hostname: id,
    kind: "host" as const,
    interfaces: [{ name: "eth0", mac: `02:00:00:00:00:0${n}` }],
    addrs: [{ dev: "eth0", cidr: `10.0.0.${n}/24` }],
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
      host("a", 1),
      host("b", 2),
      host("c", 3),
    ],
    links: [
      { id: "ha", a: { device: "hall", iface: "eth1" }, b: { device: "a", iface: "eth0" } },
      { id: "hb", a: { device: "hall", iface: "eth2" }, b: { device: "b", iface: "eth0" } },
      { id: "hc", a: { device: "hall", iface: "eth3" }, b: { device: "c", iface: "eth0" } },
    ],
  };
}

/** Two hosts on one cable with addresses. */
export function lan(): Topology {
  return {
    devices: [
      {
        id: "observatory",
        hostname: "observatory",
        kind: "host",
        interfaces: [{ name: "eth0", mac: "02:00:00:00:00:05" }],
        addrs: [{ dev: "eth0", cidr: "10.0.0.5/24" }],
      },
      {
        id: "lantern",
        hostname: "lantern",
        kind: "host",
        interfaces: [{ name: "eth0", mac: "02:00:00:00:00:07" }],
        addrs: [{ dev: "eth0", cidr: "10.0.0.7/24" }],
      },
    ],
    links: [{ id: "wire", a: { device: "observatory", iface: "eth0" }, b: { device: "lantern", iface: "eth0" } }],
  };
}

/** left — bridgehead (router) — right. */
export function routed(forward = true): Topology {
  return {
    devices: [
      {
        id: "left",
        hostname: "left",
        kind: "host",
        interfaces: [{ name: "eth0", mac: "02:00:00:00:01:10" }],
        addrs: [{ dev: "eth0", cidr: "10.0.1.10/24" }],
        routes: [{ dst: "default", via: "10.0.1.1" }],
      },
      {
        id: "bridgehead",
        hostname: "bridgehead",
        kind: "host",
        interfaces: [
          { name: "eth0", mac: "02:00:00:00:01:01" },
          { name: "eth1", mac: "02:00:00:00:02:01" },
        ],
        addrs: [
          { dev: "eth0", cidr: "10.0.1.1/24" },
          { dev: "eth1", cidr: "10.0.2.1/24" },
        ],
        sysctl: forward ? { "net.ipv4.ip_forward": "1" } : {},
      },
      {
        id: "right",
        hostname: "right",
        kind: "host",
        interfaces: [{ name: "eth0", mac: "02:00:00:00:02:20" }],
        addrs: [{ dev: "eth0", cidr: "10.0.2.20/24" }],
        routes: [{ dst: "default", via: "10.0.2.1" }],
      },
    ],
    links: [
      { id: "l1", a: { device: "left", iface: "eth0" }, b: { device: "bridgehead", iface: "eth0" } },
      { id: "l2", a: { device: "bridgehead", iface: "eth1" }, b: { device: "right", iface: "eth0" } },
    ],
  };
}

/**
 * Floor 9's four streets (tools/golden/capture-redirect.sh): observatory on the nave, crossing between
 * the nave and the cloister (a switch with crossing, arch and vesper), arch to the bell tower, spire
 * to the high window (halo). Arch has no route for the high window, so 10.0.4.0/24 loops (9.4).
 */
export function cathedral(): Topology {
  const host = (id: string, mac: string, cidr: string, gw: string) => ({
    id,
    hostname: id,
    kind: "host" as const,
    interfaces: [{ name: "eth0", mac }],
    addrs: [{ dev: "eth0", cidr }],
    routes: [{ dst: "default", via: gw }],
  });
  const router = (id: string, a: [string, string, string], b: [string, string, string], routes: RouteSpec[]) => ({
    id,
    hostname: id,
    kind: "host" as const,
    interfaces: [
      { name: a[0], mac: a[1] },
      { name: b[0], mac: b[1] },
    ],
    addrs: [
      { dev: a[0], cidr: a[2] },
      { dev: b[0], cidr: b[2] },
    ],
    routes,
    sysctl: { "net.ipv4.ip_forward": "1" },
  });
  return {
    devices: [
      host("observatory", "02:00:00:00:01:05", "10.0.1.5/24", "10.0.1.1"),
      router(
        "crossing",
        ["eth0", "02:00:00:00:01:01", "10.0.1.1/24"],
        ["eth1", "02:00:00:00:02:01", "10.0.2.1/24"],
        [
          { dst: "10.0.3.0/24", via: "10.0.2.2" },
          { dst: "10.0.4.0/24", via: "10.0.2.2" },
        ],
      ),
      {
        id: "cloister",
        hostname: "cloister",
        kind: "host",
        interfaces: [
          { name: "eth1", mac: "02:00:00:00:02:a1" },
          { name: "eth2", mac: "02:00:00:00:02:a2" },
          { name: "eth3", mac: "02:00:00:00:02:a3" },
        ],
        bridges: [{ name: "br0", ports: ["eth1", "eth2", "eth3"] }],
      },
      router(
        "arch",
        ["eth0", "02:00:00:00:02:02", "10.0.2.2/24"],
        ["eth1", "02:00:00:00:03:01", "10.0.3.1/24"],
        [{ dst: "default", via: "10.0.2.1" }],
      ),
      host("vesper", "02:00:00:00:02:07", "10.0.2.7/24", "10.0.2.1"),
      router(
        "spire",
        ["eth0", "02:00:00:00:03:02", "10.0.3.2/24"],
        ["eth1", "02:00:00:00:04:01", "10.0.4.1/24"],
        [{ dst: "default", via: "10.0.3.1" }],
      ),
      host("halo", "02:00:00:00:04:07", "10.0.4.7/24", "10.0.4.1"),
    ],
    links: [
      { id: "nave", a: { device: "observatory", iface: "eth0" }, b: { device: "crossing", iface: "eth0" } },
      { id: "c1", a: { device: "cloister", iface: "eth1" }, b: { device: "crossing", iface: "eth1" } },
      { id: "c2", a: { device: "cloister", iface: "eth2" }, b: { device: "arch", iface: "eth0" } },
      { id: "c3", a: { device: "cloister", iface: "eth3" }, b: { device: "vesper", iface: "eth0" } },
      { id: "tower", a: { device: "arch", iface: "eth1" }, b: { device: "spire", iface: "eth0" } },
      { id: "window", a: { device: "spire", iface: "eth1" }, b: { device: "halo", iface: "eth0" } },
    ],
  };
}

/**
 * The Peacekeeper's halls (tools/golden/capture-stp.sh, topo_halls): hall-a and hall-b, each br0
 * over eth1..eth3, joined twice (span: eth2—eth2, span-2: eth3—eth3), so a loop; a (10.0.0.1) on
 * hall-a eth1, b (10.0.0.2) on hall-b eth1. `slow` spans keep a storm watchable.
 */
export function halls(stp: boolean, slow = false): Topology {
  const hall = (id: string, x: string) => ({
    id,
    hostname: id,
    kind: "host" as const,
    interfaces: [1, 2, 3].map((n) => ({ name: `eth${n}`, mac: `02:00:00:00:${x}:0${n}` })),
    bridges: [{ name: "br0", ports: ["eth1", "eth2", "eth3"], stp }],
  });
  const host = (id: string, mac: string, cidr: string) => ({
    id,
    hostname: id,
    kind: "host" as const,
    interfaces: [{ name: "eth0", mac }],
    addrs: [{ dev: "eth0", cidr }],
  });
  const span = slow ? { bandwidthBps: 64_000, queueLimit: 16 } : {};
  return {
    devices: [
      hall("hall-a", "0a"),
      hall("hall-b", "0b"),
      host("a", "02:00:00:00:00:0a", "10.0.0.1/24"),
      host("b", "02:00:00:00:00:0b", "10.0.0.2/24"),
    ],
    links: [
      { id: "la", a: { device: "hall-a", iface: "eth1" }, b: { device: "a", iface: "eth0" } },
      { id: "lb", a: { device: "hall-b", iface: "eth1" }, b: { device: "b", iface: "eth0" } },
      { id: "span", a: { device: "hall-a", iface: "eth2" }, b: { device: "hall-b", iface: "eth2" }, ...span },
      { id: "span-2", a: { device: "hall-a", iface: "eth3" }, b: { device: "hall-b", iface: "eth3" }, ...span },
    ],
  };
}
