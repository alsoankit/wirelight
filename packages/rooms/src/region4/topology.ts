/**
 * The Cathedral of Crossings' machines (floors/floor-8.md, floor-9.md: "Machines", "Streets").
 * Streets are `10.0.N.0/24`: the nave (1), the cloister (2), the bell tower (3), the high window (4).
 * Each street has its own switch, already known and working. Routers use `.1` (and arch and spire
 * `.2` on the street they share with the router before them); houses as the specs say.
 *
 * The topology is the CORRECT network a room describes; rooms break it with faults.
 */
import type { DeviceSpec, LinkSpec, RouteSpec, Topology } from "@wirelight/sim";

export const MAC = {
  observatory: "02:00:00:00:00:05",
  crossing0: "02:00:00:00:00:21",
  crossing1: "02:00:00:00:00:22",
  arch0: "02:00:00:00:00:23",
  arch1: "02:00:00:00:00:24",
  spire0: "02:00:00:00:00:25",
  spire1: "02:00:00:00:00:26",
  gallery: "02:00:00:00:00:27",
  belfry: "02:00:00:00:00:37",
  laundry: "02:00:00:00:00:39",
  loft: "02:00:00:00:00:47",
} as const;

export const IP = {
  observatory: "10.0.1.5",
  crossing0: "10.0.1.1",
  crossing1: "10.0.2.1",
  arch0: "10.0.2.2",
  arch1: "10.0.3.1",
  spire0: "10.0.3.2",
  spire1: "10.0.4.1",
  gallery: "10.0.2.7",
  belfry: "10.0.3.7",
  laundry: "10.0.3.9",
  loft: "10.0.4.7",
} as const;

export const STREET = {
  nave: "10.0.1.0/24",
  cloister: "10.0.2.0/24",
  tower: "10.0.3.0/24",
  window: "10.0.4.0/24",
} as const;

export interface CathedralOptions {
  /** The observatory knows its way off the nave (default via crossing). Not in 8.1. */
  observatoryGateway?: boolean;
  /** Arch, belfry and the bell tower (from 8.3). */
  tower?: boolean;
  /** Laundry on the bell tower (9.2). */
  laundry?: boolean;
  /** Spire, loft and the high window (from 9.4). */
  highWindow?: boolean;
}

const house = (id: string, mac: string, ip: string, gateway: string | null): DeviceSpec => ({
  id,
  hostname: id,
  kind: "host",
  interfaces: [{ name: "eth0", mac }],
  addrs: [{ dev: "eth0", cidr: `${ip}/24` }],
  ...(gateway ? { routes: [{ dst: "default", via: gateway }] } : {}),
});

/** A router: a door on each of two streets, allowed to forward (net.ipv4.ip_forward = 1). */
const router = (id: string, macs: [string, string], ips: [string, string], routes: RouteSpec[]): DeviceSpec => ({
  id,
  hostname: id,
  kind: "host",
  interfaces: [
    { name: "eth0", mac: macs[0] },
    { name: "eth1", mac: macs[1] },
  ],
  addrs: [
    { dev: "eth0", cidr: `${ips[0]}/24` },
    { dev: "eth1", cidr: `${ips[1]}/24` },
  ],
  routes,
  sysctl: { "net.ipv4.ip_forward": "1" },
});

/** A street's switch: a bridge over `ports` doors (MACs `02:00:00:00:00:<base+i>`). */
const streetSwitch = (id: string, base: number, ports: number): DeviceSpec => {
  const names = Array.from({ length: ports }, (_, i) => `eth${i}`);
  return {
    id,
    hostname: id,
    kind: "host",
    interfaces: names.map((name, i) => ({ name, mac: `02:00:00:00:00:${(base + i).toString(16).padStart(2, "0")}` })),
    bridges: [{ name: "br0", ports: names }],
  };
};

/** The nave, the cloister and, as the room needs them, the bell tower and the high window. */
export function cathedral(o: CathedralOptions = {}): Topology {
  const crossingRoutes: RouteSpec[] = [];
  if (o.tower) crossingRoutes.push({ dst: STREET.tower, via: IP.arch0 });
  if (o.highWindow) crossingRoutes.push({ dst: STREET.window, via: IP.arch0 });
  const archRoutes: RouteSpec[] = [];
  if (o.highWindow) archRoutes.push({ dst: STREET.window, via: IP.spire0 });
  archRoutes.push({ dst: "default", via: IP.crossing1 });

  const devices: DeviceSpec[] = [
    house("observatory", MAC.observatory, IP.observatory, o.observatoryGateway === false ? null : IP.crossing0),
    router("crossing", [MAC.crossing0, MAC.crossing1], [IP.crossing0, IP.crossing1], crossingRoutes),
    house("gallery", MAC.gallery, IP.gallery, IP.crossing1),
  ];
  // Each street's switch, with a door for every machine on it.
  const nave: string[] = ["observatory", "crossing:eth0"];
  const cloister: string[] = ["crossing:eth1", "gallery"];
  const tower: string[] = [];
  const window: string[] = [];
  if (o.tower) {
    devices.push(router("arch", [MAC.arch0, MAC.arch1], [IP.arch0, IP.arch1], archRoutes));
    devices.push(house("belfry", MAC.belfry, IP.belfry, IP.arch1));
    cloister.push("arch:eth0");
    tower.push("arch:eth1", "belfry");
  }
  if (o.laundry) {
    devices.push(house("laundry", MAC.laundry, IP.laundry, IP.arch1));
    tower.push("laundry");
  }
  if (o.highWindow) {
    devices.push(
      router("spire", [MAC.spire0, MAC.spire1], [IP.spire0, IP.spire1], [{ dst: "default", via: IP.arch1 }]),
    );
    devices.push(house("loft", MAC.loft, IP.loft, IP.spire1));
    tower.push("spire:eth0");
    window.push("spire:eth1", "loft");
  }

  const links: LinkSpec[] = [];
  const street = (id: string, base: number, ends: string[]) => {
    if (ends.length === 0) return;
    devices.push(streetSwitch(id, base, ends.length));
    ends.forEach((end, i) => {
      const [device, iface] = end.includes(":") ? (end.split(":") as [string, string]) : [end, "eth0"];
      links.push({ id: `${id}-${device}`, a: { device: id, iface: `eth${i}` }, b: { device, iface } });
    });
  };
  street("nave", 0xa0, nave);
  street("cloister", 0xb0, cloister);
  street("tower", 0xc0, tower);
  street("window", 0xd0, window);
  return { devices, links };
}

/**
 * The secret room's home box (floors/floor-9.md, "Secret room"): one machine that is a switch (`br0`
 * over its home doors eth1–eth3), a registry on that street (a DHCP server on `br0`, dnsmasq's
 * defaults: it offers itself as the way out) and a router to the outside (`eth0`). Home's street is
 * `192.168.1.0/24`, as on most real home boxes; outside, the world is `10.0.9.7` on `10.0.9.0/24`.
 * The correct network: the observatory holds the first lease, and home forwards.
 */
export const HOME = {
  street: "192.168.1.0/24",
  home: "192.168.1.1",
  outside: "10.0.9.0/24",
  homeOutside: "10.0.9.2",
  world: "10.0.9.7",
  observatory: "192.168.1.100",
  pool: ["192.168.1.100", "192.168.1.150"] as [string, string],
} as const;

export function homeBox(): Topology {
  const doors = ["eth0", "eth1", "eth2", "eth3"];
  const home: DeviceSpec = {
    id: "home",
    hostname: "home",
    kind: "host",
    interfaces: doors.map((name, i) => ({ name, mac: `02:00:00:00:00:${(0x51 + i).toString(16)}` })),
    bridges: [{ name: "br0", ports: ["eth1", "eth2", "eth3"] }],
    addrs: [
      { dev: "eth0", cidr: `${HOME.homeOutside}/24` },
      { dev: "br0", cidr: `${HOME.home}/24` },
    ],
    sysctl: { "net.ipv4.ip_forward": "1" },
    dhcpServer: { dev: "br0", range: HOME.pool, sequential: true },
  };
  const observatory = house("observatory", MAC.observatory, HOME.observatory, HOME.home);
  // The world was told the way back to home's street (real home boxes rewrite addresses instead: the Frontier).
  const world: DeviceSpec = {
    ...house("world", "02:00:00:00:00:57", HOME.world, null),
    routes: [{ dst: HOME.street, via: HOME.homeOutside }],
  };
  return {
    devices: [observatory, home, world],
    links: [
      { id: "home-observatory", a: { device: "observatory", iface: "eth0" }, b: { device: "home", iface: "eth1" } },
      { id: "home-world", a: { device: "home", iface: "eth0" }, b: { device: "world", iface: "eth0" } },
    ],
  };
}
