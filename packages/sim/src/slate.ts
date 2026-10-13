/**
 * The Slate (0043): the Knight's capture tablet, a game-only lab tool (`lab slate …`). It only
 * captures and reads; it changes nothing on the network.
 *
 * - `catch --next [--from X]` (6.1): the next message through a door of this machine is caught,
 *   tagged with a number, and kept. `--from` takes a house address (the packet's from) or a door
 *   name (the frame's from).
 * - `open N --layer frame|packet|message` (6.1): peels a catch one envelope at a time.
 * - `trace --next` (9.1): the next IPv4 packet this machine sends is tagged; it is caught once on
 *   every street it crosses (a new catch whenever its frame is rebuilt with new door names, so the
 *   copies a switch passes along don't count twice).
 * - `compare A B` (9.1): two catches side by side; what changed.
 *
 * The state lives in the world (saves and Reset include it); every catch, opening and comparison is
 * a trace event, so rooms can be won and detectors fire from them.
 */
import { deviceOf, type Kernel } from "./kernel";
import type { Mac } from "./mac";
import { decodeArp } from "./proto/arp";
import { decodeEth, ETHERTYPE, fromHex, toHex } from "./proto/ethernet";
import { decodeIcmp } from "./proto/icmp";
import { decodeIPv4, decodeUDP, IPPROTO } from "./proto/ipv4";
import { decodeLab } from "./proto/lab";
import type { DeviceId, IfaceName, Ip, SimEvent } from "./types";

export interface SlateCatch {
  n: number;
  t: number;
  device: DeviceId;
  iface: IfaceName;
  dir: "in" | "out";
  frameId: number;
  hex: string;
  /** Caught by the tracer (9.1). */
  traced: boolean;
}

export interface SlateState {
  catches: SlateCatch[];
  /** `catch --next`: waiting at this machine's doors. */
  armed: { device: DeviceId; from?: string } | null;
  /** `trace --next`: the packet's identity once sent, and the door names of its last catch. */
  tracer: { device: DeviceId; key: string | null; lastMacs: string | null } | null;
}

export type SlateLayerName = "frame" | "packet" | "message";

export type SlateLayer =
  | { layer: "frame"; to: Mac; from: Mac; type: number }
  | { layer: "packet"; from: Ip; to: Ip; ttl: number; proto: number; id: number; checksum: number }
  | { layer: "message"; kind: "udp"; fromPort: number; toPort: number; text: string }
  | { layer: "message"; kind: "icmp"; type: number; code: number; id: number; seq: number }
  | { layer: "message"; kind: "lab"; text: string; answer: boolean }
  | { layer: "message"; kind: "arp"; op: 1 | 2; senderMac: Mac; senderIp: Ip; targetMac: Mac; targetIp: Ip }
  | { layer: "message"; kind: "other"; bytes: number };

type FrameEvent = Extract<SimEvent, { kind: "frame.tx" | "frame.rx" }>;

function slate(k: Kernel): SlateState {
  k.s.slate ??= { catches: [], armed: null, tracer: null };
  return k.s.slate;
}

/** Every envelope in a frame, outermost first. */
export function peel(bytes: Uint8Array): SlateLayer[] {
  const f = decodeEth(bytes);
  const out: SlateLayer[] = [{ layer: "frame", to: f.dst, from: f.src, type: f.type }];
  if (f.type === ETHERTYPE.lab || f.type === ETHERTYPE.labAnswer) {
    out.push({ layer: "message", kind: "lab", text: decodeLab(f.payload), answer: f.type === ETHERTYPE.labAnswer });
  } else if (f.type === ETHERTYPE.arp) {
    const a = decodeArp(f.payload);
    out.push(
      a ? { layer: "message", kind: "arp", ...a } : { layer: "message", kind: "other", bytes: f.payload.length },
    );
  } else if (f.type === ETHERTYPE.ipv4) {
    const ip = decodeIPv4(f.payload);
    out.push({
      layer: "packet",
      from: ip.src,
      to: ip.dst,
      ttl: ip.ttl,
      proto: ip.proto,
      id: ip.id,
      checksum: ip.checksum,
    });
    if (ip.proto === IPPROTO.udp) {
      const u = decodeUDP(ip.payload);
      out.push({ layer: "message", kind: "udp", fromPort: u.srcPort, toPort: u.dstPort, text: decodeLab(u.data) });
    } else if (ip.proto === IPPROTO.icmp) {
      const m = decodeIcmp(ip.payload);
      out.push({ layer: "message", kind: "icmp", type: m.type, code: m.code, id: m.id, seq: m.seq });
    } else out.push({ layer: "message", kind: "other", bytes: ip.payload.length });
  } else out.push({ layer: "message", kind: "other", bytes: f.payload.length });
  return out;
}

/** The identity of an IPv4 packet that stays the same across hops: from, to, protocol and IP id. */
function packetKey(bytes: Uint8Array): string | null {
  const f = decodeEth(bytes);
  if (f.type !== ETHERTYPE.ipv4) return null;
  const ip = decodeIPv4(f.payload);
  return `${ip.src}>${ip.dst}/${ip.proto}#${ip.id}`;
}

function keep(k: Kernel, e: FrameEvent, traced: boolean): void {
  const s = slate(k);
  const n = s.catches.length + 1;
  const dir = e.kind === "frame.tx" ? "out" : "in";
  s.catches.push({
    n,
    t: k.s.t,
    device: e.device,
    iface: e.iface,
    dir,
    frameId: e.frameId,
    hex: toHex(e.bytes),
    traced,
  });
  k.emit({ kind: "slate.catch", t: k.s.t, n, device: e.device, iface: e.iface, dir, frameId: e.frameId, traced });
}

function matches(bytes: Uint8Array, from: string | undefined): boolean {
  if (from === undefined) return true;
  const f = decodeEth(bytes);
  if (f.src === from) return true;
  return f.type === ETHERTYPE.ipv4 && decodeIPv4(f.payload).src === from;
}

/** Every frame sent or taken in passes here: an armed catch or a running trace may keep it. */
export function slateSees(k: Kernel, e: FrameEvent): void {
  const s = k.s.slate;
  if (!s) return;
  if (s.armed && e.device === s.armed.device && matches(e.bytes, s.armed.from)) {
    s.armed = null;
    keep(k, e, false);
  }
  const tr = s.tracer;
  if (tr && e.kind === "frame.tx") {
    const key = packetKey(e.bytes);
    if (!key) return;
    if (tr.key === null) {
      // The first IPv4 packet the tracing machine sends is the one it follows.
      if (e.device !== tr.device) return;
      tr.key = key;
    } else if (key !== tr.key) return;
    const f = decodeEth(e.bytes);
    const macs = `${f.src}>${f.dst}`;
    if (macs === tr.lastMacs) return; // the same frame, passed on by a switch: the same street
    tr.lastMacs = macs;
    keep(k, e, true);
  }
}

export function slateCatchNext(k: Kernel, device: DeviceId, from?: string): void {
  slate(k).armed = { device, ...(from ? { from } : {}) };
  k.emit({ kind: "slate.arm", t: k.s.t, device, what: "catch" });
}

export function slateTraceNext(k: Kernel, device: DeviceId): void {
  slate(k).tracer = { device, key: null, lastMacs: null };
  k.emit({ kind: "slate.arm", t: k.s.t, device, what: "trace" });
}

export function slateCatches(k: Kernel): readonly SlateCatch[] {
  return k.s.slate?.catches ?? [];
}

export type SlateOpen =
  | { ok: true; layers: SlateLayer[]; reached: boolean }
  | { ok: false; error: "no-catch" | "no-device" };

/** Opens catch `n` down to `layer`: the layers it has up to there, and whether that layer exists. */
export function slateOpen(k: Kernel, device: DeviceId, n: number, layer: SlateLayerName): SlateOpen {
  if (!deviceOf(k, device)) return { ok: false, error: "no-device" };
  const c = k.s.slate?.catches[n - 1];
  if (!c) return { ok: false, error: "no-catch" };
  const all = peel(fromHex(c.hex));
  const depth = layer === "frame" ? 1 : layer === "packet" ? 2 : 3;
  const has = all.some((l) => l.layer === layer);
  const shown = has ? all.slice(0, all.findIndex((l) => l.layer === layer) + 1) : all.slice(0, depth);
  k.emit({ kind: "slate.open", t: k.s.t, n, layer, reached: has });
  return { ok: true, layers: shown, reached: has };
}

export interface SlateCompare {
  a: SlateLayer[];
  b: SlateLayer[];
  /** Fields that differ: "frame.to", "frame.from", "packet.ttl", "packet.checksum", … */
  changed: string[];
  /** Both catches are the same packet (same from, to, protocol and IP id). */
  samePacket: boolean;
  /** Both catches are the same frame (same door names): caught on the same street. */
  sameStreet: boolean;
}

export function slateCompare(k: Kernel, a: number, b: number): SlateCompare | null {
  const ca = k.s.slate?.catches[a - 1];
  const cb = k.s.slate?.catches[b - 1];
  if (!ca || !cb) return null;
  const la = peel(fromHex(ca.hex));
  const lb = peel(fromHex(cb.hex));
  const changed: string[] = [];
  for (const x of la) {
    const y = lb.find((l) => l.layer === x.layer);
    if (!y) continue;
    for (const [key, v] of Object.entries(x))
      if (key !== "layer" && key !== "kind" && (y as Record<string, unknown>)[key] !== v)
        changed.push(`${x.layer}.${key}`);
  }
  const ka = packetKey(fromHex(ca.hex));
  const samePacket = ka !== null && ka === packetKey(fromHex(cb.hex));
  const sameStreet = !changed.includes("frame.to") && !changed.includes("frame.from");
  k.emit({ kind: "slate.compare", t: k.s.t, a, b, changed, samePacket, sameStreet });
  return { a: la, b: lb, changed, samePacket, sameStreet };
}
