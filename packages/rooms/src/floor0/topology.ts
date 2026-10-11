import type { Topology } from "@wirelight/sim";

export const OBSERVATORY_MAC = "02:00:00:00:00:05";
export const LANTERN_MAC = "02:00:00:00:00:07";
/** The Knight's old address on the card: one character off from lantern's (SRS 0.2). */
export const OLD_MAC = "02:00:00:00:00:17";

/** Floor 0: two machines, one cable (SRS §13.3). */
export function twoMachines(
  lanternReply: string,
  opts: { messenger?: boolean; announcements?: boolean } = {},
): Topology {
  return {
    devices: [
      {
        id: "observatory",
        hostname: "observatory",
        kind: "host",
        interfaces: [{ name: "eth0", mac: OBSERVATORY_MAC }],
        // The Knight's automatic messenger, reading the address card on the desk.
        ...(opts.messenger ? { messenger: { to: LANTERN_MAC, msg: "hello from the observatory" } } : {}),
      },
      {
        id: "lantern",
        hostname: "lantern",
        kind: "host",
        interfaces: [{ name: "eth0", mac: LANTERN_MAC }],
        lab: { mode: "responder", reply: lanternReply, answersBroadcast: true },
        // A background announcement: a real IPv4/UDP packet, shown sealed on Floor 0.
        ...(opts.announcements
          ? { announcer: { ip: "10.0.0.7", port: 40000, text: "lantern is here", intervalMs: 9000 } }
          : {}),
      },
    ],
    links: [{ id: "wire", a: { device: "observatory", iface: "eth0" }, b: { device: "lantern", iface: "eth0" } }],
  };
}
