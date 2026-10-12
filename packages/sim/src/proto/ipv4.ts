/** IPv4 (RFC 791) and UDP (RFC 768): just enough to build and read real packets with correct checksums. */
export const IPPROTO = { icmp: 1, udp: 17 } as const;

export function parseIp(text: string): number[] | null {
  const parts = text.trim().split(".");
  if (parts.length !== 4) return null;
  const n = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : -1));
  return n.every((x) => x >= 0 && x <= 255) ? n : null;
}

export function ipToString(b: Uint8Array, offset = 0): string {
  return Array.from(b.subarray(offset, offset + 4)).join(".");
}

/** The Internet checksum: one's-complement sum of 16-bit words. */
export function checksum(bytes: Uint8Array, initial = 0): number {
  let sum = initial;
  for (let i = 0; i < bytes.length; i += 2) sum += ((bytes[i] ?? 0) << 8) | (bytes[i + 1] ?? 0);
  while (sum >> 16) sum = (sum & 0xffff) + (sum >> 16);
  return ~sum & 0xffff;
}

export interface IPv4Packet {
  src: string;
  dst: string;
  proto: number;
  ttl: number;
  id: number;
  /** Don't Fragment. */
  df: boolean;
  /** Type of service byte (Linux sends ICMP errors with 0xc0). Default 0. */
  tos?: number;
  payload: Uint8Array;
}

export function encodeIPv4(p: IPv4Packet): Uint8Array {
  const src = parseIp(p.src);
  const dst = parseIp(p.dst);
  if (!src || !dst) throw new Error(`bad IPv4 address ${p.src} / ${p.dst}`);
  const total = 20 + p.payload.length;
  const out = new Uint8Array(total);
  out[0] = 0x45; // version 4, IHL 5
  out[1] = p.tos ?? 0; // DSCP/ECN
  out[2] = total >> 8;
  out[3] = total & 0xff;
  out[4] = (p.id >> 8) & 0xff;
  out[5] = p.id & 0xff;
  out[6] = p.df ? 0x40 : 0;
  out[7] = 0;
  out[8] = p.ttl;
  out[9] = p.proto;
  out.set(src, 12);
  out.set(dst, 16);
  const c = checksum(out.subarray(0, 20));
  out[10] = c >> 8;
  out[11] = c & 0xff;
  out.set(p.payload, 20);
  return out;
}

export interface DecodedIPv4 {
  version: number;
  ihl: number;
  totalLength: number;
  id: number;
  df: boolean;
  ttl: number;
  proto: number;
  checksum: number;
  checksumOk: boolean;
  src: string;
  dst: string;
  payload: Uint8Array;
}

export function decodeIPv4(b: Uint8Array): DecodedIPv4 {
  const ihl = ((b[0] ?? 0) & 0x0f) * 4;
  const totalLength = ((b[2] ?? 0) << 8) | (b[3] ?? 0);
  return {
    version: (b[0] ?? 0) >> 4,
    ihl,
    totalLength,
    id: ((b[4] ?? 0) << 8) | (b[5] ?? 0),
    df: ((b[6] ?? 0) & 0x40) !== 0,
    ttl: b[8] ?? 0,
    proto: b[9] ?? 0,
    checksum: ((b[10] ?? 0) << 8) | (b[11] ?? 0),
    checksumOk: checksum(b.subarray(0, ihl)) === 0,
    src: ipToString(b, 12),
    dst: ipToString(b, 16),
    // Ethernet padding past the IP total length is not part of the packet.
    payload: b.subarray(ihl, totalLength),
  };
}

export function encodeUDP(src: string, dst: string, srcPort: number, dstPort: number, data: Uint8Array): Uint8Array {
  const len = 8 + data.length;
  const out = new Uint8Array(len);
  out[0] = srcPort >> 8;
  out[1] = srcPort & 0xff;
  out[2] = dstPort >> 8;
  out[3] = dstPort & 0xff;
  out[4] = len >> 8;
  out[5] = len & 0xff;
  out.set(data, 8);
  // Pseudo-header: src, dst, zero, protocol, UDP length.
  const pseudo = new Uint8Array(12);
  pseudo.set(parseIp(src) ?? [0, 0, 0, 0], 0);
  pseudo.set(parseIp(dst) ?? [0, 0, 0, 0], 4);
  pseudo[9] = IPPROTO.udp;
  pseudo[10] = len >> 8;
  pseudo[11] = len & 0xff;
  let c = checksum(new Uint8Array([...pseudo, ...out]));
  if (c === 0) c = 0xffff; // RFC 768: zero means "no checksum"
  out[6] = c >> 8;
  out[7] = c & 0xff;
  return out;
}

export interface DecodedUDP {
  srcPort: number;
  dstPort: number;
  length: number;
  checksum: number;
  data: Uint8Array;
}

export function decodeUDP(b: Uint8Array): DecodedUDP {
  const length = ((b[4] ?? 0) << 8) | (b[5] ?? 0);
  return {
    srcPort: ((b[0] ?? 0) << 8) | (b[1] ?? 0),
    dstPort: ((b[2] ?? 0) << 8) | (b[3] ?? 0),
    length,
    checksum: ((b[6] ?? 0) << 8) | (b[7] ?? 0),
    data: b.subarray(8, length),
  };
}
