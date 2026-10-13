/** ICMP (RFC 792): echo, and the errors Linux sends, with real checksums. */
import { checksum } from "./ipv4";

export const ICMP = {
  echoReply: 0,
  unreachable: 3,
  redirect: 5,
  echoRequest: 8,
  timeExceeded: 11,
} as const;

export const UNREACH = { net: 0, host: 1, port: 3 } as const;

export interface IcmpMessage {
  type: number;
  code: number;
  /** Echo: identifier and sequence. Errors: unused (zero). Redirect: the new gateway (id = high half). */
  id: number;
  seq: number;
  /** Echo: the payload. Errors: the original IP header and the first 8 bytes of its data. */
  data: Uint8Array;
}

export function encodeIcmp(m: IcmpMessage): Uint8Array {
  const out = new Uint8Array(8 + m.data.length);
  out[0] = m.type;
  out[1] = m.code;
  out[4] = (m.id >> 8) & 0xff;
  out[5] = m.id & 0xff;
  out[6] = (m.seq >> 8) & 0xff;
  out[7] = m.seq & 0xff;
  out.set(m.data, 8);
  const c = checksum(out);
  out[2] = c >> 8;
  out[3] = c & 0xff;
  return out;
}

export function decodeIcmp(b: Uint8Array): IcmpMessage & { checksumOk: boolean } {
  return {
    type: b[0] ?? 0,
    code: b[1] ?? 0,
    id: ((b[4] ?? 0) << 8) | (b[5] ?? 0),
    seq: ((b[6] ?? 0) << 8) | (b[7] ?? 0),
    data: b.subarray(8),
    checksumOk: checksum(b) === 0,
  };
}

/**
 * The payload Linux `ping` sends (iputils, 56 data bytes): an 8-byte timestamp (seconds and
 * microseconds, host order on the sender) followed by the bytes 0x10..0x37. The simulator writes the
 * virtual clock into the timestamp.
 */
export function pingPayload(nowMs: number, size = 56): Uint8Array {
  const out = new Uint8Array(size);
  const sec = Math.floor(nowMs / 1000);
  const usec = Math.floor((nowMs % 1000) * 1000);
  // Little-endian 32-bit fields inside 64-bit timeval halves, as x86-64 Linux writes them.
  for (let i = 0; i < 4; i++) out[i] = (sec >>> (8 * i)) & 0xff;
  for (let i = 0; i < 4; i++) out[8 + i] = (usec >>> (8 * i)) & 0xff;
  for (let i = 16; i < size; i++) out[i] = i;
  return out;
}
