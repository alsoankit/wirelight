/** ARP for IPv4 over Ethernet (RFC 826): the 28-byte packet Linux sends. */
import { bytesToMac, type Mac, macToBytes } from "../mac";
import { ipToString, parseIp } from "./ipv4";

export const ARP_REQUEST = 1;
export const ARP_REPLY = 2;

export interface ArpPacket {
  op: 1 | 2;
  senderMac: Mac;
  senderIp: string;
  /** In a request Linux sends zeros here. */
  targetMac: Mac;
  targetIp: string;
}

export function encodeArp(p: ArpPacket): Uint8Array {
  const out = new Uint8Array(28);
  out[1] = 1; // hardware: Ethernet
  out[2] = 0x08; // protocol: IPv4
  out[4] = 6;
  out[5] = 4;
  out[7] = p.op;
  out.set(macToBytes(p.senderMac), 8);
  out.set(parseIp(p.senderIp) ?? [0, 0, 0, 0], 14);
  out.set(macToBytes(p.targetMac), 18);
  out.set(parseIp(p.targetIp) ?? [0, 0, 0, 0], 24);
  return out;
}

export function decodeArp(b: Uint8Array): ArpPacket | null {
  if (b.length < 28 || b[1] !== 1 || b[2] !== 0x08 || b[3] !== 0 || b[4] !== 6 || b[5] !== 4) return null;
  const op = b[7];
  if (op !== 1 && op !== 2) return null;
  return {
    op,
    senderMac: bytesToMac(b, 8),
    senderIp: ipToString(b, 14),
    targetMac: bytesToMac(b, 18),
    targetIp: ipToString(b, 24),
  };
}
