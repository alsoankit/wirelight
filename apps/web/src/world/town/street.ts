import type { RoomDef } from "@wirelight/rooms";
import { decodeEth, decodeIcmp, decodeIPv4, ETHERTYPE, type SimEvent } from "@wirelight/sim";

// What the Lantern Town's readable things say (Region 3: the register, the street sign, the census
// board, the numbers on the doors), read from the room itself. The topology is the correct town
// (SIM-40): every house at its own address; the room's faults are what went wrong since. So the
// register keeps each house's own address even while a house is using another one.

export type House = { id: string; mac: string; address: string; prefix: number };

/** The switch that is the town square (a machine with a bridge), if this room has one. */
export function squareOf(room: RoomDef): string | undefined {
  return room.topology.devices.find((d) => d.bridges?.length)?.id;
}

/** Each machine's own address on its first door, from the topology (the town as it should be). */
function homes(room: RoomDef): House[] {
  const out: House[] = [];
  for (const d of room.topology.devices) {
    if (d.bridges?.length) continue;
    const a = d.addrs?.[0];
    const door = d.interfaces.find((i) => i.name === a?.dev) ?? d.interfaces[0];
    if (!a || !door) continue;
    const [address = "", prefix = "32"] = a.cidr.split("/");
    out.push({ id: d.id, mac: door.mac, address, prefix: Number(prefix) });
  }
  return out;
}

function toNumber(ip: string): number {
  return ip.split(".").reduce((n, part) => n * 256 + Number(part), 0) >>> 0;
}

function toAddress(n: number): string {
  return [24, 16, 8, 0].map((s) => (n >>> s) & 255).join(".");
}

/** The street an address is on: `10.0.1.7/24` → `10.0.1.0/24`. */
export function streetOf(address: string, prefix: number): string {
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return `${toAddress((toNumber(address) & mask) >>> 0)}/${prefix}`;
}

/**
 * The square's street: the one most of its houses (everyone but the player's machine) live on.
 * Undefined when the room has no square.
 */
export function squareStreet(room: RoomDef): string | undefined {
  if (!squareOf(room)) return undefined;
  const counts = new Map<string, number>();
  for (const h of homes(room)) {
    if (h.id === room.playerDevice) continue;
    const s = streetOf(h.address, h.prefix);
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

/** What every address on a street starts with, when the street is whole numbers (`10.0.1.0/24` → `10.0.1.`). */
export function streetStart(street: string): string {
  const [ip = "", prefix = "24"] = street.split("/");
  const whole = Math.floor(Number(prefix) / 8);
  return `${ip.split(".").slice(0, whole).join(".")}.`;
}

/**
 * The register (floors/floor-5.md): every house on the square's street and its own address, in the
 * order of the square's doors. The player's own house isn't listed: finding a number for it is theirs.
 */
export function register(room: RoomDef): House[] {
  const street = squareStreet(room);
  const square = squareOf(room);
  if (!street || !square) return [];
  const order = doorOrder(room, square);
  return homes(room)
    .filter((h) => h.id !== room.playerDevice && streetOf(h.address, Number(street.split("/")[1])) === street)
    .sort((a, b) => (order.get(a.id) ?? 99) - (order.get(b.id) ?? 99));
}

/** The houses on a census (7.B): the register's houses, but not the registry's office. */
export function census(room: RoomDef): House[] {
  return register(room).filter((h) => !room.topology.devices.find((d) => d.id === h.id)?.dhcpServer);
}

/** Each machine plugged into the square, by its door's place (eth0 = 0…). */
export function doorOrder(room: RoomDef, square: string): Map<string, number> {
  const out = new Map<string, number>();
  const spec = room.topology.devices.find((d) => d.id === square);
  spec?.interfaces.forEach((i, n) => {
    const link = room.topology.links.find(
      (l) => (l.a.device === square && l.a.iface === i.name) || (l.b.device === square && l.b.iface === i.name),
    );
    if (!link) return;
    out.set(link.a.device === square ? link.b.device : link.a.device, n);
  });
  return out;
}

/** A house's number: the last part of its own address (`10.0.1.7` → `7`). */
export function houseNumber(room: RoomDef, device: string): string | undefined {
  return homes(room)
    .find((h) => h.id === device)
    ?.address.split(".")
    .at(-1);
}

/**
 * Who has answered a ping from `device` so far: each house whose echo reply came back from its own
 * address and its own door (as the census's win counts them, region3/predicates.ts `echoReplies`).
 */
export function answered(
  events: readonly SimEvent[],
  device: string,
  myMacs: Set<string>,
  houses: House[],
): Set<string> {
  const out = new Set<string>();
  for (const e of events) {
    if (e.kind !== "frame.rx" || e.device !== device) continue;
    const eth = decodeEth(e.bytes);
    if (eth.type !== ETHERTYPE.ipv4 || !myMacs.has(eth.dst)) continue;
    const ip = decodeIPv4(eth.payload);
    if (ip.proto !== 1 || decodeIcmp(ip.payload).type !== 0) continue;
    const h = houses.find((x) => x.address === ip.src && x.mac === eth.src);
    if (h) out.add(h.id);
  }
  return out;
}
