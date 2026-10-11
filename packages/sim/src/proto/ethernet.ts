import { bytesToMac, type Mac, macToBytes } from "../mac";
import { decodeIPv4, decodeUDP, IPPROTO } from "./ipv4";

/** Ethernet II without FCS, padded to the 60-byte minimum (SIM-10). */
export const ETH_HEADER = 14;
export const ETH_MIN = 60;

export const ETHERTYPE = { ipv4: 0x0800, arp: 0x0806, lab: 0x88b5 } as const;

export interface EthFrame {
  dst: Mac;
  src: Mac;
  type: number;
  payload: Uint8Array;
}

export function encodeEth(f: EthFrame): Uint8Array {
  const len = Math.max(ETH_MIN, ETH_HEADER + f.payload.length);
  const out = new Uint8Array(len);
  out.set(macToBytes(f.dst), 0);
  out.set(macToBytes(f.src), 6);
  out[12] = (f.type >> 8) & 0xff;
  out[13] = f.type & 0xff;
  out.set(f.payload, ETH_HEADER);
  return out;
}

export function decodeEth(b: Uint8Array): EthFrame {
  return {
    dst: bytesToMac(b, 0),
    src: bytesToMac(b, 6),
    type: ((b[12] ?? 0) << 8) | (b[13] ?? 0),
    payload: b.subarray(ETH_HEADER),
  };
}

export function toHex(b: Uint8Array): string {
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

export function fromHex(h: string): Uint8Array {
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** One-line summary in `tcpdump -e -n` style, without the timestamp. */
export function summarizeEth(b: Uint8Array): string {
  const f = decodeEth(b);
  if (f.type === ETHERTYPE.ipv4) {
    const ip = decodeIPv4(f.payload);
    const head = `${f.src} > ${f.dst}, ethertype IPv4 (0x0800), length ${b.length}`;
    if (ip.proto === IPPROTO.udp) {
      const u = decodeUDP(ip.payload);
      return `${head}: ${ip.src}.${u.srcPort} > ${ip.dst}.${u.dstPort}: UDP, length ${u.length - 8}`;
    }
    return `${head}: ${ip.src} > ${ip.dst}: ip-proto-${ip.proto}`;
  }
  const kind =
    f.type === ETHERTYPE.ipv4
      ? "ethertype IPv4 (0x0800)"
      : f.type === ETHERTYPE.arp
        ? "ethertype ARP (0x0806)"
        : `ethertype Unknown (0x${f.type.toString(16).padStart(4, "0")})`;
  return `${f.src} > ${f.dst}, ${kind}, length ${b.length}`;
}
