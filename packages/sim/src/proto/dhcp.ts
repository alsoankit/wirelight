/**
 * BOOTP/DHCP messages (RFC 2131, RFC 2132): the fixed 236-byte header, the magic cookie, then
 * options. Both real programs the game copies (ISC dhclient and dnsmasq) pad every message with
 * zeros to the old BOOTP minimum of 300 bytes (tools/golden/bytes/dhcp-*.txt).
 */
import type { Mac } from "../mac";
import { ipToString, parseIp } from "./ipv4";

export const DHCP_PORT = { server: 67, client: 68 } as const;

export const BOOTP = { request: 1, reply: 2 } as const;

/** Option 53, the message type. */
export const DHCP_MSG = {
  discover: 1,
  offer: 2,
  request: 3,
  decline: 4,
  ack: 5,
  nak: 6,
  release: 7,
} as const;

export type DhcpMsgName = "DISCOVER" | "OFFER" | "REQUEST" | "DECLINE" | "ACK" | "NAK" | "RELEASE";

export const DHCP_MSG_NAME: Record<number, DhcpMsgName> = {
  1: "DISCOVER",
  2: "OFFER",
  3: "REQUEST",
  4: "DECLINE",
  5: "ACK",
  6: "NAK",
  7: "RELEASE",
};

export const DHCP_OPT = {
  pad: 0,
  subnetMask: 1,
  router: 3,
  broadcast: 28,
  requestedIp: 50,
  leaseTime: 51,
  msgType: 53,
  serverId: 54,
  paramRequest: 55,
  renewalTime: 58,
  rebindingTime: 59,
  end: 255,
} as const;

const COOKIE = [0x63, 0x82, 0x53, 0x63];
const FIXED = 236;
const MIN = 300;

export interface DhcpMessage {
  op: number;
  xid: number;
  secs: number;
  flags: number;
  ciaddr: string;
  yiaddr: string;
  siaddr: string;
  giaddr: string;
  chaddr: Mac;
  /** Options in the order they are sent, END excluded. */
  options: { code: number; data: number[] }[];
}

export function encodeDhcp(m: DhcpMessage): Uint8Array {
  const opts: number[] = [];
  for (const o of m.options) opts.push(o.code, o.data.length, ...o.data);
  opts.push(DHCP_OPT.end);
  const out = new Uint8Array(Math.max(MIN, FIXED + 4 + opts.length));
  out[0] = m.op;
  out[1] = 1; // Ethernet
  out[2] = 6;
  out[3] = 0;
  out[4] = (m.xid >>> 24) & 0xff;
  out[5] = (m.xid >>> 16) & 0xff;
  out[6] = (m.xid >>> 8) & 0xff;
  out[7] = m.xid & 0xff;
  out[8] = (m.secs >> 8) & 0xff;
  out[9] = m.secs & 0xff;
  out[10] = (m.flags >> 8) & 0xff;
  out[11] = m.flags & 0xff;
  out.set(parseIp(m.ciaddr) ?? [0, 0, 0, 0], 12);
  out.set(parseIp(m.yiaddr) ?? [0, 0, 0, 0], 16);
  out.set(parseIp(m.siaddr) ?? [0, 0, 0, 0], 20);
  out.set(parseIp(m.giaddr) ?? [0, 0, 0, 0], 24);
  out.set(
    m.chaddr.split(":").map((x) => Number.parseInt(x, 16)),
    28,
  );
  out.set(COOKIE, FIXED);
  out.set(opts, FIXED + 4);
  return out;
}

export function decodeDhcp(b: Uint8Array): DhcpMessage | null {
  if (b.length < FIXED + 4) return null;
  if (COOKIE.some((c, i) => b[FIXED + i] !== c)) return null;
  const chaddr = Array.from(b.subarray(28, 34))
    .map((x) => x.toString(16).padStart(2, "0"))
    .join(":");
  const options: DhcpMessage["options"] = [];
  let i = FIXED + 4;
  while (i < b.length) {
    const code = b[i] ?? DHCP_OPT.end;
    if (code === DHCP_OPT.end) break;
    if (code === DHCP_OPT.pad) {
      i++;
      continue;
    }
    const len = b[i + 1] ?? 0;
    options.push({ code, data: Array.from(b.subarray(i + 2, i + 2 + len)) });
    i += 2 + len;
  }
  return {
    op: b[0] ?? 0,
    xid: (((b[4] ?? 0) << 24) | ((b[5] ?? 0) << 16) | ((b[6] ?? 0) << 8) | (b[7] ?? 0)) >>> 0,
    secs: ((b[8] ?? 0) << 8) | (b[9] ?? 0),
    flags: ((b[10] ?? 0) << 8) | (b[11] ?? 0),
    ciaddr: ipToString(b, 12),
    yiaddr: ipToString(b, 16),
    siaddr: ipToString(b, 20),
    giaddr: ipToString(b, 24),
    chaddr,
    options,
  };
}

export function dhcpOption(m: DhcpMessage, code: number): number[] | undefined {
  return m.options.find((o) => o.code === code)?.data;
}

export function dhcpType(m: DhcpMessage): number | undefined {
  return dhcpOption(m, DHCP_OPT.msgType)?.[0];
}

export function optIp(m: DhcpMessage, code: number): string | undefined {
  const d = dhcpOption(m, code);
  return d && d.length >= 4 ? d.slice(0, 4).join(".") : undefined;
}

export function optU32(m: DhcpMessage, code: number): number | undefined {
  const d = dhcpOption(m, code);
  return d && d.length >= 4
    ? (((d[0] ?? 0) << 24) | ((d[1] ?? 0) << 16) | ((d[2] ?? 0) << 8) | (d[3] ?? 0)) >>> 0
    : undefined;
}

export const ipBytes = (ip: string): number[] => parseIp(ip) ?? [0, 0, 0, 0];
export const u32Bytes = (n: number): number[] => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
