/**
 * `ping` (iputils) as a running process in the simulated machine (SH-03): it sends ICMP echo
 * requests on its own timer, prints each reply or error as it arrives (as `proc.output` in the
 * trace), and prints Linux's statistics when it finishes or is interrupted (Ctrl+C). Round-trip
 * times are network time, so they are realistic and repeatable.
 */
import { isLocal, lookupRoute, sendIp } from "./inet";
import { deviceOf, type Kernel } from "./kernel";
import { encodeIcmp, ICMP, pingPayload, UNREACH } from "./proto/icmp";
import { IPPROTO } from "./proto/ipv4";
import type { DeviceId, Ip, PingProc } from "./types";
import { kernelTimer } from "./wheel";

export const PING_DEFAULTS = { intervalMs: 1000, lingerMs: 10_000, size: 56 } as const;

/** What ping prints first (the command prints it). */
export function pingHeader(target: string, dst: Ip): string {
  return `PING ${target} (${dst}) ${PING_DEFAULTS.size}(${PING_DEFAULTS.size + 28}) bytes of data.`;
}

export type PingStart = { ok: true } | { ok: false; exitCode: number; error: string };

export function startPing(
  k: Kernel,
  device: DeviceId,
  execId: number,
  opts: {
    dst: Ip;
    target: string;
    count: number | null;
    intervalMs?: number;
    waitMs?: number;
    ttl?: number;
    numeric: boolean;
  },
): PingStart {
  const d = deviceOf(k, device);
  if (!d) return { ok: false, exitCode: 2, error: "ping: connect: Network is unreachable" };
  if (!isLocal(d, opts.dst) && !lookupRoute(d, opts.dst)) {
    return { ok: false, exitCode: 2, error: "ping: connect: Network is unreachable" };
  }
  const proc: PingProc = {
    kind: "ping",
    execId,
    dst: opts.dst,
    target: opts.target,
    count: opts.count,
    intervalMs: opts.intervalMs ?? PING_DEFAULTS.intervalMs,
    waitMs: opts.waitMs ?? PING_DEFAULTS.lingerMs,
    ttl: opts.ttl ?? 64,
    // The kernel picks the identifier for ping's socket; seeded here.
    id: Math.floor(k.random() * 0xffff) + 1,
    sent: 0,
    received: 0,
    errors: 0,
    sentAt: {},
    rtts: [],
    pipe: 0,
    started: k.s.t,
    numeric: opts.numeric,
    done: false,
  };
  d.procs.push(proc);
  // The command prints the header itself; the first request leaves on the next tick, so the trace
  // reads command, header, then replies.
  k.schedule({ t: k.s.t, kind: "ping", device, execId, what: "send" });
  return { ok: true };
}

function out(k: Kernel, device: DeviceId, execId: number, text: string, stream: "stdout" | "stderr" = "stdout"): void {
  k.emit({ kind: "proc.output", t: k.s.t, device, execId, text, stream });
}

function sendNext(k: Kernel, device: DeviceId, p: PingProc): void {
  p.sent += 1;
  const seq = p.sent;
  p.sentAt[seq] = k.s.t;
  const msg = encodeIcmp({
    type: ICMP.echoRequest,
    code: 0,
    id: p.id,
    seq,
    data: pingPayload(k.s.t, PING_DEFAULTS.size),
  });
  const r = sendIp(k, device, { dst: p.dst, proto: IPPROTO.icmp, payload: msg, ttl: p.ttl }, "ping");
  if (!r.ok) {
    p.errors += 1;
    out(k, device, p.execId, "ping: sendmsg: Network is unreachable", "stderr");
  }
  if (p.count === null || p.sent < p.count) {
    // ping sleeps until the next send; the wake-up is rounded like a kernel timer (measured: 1.024 s).
    k.schedule({ t: kernelTimer(k.s.t, p.intervalMs), kind: "ping", device, execId: p.execId, what: "send" });
  } else {
    k.schedule({ t: k.s.t + p.waitMs, kind: "ping", device, execId: p.execId, what: "finish" });
  }
}

export function pingTimer(k: Kernel, device: DeviceId, execId: number, what: "send" | "finish" | "read"): void {
  const p = deviceOf(k, device)?.procs.find((x): x is PingProc => x.kind === "ping" && x.execId === execId);
  if (!p || p.done) return;
  if (what === "send") sendNext(k, device, p);
  else if (what === "read") readInbox(k, device, p);
  else finish(k, device, p);
}

/** Ctrl+C: Linux ping prints its statistics and exits. */
export function interruptPing(k: Kernel, device: DeviceId, execId: number): boolean {
  const p = deviceOf(k, device)?.procs.find((x): x is PingProc => x.kind === "ping" && x.execId === execId);
  if (!p || p.done) return false;
  finish(k, device, p);
  return true;
}

function answered(p: PingProc): boolean {
  return p.count !== null && p.sent >= p.count && p.received + p.errors >= p.sent;
}

const ERROR_TEXT: Record<string, string> = {
  [`${ICMP.unreachable}:${UNREACH.net}`]: "Destination Net Unreachable",
  [`${ICMP.unreachable}:${UNREACH.host}`]: "Destination Host Unreachable",
  [`${ICMP.unreachable}:${UNREACH.port}`]: "Destination Port Unreachable",
  [`${ICMP.timeExceeded}:0`]: "Time to live exceeded",
};

export type PingEvent =
  | { kind: "reply"; from: Ip; id: number; seq: number; ttl: number; bytes: number }
  | { kind: "error"; from: Ip; id: number; seq: number; type: number; code: number }
  | { kind: "redirect"; from: Ip; id: number; seq: number; code: number; gw: Ip };

/**
 * How long ping takes to wake and read a redirect waiting on its socket. Linux delivers ICMP errors
 * as a socket error, which ping's next read returns before any queued data: measured, a redirect
 * followed ~0.15 ms later by the "time exceeded" that ends `ping -c 1 -t 2` is never printed
 * (5 runs of 5). Replies queued behind a redirect wait with it, so the order stays the arrival order.
 */
const READ_WAKE_MS = 1;

const REDIRECT_TEXT = [
  "Redirect Network",
  "Redirect Host",
  "Redirect Type of Service and Network",
  "Redirect Type of Service and Host",
];

/** An echo reply, an ICMP error or a redirect about one of our echoes reached this machine. */
export function pingHears(k: Kernel, device: DeviceId, e: PingEvent): void {
  const p = deviceOf(k, device)?.procs.find((x): x is PingProc => x.kind === "ping" && !x.done && x.id === e.id);
  if (!p) return;
  const sentAt = p.sentAt[e.seq];
  if (sentAt === undefined) return;
  if (e.kind === "redirect" || (e.kind === "reply" && p.inbox?.length)) {
    p.inbox ??= [];
    const inbox = p.inbox;
    if (inbox.length === 0)
      k.schedule({ t: k.s.t + READ_WAKE_MS, kind: "ping", device, execId: p.execId, what: "read" });
    inbox.push(
      e.kind === "redirect"
        ? { kind: "redirect", from: e.from, seq: e.seq, ttl: 0, bytes: 0, at: k.s.t, gw: e.gw, code: e.code }
        : { kind: "reply", from: e.from, seq: e.seq, ttl: e.ttl, bytes: e.bytes, at: k.s.t, gw: "", code: 0 },
    );
    return;
  }
  hear(k, device, p, e, k.s.t);
}

function readInbox(k: Kernel, device: DeviceId, p: PingProc): void {
  const inbox = p.inbox ?? [];
  p.inbox = [];
  for (const m of inbox) {
    if (p.done) return;
    if (m.kind === "redirect")
      out(
        k,
        device,
        p.execId,
        `From ${m.from}: icmp_seq=${m.seq} ${REDIRECT_TEXT[m.code] ?? "Redirect"}(New nexthop: ${m.gw})`,
      );
    else hear(k, device, p, { kind: "reply", from: m.from, id: p.id, seq: m.seq, ttl: m.ttl, bytes: m.bytes }, m.at);
  }
}

function hear(k: Kernel, device: DeviceId, p: PingProc, e: Exclude<PingEvent, { kind: "redirect" }>, at: number): void {
  const sentAt = p.sentAt[e.seq] ?? at;
  // iputils' "pipe": how many were sent by the time this answer (or error) came back, from its seq on.
  p.pipe = Math.max(p.pipe, p.sent - e.seq + 1);
  if (e.kind === "reply") {
    const rtt = at - sentAt;
    p.received += 1;
    p.rtts.push(rtt);
    out(
      k,
      device,
      p.execId,
      `${e.bytes} bytes from ${e.from}: icmp_seq=${e.seq} ttl=${e.ttl} time=${formatMs(rtt)} ms`,
    );
  } else {
    p.errors += 1;
    out(
      k,
      device,
      p.execId,
      `From ${e.from} icmp_seq=${e.seq} ${ERROR_TEXT[`${e.type}:${e.code}`] ?? "Destination Unreachable"}`,
    );
  }
  if (answered(p)) finish(k, device, p);
}

/** iputils prints times with three significant decimals below 100 ms. */
function formatMs(ms: number): string {
  if (ms >= 100) return ms.toFixed(0);
  if (ms >= 10) return ms.toFixed(1);
  return ms.toFixed(3);
}

function finish(k: Kernel, device: DeviceId, p: PingProc): void {
  p.done = true;
  const lastSent = p.sentAt[p.sent] ?? p.started;
  const loss = p.sent === 0 ? 0 : Math.round(((p.sent - p.received) / p.sent) * 100);
  const errors = p.errors > 0 ? `, +${p.errors} errors` : "";
  out(k, device, p.execId, "");
  out(k, device, p.execId, `--- ${p.target} ping statistics ---`);
  out(
    k,
    device,
    p.execId,
    `${p.sent} packets transmitted, ${p.received} received${errors}, ${loss}% packet loss, time ${Math.floor(lastSent - p.started)}ms`,
  );
  // "pipe N": the most requests that were waiting for an answer at once, when more than one.
  const pipe = p.pipe > 1 ? `pipe ${p.pipe}` : "";
  if (p.rtts.length > 0) {
    const min = Math.min(...p.rtts);
    const max = Math.max(...p.rtts);
    const avg = p.rtts.reduce((a, b) => a + b, 0) / p.rtts.length;
    const mdev = Math.sqrt(p.rtts.reduce((a, b) => a + (b - avg) ** 2, 0) / p.rtts.length);
    out(
      k,
      device,
      p.execId,
      `rtt min/avg/max/mdev = ${[min, avg, max, mdev].map((x) => x.toFixed(3)).join("/")} ms${pipe ? `, ${pipe}` : ""}`,
    );
  } else {
    // Without an rtt line iputils ends with the pipe line, or an empty one (checked against real ping).
    out(k, device, p.execId, pipe);
  }
  // iputils: 0 if anything came back, 1 if nothing did.
  const exitCode = p.received > 0 ? 0 : 1;
  k.emit({ kind: "proc.exit", t: k.s.t, device, execId: p.execId, exitCode });
}
