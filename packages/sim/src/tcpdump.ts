/**
 * `tcpdump` (4.99.6) as a running process in the simulated machine: it listens on one door and
 * prints each frame that matches its filter, as real tcpdump prints it, then its statistics when it
 * has its count (-c) or is interrupted (Ctrl+C). Output matches the golden files captured on real
 * Linux (tools/golden/capture-tcpdump.sh).
 *
 * What a door hears: every frame sent out of it or arriving on it (before the machine decides what to
 * do with it). On a bridge, tcpdump turns on promiscuous mode, so the bridge hears every frame that
 * enters it from any port, plus what the machine sends through it (as captured on br0).
 */

import { deviceOf, type Kernel } from "./kernel";
import { BROADCAST } from "./mac";
import { decodeArp } from "./proto/arp";
import { decodeDhcp } from "./proto/dhcp";
import { decodeEth, ETHERTYPE } from "./proto/ethernet";
import { decodeIcmp, ICMP, UNREACH } from "./proto/icmp";
import { decodeIPv4, decodeUDP, IPPROTO } from "./proto/ipv4";
import { isStpFrame, llcText, stpText } from "./proto/stp";
import type { DeviceId, DeviceState, IfaceName, Ip, TcpdumpProc } from "./types";

// ── Filters (a small part of pcap's language: what the rooms use) ─────────────────────────

export type Filter =
  | { kind: "proto"; proto: "arp" | "icmp" | "udp" | "tcp" | "ip" | "stp" }
  | { kind: "host"; ip: Ip; dir: "any" | "src" | "dst" }
  | { kind: "port"; port: number }
  | { kind: "and" | "or"; a: Filter; b: Filter }
  | { kind: "not"; a: Filter }
  | { kind: "all" };

/** Parses a filter expression; null means pcap's "syntax error". */
export function parseFilter(words: string[]): Filter | null {
  if (words.length === 0) return { kind: "all" };
  let i = 0;
  const peek = () => words[i];
  const primary = (): Filter | null => {
    const w = words[i++];
    if (w === undefined) return null;
    if (w === "(") {
      const f = orExpr();
      if (words[i++] !== ")") return null;
      return f;
    }
    if (w === "not" || w === "!") {
      const a = primary();
      return a && { kind: "not", a };
    }
    if (w === "arp" || w === "icmp" || w === "udp" || w === "tcp" || w === "ip" || w === "stp")
      return { kind: "proto", proto: w };
    if (w === "host" || w === "src" || w === "dst") {
      let dir: "any" | "src" | "dst" = "any";
      let next = w;
      if (w === "src" || w === "dst") {
        dir = w;
        if (peek() === "host") i++;
        next = "host";
      }
      void next;
      const ip = words[i++];
      if (!ip || !/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return null;
      return { kind: "host", ip, dir };
    }
    if (w === "port") {
      const p = Number(words[i++]);
      return Number.isInteger(p) ? { kind: "port", port: p } : null;
    }
    return null;
  };
  const andExpr = (): Filter | null => {
    let a = primary();
    while (a && (peek() === "and" || peek() === "&&")) {
      i++;
      const b = primary();
      if (!b) return null;
      a = { kind: "and", a, b };
    }
    return a;
  };
  const orExpr = (): Filter | null => {
    let a = andExpr();
    while (a && (peek() === "or" || peek() === "||")) {
      i++;
      const b = andExpr();
      if (!b) return null;
      a = { kind: "or", a, b };
    }
    return a;
  };
  const f = orExpr();
  return f && i === words.length ? f : null;
}

function matches(f: Filter, bytes: Uint8Array): boolean {
  const e = decodeEth(bytes);
  switch (f.kind) {
    case "all":
      return true;
    case "and":
      return matches(f.a, bytes) && matches(f.b, bytes);
    case "or":
      return matches(f.a, bytes) || matches(f.b, bytes);
    case "not":
      return !matches(f.a, bytes);
    case "proto":
      if (f.proto === "stp") return isStpFrame(bytes);
      if (f.proto === "arp") return e.type === ETHERTYPE.arp;
      if (e.type !== ETHERTYPE.ipv4) return false;
      if (f.proto === "ip") return true;
      return decodeIPv4(e.payload).proto === { icmp: IPPROTO.icmp, udp: IPPROTO.udp, tcp: 6 }[f.proto];
    case "host": {
      if (e.type === ETHERTYPE.arp) {
        const a = decodeArp(e.payload);
        if (!a) return false;
        return (f.dir !== "dst" && a.senderIp === f.ip) || (f.dir !== "src" && a.targetIp === f.ip);
      }
      if (e.type !== ETHERTYPE.ipv4) return false;
      const ip = decodeIPv4(e.payload);
      return (f.dir !== "dst" && ip.src === f.ip) || (f.dir !== "src" && ip.dst === f.ip);
    }
    case "port": {
      if (e.type !== ETHERTYPE.ipv4) return false;
      const ip = decodeIPv4(e.payload);
      if (ip.proto !== IPPROTO.udp) return false;
      const u = decodeUDP(ip.payload);
      return u.srcPort === f.port || u.dstPort === f.port;
    }
  }
}

// ── Printing ───────────────────────────────────────────────────────────────────────────────

/** Well-known port names tcpdump prints unless told -nn (from /etc/services). */
const SERVICES: Record<number, string> = {
  7: "echo",
  9: "discard",
  53: "domain",
  67: "bootps",
  68: "bootpc",
  123: "ntp",
};

/** The wall clock the capture shows: network time from an arbitrary evening (normalised in goldens). */
function stamp(t: number): string {
  const ms = 21 * 3_600_000 + t;
  const h = Math.floor(ms / 3_600_000) % 24;
  const m = Math.floor(ms / 60_000) % 60;
  const s = Math.floor(ms / 1000) % 60;
  const us = Math.floor((ms % 1000) * 1000);
  const two = (n: number) => String(n).padStart(2, "0");
  return `${two(h)}:${two(m)}:${two(s)}.${String(us).padStart(6, "0")}`;
}

/** Names tcpdump would look up without -n: the machine's own addresses resolve to its hostname. */
function namer(d: DeviceState, numeric: number): (ip: Ip) => string {
  if (numeric > 0) return (ip) => ip;
  return (ip) => (d.addrs.some((a) => a.ip === ip && a.scope === "global") ? d.hostname : ip);
}

function port(n: number, numeric: number): string {
  return numeric < 2 && SERVICES[n] ? (SERVICES[n] as string) : String(n);
}

/** The protocol part of a line (after the link header). */
function body(bytes: Uint8Array, p: TcpdumpProc, d: DeviceState): string {
  const e = decodeEth(bytes);
  const name = namer(d, p.numeric);
  if (e.type === ETHERTYPE.arp) {
    const a = decodeArp(e.payload);
    if (!a) return "ARP, truncated";
    if (a.op === 1) return `Request who-has ${name(a.targetIp)} tell ${name(a.senderIp)}, length 28`;
    const oui = p.numeric > 0 ? "" : " (oui Unknown)";
    return `Reply ${name(a.senderIp)} is-at ${a.senderMac}${oui}, length 28`;
  }
  if (e.type === ETHERTYPE.ipv4) {
    const ip = decodeIPv4(e.payload);
    const head = `${name(ip.src)} > ${name(ip.dst)}`;
    if (ip.proto === IPPROTO.icmp) {
      const m = decodeIcmp(ip.payload);
      const len = ip.payload.length;
      if (m.type === ICMP.echoRequest || m.type === ICMP.echoReply) {
        const what = m.type === ICMP.echoRequest ? "request" : "reply";
        return `${head}: ICMP echo ${what}, id ${m.id}, seq ${m.seq}, length ${len}`;
      }
      if (m.type === ICMP.timeExceeded) return `${head}: ICMP time exceeded in-transit, length ${len}`;
      if (m.type === ICMP.redirect) {
        // print-icmp.c: "redirect <dst> to host <gateway>" (net / -tos forms for the other codes).
        const gw = [m.id >> 8, m.id & 0xff, m.seq >> 8, m.seq & 0xff].join(".");
        const what = ["redirect", "redirect", "redirect-tos", "redirect-tos"][m.code] ?? "redirect";
        const to = m.code % 2 === 0 ? "net" : "host";
        return `${head}: ICMP ${what} ${name(decodeIPv4(m.data).dst)} to ${to} ${name(gw)}, length ${len}`;
      }
      if (m.type === ICMP.unreachable) {
        const inner = decodeIPv4(m.data);
        if (m.code === UNREACH.port && inner.proto === IPPROTO.udp) {
          const u = decodeUDP(m.data.subarray(inner.ihl));
          return `${head}: ICMP ${name(inner.dst)} udp port ${port(u.dstPort, p.numeric)} unreachable, length ${len}`;
        }
        const kind = m.code === UNREACH.net ? "net" : "host";
        return `${head}: ICMP ${kind} ${name(inner.dst)} unreachable, length ${len}`;
      }
      return `${head}: ICMP type-#${m.type}, length ${len}`;
    }
    if (ip.proto === IPPROTO.udp) {
      const u = decodeUDP(ip.payload);
      const bootp = [67, 68];
      if (bootp.includes(u.srcPort) && bootp.includes(u.dstPort)) {
        // print-bootp.c without -v: who asks (the client's MAC), or "Reply".
        const m = decodeDhcp(u.data);
        const oui = p.numeric > 0 ? "" : " (oui Unknown)";
        const what = m?.op === 1 ? `Request from ${m.chaddr}${oui}` : "Reply";
        return `${name(ip.src)}.${port(u.srcPort, p.numeric)} > ${name(ip.dst)}.${port(u.dstPort, p.numeric)}: BOOTP/DHCP, ${what}, length ${u.length - 8}`;
      }
      return `${name(ip.src)}.${port(u.srcPort, p.numeric)} > ${name(ip.dst)}.${port(u.dstPort, p.numeric)}: UDP, length ${u.length - 8}`;
    }
    return `${head}: ip-proto-${ip.proto} ${ip.payload.length}`;
  }
  return "";
}

function protoName(type: number): string {
  if (type === ETHERTYPE.arp) return "ARP (0x0806)";
  if (type === ETHERTYPE.ipv4) return "IPv4 (0x0800)";
  return `Unknown (0x${type.toString(16).padStart(4, "0")})`;
}

/** One frame as tcpdump prints it, with its hex dump under -xx. */
export function tcpdumpLines(bytes: Uint8Array, p: TcpdumpProc, d: DeviceState, t: number): string[] {
  const e = decodeEth(bytes);
  const b = body(bytes, p, d);
  let line: string;
  if (isStpFrame(bytes)) {
    // An 802.3 frame (a length where the EtherType would be) carrying a spanning-tree BPDU.
    line = p.ether
      ? `${stamp(t)} ${e.src} > ${e.dst}, ${llcText(bytes)}: ${stpText(bytes)}`
      : `${stamp(t)} ${stpText(bytes)}`;
  } else if (p.ether || (e.type !== ETHERTYPE.arp && e.type !== ETHERTYPE.ipv4)) {
    const dst = e.dst === BROADCAST ? "Broadcast" : e.dst;
    line = `${stamp(t)} ${e.src} > ${dst}, ethertype ${protoName(e.type)}, length ${bytes.length}: ${b}`;
  } else line = `${stamp(t)} ${e.type === ETHERTYPE.arp ? "ARP" : "IP"}, ${b}`.replace(/^(\S+ IP), /, "$1 ");
  const lines = [line];
  if (p.hex) {
    for (let off = 0; off < bytes.length; off += 16) {
      const chunk = Array.from(bytes.subarray(off, off + 16), (x) => x.toString(16).padStart(2, "0"));
      const words: string[] = [];
      for (let i = 0; i < chunk.length; i += 2) words.push(chunk.slice(i, i + 2).join(""));
      lines.push(`\t0x${off.toString(16).padStart(4, "0")}:  ${words.join(" ")}`);
    }
  }
  return lines;
}

// ── The process ────────────────────────────────────────────────────────────────────────────

export type TcpdumpStart = { ok: true; iface: IfaceName } | { ok: false; exitCode: number; errors: string[] };

export function startTcpdump(
  k: Kernel,
  device: DeviceId,
  execId: number,
  opts: {
    iface?: IfaceName;
    filter: Filter;
    count: number | null;
    numeric: number;
    ether: boolean;
    hex: boolean;
    check?: boolean;
  },
): TcpdumpStart {
  const d = deviceOf(k, device);
  if (!d) return { ok: false, exitCode: 1, errors: [] };
  // Without -i, tcpdump listens on the first door that's up (not the loopback).
  const name = opts.iface ?? d.ifaces.find((i) => i.kind !== "loopback" && i.adminUp)?.name ?? d.ifaces[1]?.name;
  const iface = d.ifaces.find((i) => i.name === name);
  if (!iface || !name)
    return { ok: false, exitCode: 1, errors: [`tcpdump: ${name}: No such device exists`, "(No such device exists)"] };
  if (!iface.adminUp) return { ok: false, exitCode: 1, errors: [`tcpdump: ${name}: That device is not up`] };
  // A check only opens the door (pcap does that before compiling the filter).
  if (opts.check) return { ok: true, iface: name };
  d.procs.push({
    kind: "tcpdump",
    execId,
    iface: name,
    filter: opts.filter,
    count: opts.count,
    numeric: opts.numeric,
    ether: opts.ether,
    hex: opts.hex,
    captured: 0,
    done: false,
  });
  return { ok: true, iface: name };
}

/** A frame was seen on a door: any tcpdump listening there may print it. */
export function tcpdumpHears(k: Kernel, device: DeviceId, iface: IfaceName, bytes: Uint8Array): void {
  const d = deviceOf(k, device);
  if (!d) return;
  for (const p of d.procs) {
    if (p.kind !== "tcpdump" || p.done || p.iface !== iface) continue;
    if (!matches(p.filter as Filter, bytes)) continue;
    p.captured += 1;
    for (const text of tcpdumpLines(bytes, p, d, k.s.t))
      k.emit({ kind: "proc.output", t: k.s.t, device, execId: p.execId, text, stream: "stdout" });
    if (p.count !== null && p.captured >= p.count) finishTcpdump(k, device, p, false);
  }
}

function finishTcpdump(k: Kernel, device: DeviceId, p: TcpdumpProc, interrupted: boolean): void {
  p.done = true;
  const err = (text: string) =>
    k.emit({ kind: "proc.output", t: k.s.t, device, execId: p.execId, text, stream: "stderr" });
  // Ctrl+C ends the line the terminal was on.
  if (interrupted) k.emit({ kind: "proc.output", t: k.s.t, device, execId: p.execId, text: "", stream: "stdout" });
  const s = p.captured === 1 ? "" : "s";
  err(`${p.captured} packet${s} captured`);
  err(`${p.captured} packet${s} received by filter`);
  err("0 packets dropped by kernel");
  k.emit({ kind: "proc.exit", t: k.s.t, device, execId: p.execId, exitCode: 0 });
}

export function interruptTcpdump(k: Kernel, device: DeviceId, execId: number): boolean {
  const p = deviceOf(k, device)?.procs.find((x) => x.kind === "tcpdump" && x.execId === execId && !x.done);
  if (!p || p.kind !== "tcpdump") return false;
  finishTcpdump(k, device, p, true);
  return true;
}
