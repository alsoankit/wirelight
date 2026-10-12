/** IPv4 addresses as numbers, prefixes, subnets: what `ip addr` and `ip route` reason with. */
import { parseIp } from "./proto/ipv4";
import type { Ip } from "./types";

export function ipToInt(ip: Ip): number | null {
  const b = parseIp(ip);
  if (!b) return null;
  return (((b[0] as number) << 24) | ((b[1] as number) << 16) | ((b[2] as number) << 8) | (b[3] as number)) >>> 0;
}

export function intToIp(n: number): Ip {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join(".");
}

export function maskOf(prefix: number): number {
  return prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
}

/** "10.0.0.5/24" → { ip, prefix }; a bare address means /32 (as iproute2 reads it). */
export function parseCidr(text: string): { ip: Ip; prefix: number } | null {
  const [a, p] = text.split("/");
  if (!a || ipToInt(a) === null) return null;
  if (p === undefined) return { ip: a, prefix: 32 };
  if (!/^\d{1,2}$/.test(p) || Number(p) > 32) return null;
  return { ip: a, prefix: Number(p) };
}

export function networkOf(ip: Ip, prefix: number): Ip {
  return intToIp(((ipToInt(ip) ?? 0) & maskOf(prefix)) >>> 0);
}

export function broadcastOf(ip: Ip, prefix: number): Ip {
  return intToIp(((ipToInt(ip) ?? 0) | (~maskOf(prefix) >>> 0)) >>> 0);
}

export function inSubnet(ip: Ip, net: Ip, prefix: number): boolean {
  const a = ipToInt(ip);
  const b = ipToInt(net);
  if (a === null || b === null) return false;
  const m = maskOf(prefix);
  return (a & m) >>> 0 === (b & m) >>> 0;
}

/** A route's destination as network and prefix ("default" is 0.0.0.0/0). */
export function routeNet(dst: string): { net: Ip; prefix: number } {
  if (dst === "default") return { net: "0.0.0.0", prefix: 0 };
  const c = parseCidr(dst);
  return c ? { net: c.ip, prefix: c.prefix } : { net: "0.0.0.0", prefix: 32 };
}
