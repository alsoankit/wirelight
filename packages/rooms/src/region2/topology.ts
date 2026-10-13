/**
 * The Sorting Works' machines (floors/floor-3.md "The switch", floor-4.md "Switches"). A hall is a
 * Linux bridge `br0` over its doors: `hall` (and `hall-a`) has port MACs 02:00:00:00:00:a0–a3,
 * `hall-b` b0–b3 (a4 and b4 for 4.B's second span). The observatory is always on the first hall's
 * eth0, by `wire`; every other machine sits behind one hall door, by a corridor named after it
 * (`hall-eth1`). The topology is the network as the room finds it; faults break it further.
 */
import type { AnnouncerSpec, DeviceSpec, LabSpec, LinkSpec, MessengerSpec, Topology } from "@wirelight/sim";

export const OBSERVATORY = "02:00:00:00:00:05";
export const LANTERN = "02:00:00:00:00:07";
export const ANVIL = "02:00:00:00:00:0a";
export const BEACON = "02:00:00:00:00:0b";
export const QUILL = "02:00:00:00:00:0c";
export const COMPASS = "02:00:00:00:00:0d";
export const GATE = "02:00:00:00:00:0f";
export const EMBER = "02:00:00:00:00:10";
export const THISTLE = "02:00:00:00:00:11";
export const BELL = "02:00:00:00:00:12";
export const WREN = "02:00:00:00:00:13";
export const BROADCAST = "ff:ff:ff:ff:ff:ff";

/** A machine behind one of a hall's doors. */
export interface Machine {
  id: string;
  mac: string;
  hall?: string;
  door: string;
  /** Its answer to a direct message (default `hello from <name>`). */
  reply?: string;
  /** Answers a broadcast with `I'm here — <hostname>` (default true). */
  answersBroadcast?: boolean;
  /** The name it gives (default its id). */
  hostname?: string;
  /** Its answer to a broadcast, when not `I'm here — <hostname>`. */
  broadcastReply?: string;
  messenger?: MessengerSpec;
  announcer?: AnnouncerSpec;
  /** A machine with nothing listening: it never answers (4.1's empty alcove). */
  mute?: boolean;
}

export interface HallSpec {
  id: string;
  /** Last byte of eth0's MAC: 0xa0 for hall and hall-a, 0xb0 for hall-b. */
  base: number;
  doors: number;
}

export interface WorksOptions {
  halls?: HallSpec[];
  observatory?: { messenger?: MessengerSpec; messengers?: MessengerSpec[] };
  machines: Machine[];
  /** Cables between halls (4.2's span, 4.B's second one). */
  spans?: LinkSpec[];
}

const mac = (n: number) => `02:00:00:00:00:${n.toString(16).padStart(2, "0")}`;

function hallDevice(h: HallSpec): DeviceSpec {
  const doors = Array.from({ length: h.doors }, (_, i) => `eth${i}`);
  return {
    id: h.id,
    hostname: h.id,
    kind: "host",
    interfaces: doors.map((name, i) => ({ name, mac: mac(h.base + i) })),
    bridges: [{ name: "br0", ports: doors }],
  };
}

/** The observatory on the first hall's eth0, the halls, and the machines behind their doors. */
export function works(o: WorksOptions): Topology {
  const halls = o.halls ?? [{ id: "hall", base: 0xa0, doors: 4 }];
  const first = halls[0]?.id ?? "hall";
  const observatory: DeviceSpec = {
    id: "observatory",
    hostname: "observatory",
    kind: "host",
    interfaces: [{ name: "eth0", mac: OBSERVATORY }],
    lab: { mode: "responder", answersBroadcast: true },
    ...(o.observatory?.messenger ? { messenger: o.observatory.messenger } : {}),
    ...(o.observatory?.messengers ? { messengers: o.observatory.messengers } : {}),
  };
  const devices: DeviceSpec[] = [observatory, ...halls.map(hallDevice)];
  const links: LinkSpec[] = [
    { id: "wire", a: { device: "observatory", iface: "eth0" }, b: { device: first, iface: "eth0" } },
  ];
  for (const m of o.machines) {
    const lab: LabSpec | undefined = m.mute
      ? undefined
      : {
          mode: "responder",
          answersBroadcast: m.answersBroadcast ?? true,
          ...(m.reply ? { reply: m.reply } : {}),
          ...(m.broadcastReply ? { broadcastReply: m.broadcastReply } : {}),
        };
    devices.push({
      id: m.id,
      hostname: m.hostname ?? m.id,
      kind: "host",
      interfaces: [{ name: "eth0", mac: m.mac }],
      ...(lab ? { lab } : {}),
      ...(m.messenger ? { messenger: m.messenger } : {}),
      ...(m.announcer ? { announcer: m.announcer } : {}),
    });
    const hall = m.hall ?? first;
    links.push({ id: `${hall}-${m.door}`, a: { device: hall, iface: m.door }, b: { device: m.id, iface: "eth0" } });
  }
  links.push(...(o.spans ?? []));
  return { devices, links };
}

/** A machine's background announcement: a real IPv4/UDP broadcast, its inside sealed until Floor 6. */
export function announcer(text: string, lastByte: number, intervalMs = 8000): AnnouncerSpec {
  return { ip: `10.0.0.${lastByte}`, port: 40000, text, intervalMs };
}
