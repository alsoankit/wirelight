import type { Topology } from "../src";

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
