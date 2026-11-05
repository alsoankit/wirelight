/** The Overgrown Halls' machines (floors/floor-1.md, floor-2.md: "Machines"). */
import { lanternAnnouncement } from "@wirelight/content";
import type { DeviceSpec, Topology } from "@wirelight/sim";

export const OBSERVATORY = "02:00:00:00:00:05";
export const OBSERVATORY_ETH1 = "02:00:00:00:00:06";
export const KITCHEN = "02:00:00:00:00:07";
export const LIBRARY = "02:00:00:00:00:0c";
export const CELLAR = "02:00:00:00:00:0e";
export const BROADCAST = "ff:ff:ff:ff:ff:ff";

export interface HallsOptions {
  /** Kitchen's own regular message to the observatory, every 4 s (Floor 1, 2.4). */
  lanternMessage?: string;
  /** Kitchen's answer to a direct message (default: `hello from kitchen`). */
  lanternReply?: string;
  /** Kitchen's background announcement every 6 s (from Floor 2). */
  announcements?: boolean;
  /** The messenger in the observatory: its card and the door it sends from. */
  messenger?: { to: string; dev?: string; msg: string };
  /** A machine behind the observatory's second door, in a sealed room (2.3, 2.B). */
  second?: {
    id: string;
    mac: string;
    link: string;
    reply: string;
    /** Its own calls (cellar's, to a name nobody has). */
    calls?: { to: string; msg: string; intervalMs: number };
  };
}

/** The observatory and kitchen, one cable `wire`; on Floor 2, sometimes a second machine on eth1. */
export function halls(o: HallsOptions = {}): Topology {
  const observatory: DeviceSpec = {
    id: "observatory",
    hostname: "observatory",
    kind: "host",
    interfaces: [{ name: "eth0", mac: OBSERVATORY }, ...(o.second ? [{ name: "eth1", mac: OBSERVATORY_ETH1 }] : [])],
    // The observatory answers what's sent to it, so a message and its answer light the corridor.
    lab: { mode: "responder", answersBroadcast: true },
    ...(o.messenger ? { messenger: { to: o.messenger.to, msg: o.messenger.msg, dev: o.messenger.dev ?? "eth0" } } : {}),
  };
  const kitchen: DeviceSpec = {
    id: "kitchen",
    hostname: "kitchen",
    kind: "host",
    interfaces: [{ name: "eth0", mac: KITCHEN }],
    lab: { mode: "responder", answersBroadcast: true, ...(o.lanternReply ? { reply: o.lanternReply } : {}) },
    ...(o.lanternMessage ? { messenger: { to: OBSERVATORY, msg: o.lanternMessage, intervalMs: 4000 } } : {}),
    // A real IPv4/UDP broadcast; its inside stays sealed until Floor 6.
    ...(o.announcements
      ? { announcer: { ip: "10.0.0.7", port: 40000, text: lanternAnnouncement, intervalMs: 6000 } }
      : {}),
  };
  const devices = [observatory, kitchen];
  const links: Topology["links"] = [
    { id: "wire", a: { device: "observatory", iface: "eth0" }, b: { device: "kitchen", iface: "eth0" } },
  ];
  if (o.second) {
    const s = o.second;
    devices.push({
      id: s.id,
      hostname: s.id,
      kind: "host",
      interfaces: [{ name: "eth0", mac: s.mac }],
      lab: { mode: "responder", answersBroadcast: true, reply: s.reply },
      ...(s.calls ? { messenger: { to: s.calls.to, msg: s.calls.msg, intervalMs: s.calls.intervalMs } } : {}),
    });
    links.push({ id: s.link, a: { device: "observatory", iface: "eth1" }, b: { device: s.id, iface: "eth0" } });
  }
  return { devices, links };
}
