/**
 * 802.1D bridge protocol data units (BPDUs), as the Linux bridge builds them (net/bridge/br_stp_bpdu.c):
 * an 802.3 frame (a length, not an EtherType) to the bridge group address 01:80:c2:00:00:00, an LLC
 * header (DSAP 0x42, SSAP 0x42, UI 0x03), then the BPDU. A configuration BPDU is 35 bytes, a topology
 * change notification (TCN) 4. Times travel in 1/256 s ("ticks"); the kernel keeps them in jiffies (ms).
 */
import { bytesToMac, type Mac, macToBytes } from "../mac";

export const STP_GROUP: Mac = "01:80:c2:00:00:00";
const LLC = [0x42, 0x42, 0x03];

export interface ConfigBpdu {
  topologyChange: boolean;
  topologyChangeAck: boolean;
  /** Bridge ids as 16 hex digits: priority (4) then MAC (12), so string order is the kernel's memcmp. */
  root: string;
  rootPathCost: number;
  bridgeId: string;
  portId: number;
  /** Milliseconds (jiffies at HZ=1000). */
  messageAge: number;
  maxAge: number;
  helloTime: number;
  forwardDelay: number;
}

export type Bpdu = ({ type: "config" } & ConfigBpdu) | { type: "tcn" };

/** br_set_ticks: jiffies → 1/256 s, rounded down. */
function ticks(ms: number): number {
  return Math.floor((256 * ms) / 1000);
}

/** br_get_ticks: 1/256 s → jiffies, rounded up. */
function fromTicks(t: number): number {
  return Math.ceil((t * 1000) / 256);
}

function idBytes(id: string): number[] {
  return Array.from({ length: 8 }, (_, i) => Number.parseInt(id.slice(i * 2, i * 2 + 2), 16));
}

function idHex(b: Uint8Array, at: number): string {
  return Array.from(b.subarray(at, at + 8), (x) => x.toString(16).padStart(2, "0")).join("");
}

/** A bridge id from a priority and the bridge's MAC. */
export function bridgeIdOf(priority: number, mac: Mac): string {
  return priority.toString(16).padStart(4, "0") + mac.replace(/:/g, "");
}

/** The whole frame: 802.3 header, LLC, BPDU. */
export function encodeBpdu(src: Mac, b: Bpdu): Uint8Array {
  const body: number[] = [0, 0, 0];
  if (b.type === "tcn") body.push(0x80);
  else {
    const be16 = (n: number) => [(n >> 8) & 0xff, n & 0xff];
    body.push(
      0x00,
      (b.topologyChange ? 0x01 : 0) | (b.topologyChangeAck ? 0x80 : 0),
      ...idBytes(b.root),
      (b.rootPathCost >>> 24) & 0xff,
      (b.rootPathCost >> 16) & 0xff,
      (b.rootPathCost >> 8) & 0xff,
      b.rootPathCost & 0xff,
      ...idBytes(b.bridgeId),
      ...be16(b.portId),
      ...be16(ticks(b.messageAge)),
      ...be16(ticks(b.maxAge)),
      ...be16(ticks(b.helloTime)),
      ...be16(ticks(b.forwardDelay)),
    );
  }
  const out = new Uint8Array(14 + LLC.length + body.length);
  out.set(macToBytes(STP_GROUP), 0);
  out.set(macToBytes(src), 6);
  const len = LLC.length + body.length;
  out[12] = (len >> 8) & 0xff;
  out[13] = len & 0xff;
  out.set(LLC, 14);
  out.set(body, 17);
  return out;
}

/** Is this an 802.3 frame carrying LLC for STP (SAP 0x42)? */
export function isStpFrame(f: Uint8Array): boolean {
  const lenOrType = ((f[12] ?? 0) << 8) | (f[13] ?? 0);
  return lenOrType <= 1500 && f[14] === 0x42 && f[15] === 0x42 && f[16] === 0x03;
}

/** The BPDU in a frame, as br_stp_rcv reads it; null if it isn't one the bridge would take. */
export function decodeBpdu(f: Uint8Array): Bpdu | null {
  if (!isStpFrame(f) || f.length < 21) return null;
  const b = f.subarray(17);
  if (b[0] !== 0 || b[1] !== 0 || b[2] !== 0) return null;
  if (b[3] === 0x80) return { type: "tcn" };
  if (b[3] !== 0x00 || b.length < 35) return null;
  const be16 = (at: number) => ((b[at] ?? 0) << 8) | (b[at + 1] ?? 0);
  return {
    type: "config",
    topologyChange: ((b[4] ?? 0) & 0x01) !== 0,
    topologyChangeAck: ((b[4] ?? 0) & 0x80) !== 0,
    root: idHex(b, 5),
    rootPathCost: (((b[13] ?? 0) << 24) | ((b[14] ?? 0) << 16) | ((b[15] ?? 0) << 8) | (b[16] ?? 0)) >>> 0,
    bridgeId: idHex(b, 17),
    portId: be16(25),
    messageAge: fromTicks(be16(27)),
    maxAge: fromTicks(be16(29)),
    helloTime: fromTicks(be16(31)),
    forwardDelay: fromTicks(be16(33)),
  };
}

/** A bridge id as tcpdump prints it: "8000.02:00:00:00:0a:01". */
function idText(id: string): string {
  return `${id.slice(0, 4)}.${bytesToMac(Uint8Array.from(idBytes(id).slice(2)), 0)}`;
}

/**
 * The STP part of a tcpdump line (print-stp.c, without -v): "STP 802.1d, Config, Flags [none],
 * bridge-id 8000.02:00:00:00:0a:01.8002, length 35" or "STP 802.1d, Topology Change".
 */
export function stpText(f: Uint8Array): string {
  const b = decodeBpdu(f);
  if (!b) return "STP 802.1d, unknown";
  if (b.type === "tcn") return "STP 802.1d, Topology Change";
  const flags = [b.topologyChange ? "Topology change" : "", b.topologyChangeAck ? "Topology change ACK" : ""].filter(
    Boolean,
  );
  const port = b.portId.toString(16).padStart(4, "0");
  return `STP 802.1d, Config, Flags [${flags.length ? flags.join(", ") : "none"}], bridge-id ${idText(b.bridgeId)}.${port}, length 35`;
}

/** The link part of a tcpdump -e line for an 802.3 LLC frame (print-llc.c). */
export function llcText(f: Uint8Array): string {
  const len = ((f[12] ?? 0) << 8) | (f[13] ?? 0);
  return `802.3, length ${len}: LLC, dsap STP (0x42) Individual, ssap STP (0x42) Command, ctrl 0x03`;
}
