/**
 * The Lantern Town's machines (floors/floor-5.md "Machines (houses)"): the square, a Linux bridge, joins
 * every house on one street, 10.0.1.0/24. A door's MAC ends in its house number (anvil .10 → 0a), except
 * lantern's, whose door was replaced (5.1): 02:00:00:00:00:17, house still 10.0.1.7.
 */
import type { AnnouncerSpec, DeviceSpec, LabSpec, MessengerSpec, Topology } from "@wirelight/sim";

export const OBSERVATORY = "02:00:00:00:00:05";
/** Lantern's door since last winter (5.1). */
export const LANTERN = "02:00:00:00:00:17";
/** Lantern's old door: the name the messenger's card still holds in 5.1, and 6.B's pinned line. */
export const LANTERN_OLD = "02:00:00:00:00:07";
export const QUILL = "02:00:00:00:00:0c";
export const ANVIL = "02:00:00:00:00:0a";
export const BELL = "02:00:00:00:00:12";
export const EMBER = "02:00:00:00:00:10";
export const MOTH = "02:00:00:00:00:0e";
export const REGISTRY = "02:00:00:00:00:02";

/** House addresses on the square's street. */
export const IP = {
  observatory: "10.0.1.5",
  lantern: "10.0.1.7",
  anvil: "10.0.1.10",
  quill: "10.0.1.12",
  moth: "10.0.1.14",
  ember: "10.0.1.16",
  bell: "10.0.1.18",
  registry: "10.0.1.2",
} as const;

export type House = "lantern" | "quill" | "anvil" | "bell" | "ember" | "moth" | "registry";

/** Each house's door name. */
export const DOOR: Record<House, string> = {
  lantern: LANTERN,
  quill: QUILL,
  anvil: ANVIL,
  bell: BELL,
  ember: EMBER,
  moth: MOTH,
  registry: REGISTRY,
};

export interface TownOptions {
  /** The houses on the square, in the order of its doors (eth1, eth2…). Lantern is always first. */
  houses: House[];
  /** The Knight's messenger in the observatory (its card; a house address sends real pings). */
  messenger?: MessengerSpec;
  /** Lantern's answer to an old-style lab frame written to its door (5.1). */
  lanternLab?: LabSpec;
  /** Lantern's announcement, the sealed letter since Floor 2 (6.1). */
  lanternAnnounces?: Pick<AnnouncerSpec, "text">;
  /** Anything more a house needs (e.g. the registry's address service, 7.2). */
  extra?: Partial<Record<House, Partial<DeviceSpec>>>;
}

/** Every house's address is `/24` on the square's street: the topology is the correct town (SIM-40). */
export function town(o: TownOptions): Topology {
  const host = (id: string, mac: string, ip: string): DeviceSpec => ({
    id,
    hostname: id,
    kind: "host",
    interfaces: [{ name: "eth0", mac }],
    addrs: [{ dev: "eth0", cidr: `${ip}/24` }],
  });
  const observatory: DeviceSpec = {
    ...host("observatory", OBSERVATORY, IP.observatory),
    ...(o.messenger ? { messenger: { dev: "eth0", ...o.messenger } } : {}),
  };
  const houses: DeviceSpec[] = o.houses.map((h) => {
    const d = host(h, DOOR[h], IP[h]);
    if (h === "lantern") {
      if (o.lanternLab) d.lab = o.lanternLab;
      if (o.lanternAnnounces)
        d.announcer = { ip: IP.lantern, dst: "10.0.1.255", port: 40000, intervalMs: 6000, ...o.lanternAnnounces };
    }
    return { ...d, ...(o.extra?.[h] ?? {}) };
  });
  const ports = ["observatory", ...o.houses].map((_, i) => `eth${i}`);
  const square: DeviceSpec = {
    id: "square",
    hostname: "square",
    kind: "host",
    interfaces: ports.map((name, i) => ({ name, mac: `02:00:00:00:00:${(0x40 + i).toString(16)}` })),
    bridges: [{ name: "br0", ports }],
  };
  const links: Topology["links"] = ["observatory", ...o.houses].map((id, i) => ({
    id: `path-${id}`,
    a: { device: id, iface: "eth0" },
    b: { device: "square", iface: `eth${i}` },
  }));
  return { devices: [observatory, square, ...houses], links };
}
