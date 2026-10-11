/**
 * The discrete-event network simulator (SIM-01..05). Pure TypeScript, deterministic:
 * same topology + faults + seed + inputs ⇒ same trace. Linux is the reference for behavior.
 */

import type { WorldView } from "./backend";
import { BROADCAST, type Mac, parseMac } from "./mac";
import { nextFloat, seedPrng } from "./prng";
import { decodeEth, ETHERTYPE, encodeEth, fromHex, summarizeEth, toHex } from "./proto/ethernet";
import { encodeIPv4, encodeUDP, IPPROTO } from "./proto/ipv4";
import { decodeLab, encodeLab } from "./proto/lab";
import type {
  DeviceId,
  DeviceState,
  EndRef,
  Fault,
  FrameOrigin,
  IfaceName,
  IfaceState,
  LinkState,
  Scheduled,
  SimEvent,
  Topology,
  Unsubscribe,
  WorldState,
} from "./types";

type Unscheduled = Scheduled extends infer S ? (S extends Scheduled ? Omit<S, "seq"> : never) : never;

const DEFAULT_DELAY_MS = 0.05;
const DEFAULT_BW = 1_000_000_000;
const DEFAULT_QUEUE = 64;
/** A host takes a moment to answer, with a little seeded jitter (SIM-19 spirit). */
const LAB_REPLY_MS = 0.02;

export interface OperState {
  adminUp: boolean;
  carrier: boolean;
  /** Both ends up and the cable plugged in. */
  up: boolean;
}

export type SendResult =
  | { ok: true; frameId: number; length: number }
  | { ok: false; error: "no-device" | "no-iface" | "bad-mac" };

export class Simulator implements WorldView {
  private s: WorldState;
  private readonly listeners = new Set<(e: SimEvent) => void>();
  /** Every event since load, in order. Not part of snapshots: it is history, not state. */
  readonly trace: SimEvent[] = [];
  /** The world before faults, kept to compute "what was fixed" (SIM-40). */
  readonly correct: WorldState;
  /** The world after faults: what Reset restores. */
  readonly initial: WorldState;

  constructor(topology: Topology, faults: Fault[] = [], seed = 1) {
    this.s = build(topology, seed);
    this.correct = clone(this.s);
    for (const f of faults) applyFault(this.s, f);
    this.initial = clone(this.s);
  }

  // ── Time ──────────────────────────────────────────────────────────────────────────────

  get now(): number {
    return this.s.t;
  }

  nextEventTime(): number | null {
    return this.s.queue[0]?.t ?? null;
  }

  /** Frames currently travelling through cables. */
  inFlight(): number {
    let n = 0;
    for (const l of Object.values(this.s.links)) n += l.inFlight[0] + l.inFlight[1];
    return n;
  }

  /** Process every event up to `to` (network ms), then move the clock there (SIM-34). */
  advance(to: number, maxEvents = 5000): void {
    let n = 0;
    while (n < maxEvents) {
      const next = this.s.queue[0];
      if (!next || next.t > to) break;
      this.s.queue.shift();
      this.s.t = next.t;
      this.run(next);
      n++;
    }
    // SIM-31: if the budget ran out, stop at the last processed event; the rest waits for the next call.
    if (n < maxEvents) this.s.t = Math.max(this.s.t, to);
  }

  // ── Trace ─────────────────────────────────────────────────────────────────────────────

  subscribe(fn: (e: SimEvent) => void): Unsubscribe {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Append an event. Public so the shell can record commands and their output (SIM-35). */
  emit(e: SimEvent): void {
    this.trace.push(e);
    for (const fn of this.listeners) fn(e);
  }

  // ── Snapshots (SIM-39) ────────────────────────────────────────────────────────────────

  snapshot(): WorldState {
    return clone(this.s);
  }

  restore(snap: WorldState): void {
    this.s = clone(snap);
  }

  /** Reset room: back to the starting (faulted) network at the current time (FR-HINT-03). */
  reset(): void {
    const t = this.s.t;
    this.s = clone(this.initial);
    // The starting world's clock began at 0; move its timers and cables to now.
    this.s.t = t;
    for (const q of this.s.queue) q.t += t;
    for (const l of Object.values(this.s.links)) l.busyUntil = [l.busyUntil[0] + t, l.busyUntil[1] + t];
    this.emit({ kind: "world.reset", t });
  }

  // ── Read-only views ───────────────────────────────────────────────────────────────────

  devices(): readonly Readonly<DeviceState>[] {
    return Object.values(this.s.devices);
  }

  device(id: DeviceId): Readonly<DeviceState> | undefined {
    return this.s.devices[id];
  }

  links(): readonly Readonly<LinkState>[] {
    return Object.values(this.s.links);
  }

  iface(device: DeviceId, name: IfaceName): Readonly<IfaceState> | undefined {
    return this.s.devices[device]?.ifaces.find((i) => i.name === name);
  }

  /** The far end of the cable plugged into this door, if any. */
  peer(device: DeviceId, name: IfaceName): EndRef | null {
    const i = this.iface(device, name);
    const l = i?.link ? this.s.links[i.link] : undefined;
    if (!l) return null;
    return l.a.device === device && l.a.iface === name ? l.b : l.a;
  }

  oper(device: DeviceId, name: IfaceName): OperState {
    const i = this.iface(device, name);
    if (!i) return { adminUp: false, carrier: false, up: false };
    const l = i.link ? this.s.links[i.link] : undefined;
    const p = this.peer(device, name);
    const peerUp = p ? (this.iface(p.device, p.iface)?.adminUp ?? false) : false;
    // A NIC only senses carrier while it is itself up (Linux reports no flags otherwise).
    const carrier = i.adminUp && !!l?.plugged && peerUp;
    return { adminUp: i.adminUp, carrier, up: carrier };
  }

  // ── Actions (called by the shell; every change lands in the trace) ────────────────────

  setAdmin(device: DeviceId, name: IfaceName, up: boolean): boolean {
    const i = this.s.devices[device]?.ifaces.find((x) => x.name === name);
    if (!i) return false;
    if (i.adminUp === up) return true;
    const before = i.adminUp;
    i.adminUp = up;
    if (up) i.everUp = true;
    this.emit({ kind: "table.change", t: this.s.t, device, table: "link", op: "set", key: name, before, after: up });
    return true;
  }

  setPlugged(linkId: string, plugged: boolean): boolean {
    const l = this.s.links[linkId];
    if (!l) return false;
    if (l.plugged === plugged) return true;
    l.plugged = plugged;
    for (const end of [l.a, l.b]) {
      this.emit({
        kind: "table.change",
        t: this.s.t,
        device: end.device,
        table: "link",
        op: "set",
        key: `${end.iface}:cable`,
        before: !plugged,
        after: plugged,
      });
    }
    return true;
  }

  /** `lab send-frame` (SIM-09). */
  sendLabFrame(device: DeviceId, opts: { to: string; from?: string; dev?: IfaceName; msg: string }): SendResult {
    const d = this.s.devices[device];
    if (!d) return { ok: false, error: "no-device" };
    const iface = opts.dev ? d.ifaces.find((i) => i.name === opts.dev) : d.ifaces[0];
    if (!iface) return { ok: false, error: "no-iface" };
    const to = parseMac(opts.to);
    const from = opts.from === undefined ? iface.mac : parseMac(opts.from);
    if (!to || !from) return { ok: false, error: "bad-mac" };
    const bytes = encodeEth({ dst: to, src: from, type: ETHERTYPE.lab, payload: encodeLab(opts.msg) });
    const frameId = this.transmit(device, iface.name, bytes, "command");
    return { ok: true, frameId, length: bytes.length };
  }

  /** `lab card set --to`: change the address on the messenger's card. */
  setCard(device: DeviceId, to: string): boolean {
    const m = this.s.devices[device]?.messenger;
    const mac = parseMac(to);
    if (!m || !mac) return false;
    if (m.to === mac) return true;
    const before = m.to;
    m.to = mac;
    this.emit({
      kind: "table.change",
      t: this.s.t,
      device,
      table: "lab",
      op: "set",
      key: "card.to",
      before,
      after: mac,
    });
    return true;
  }

  private messengerTick(device: DeviceId): void {
    const d = this.s.devices[device];
    const m = d?.messenger;
    if (!d || !m) return;
    this.schedule({ t: this.s.t + m.intervalMs, kind: "timer", device, service: "messenger" });
    const iface = d.ifaces.find((i) => i.name === m.dev);
    // Like any program on a door that's switched off, the messenger's send fails (ENETDOWN): nothing leaves.
    if (!iface?.adminUp) return;
    const bytes = encodeEth({ dst: m.to, src: iface.mac, type: ETHERTYPE.lab, payload: encodeLab(m.msg) });
    this.transmit(device, iface.name, bytes, "messenger");
  }

  private announcerTick(device: DeviceId): void {
    const d = this.s.devices[device];
    const a = d?.announcer;
    if (!d || !a) return;
    this.schedule({ t: this.s.t + a.intervalMs, kind: "timer", device, service: "announcer" });
    const iface = d.ifaces.find((i) => i.name === a.dev);
    if (!iface?.adminUp) return;
    const udp = encodeUDP(a.ip, "255.255.255.255", a.port, a.port, encodeLab(a.text));
    const ip = encodeIPv4({
      src: a.ip,
      dst: "255.255.255.255",
      proto: IPPROTO.udp,
      ttl: 64,
      id: a.nextId,
      df: false,
      payload: udp,
    });
    a.nextId = (a.nextId + 1) & 0xffff;
    const bytes = encodeEth({ dst: BROADCAST, src: iface.mac, type: ETHERTYPE.ipv4, payload: ip });
    this.transmit(device, iface.name, bytes, "announcer");
  }

  // ── Internals ─────────────────────────────────────────────────────────────────────────

  private schedule(item: Unscheduled): void {
    const full = { ...item, seq: this.s.seq++ } as Scheduled;
    const q = this.s.queue;
    let i = q.length;
    while (i > 0) {
      const prev = q[i - 1];
      if (!prev || prev.t < full.t || (prev.t === full.t && prev.seq < full.seq)) break;
      i--;
    }
    q.splice(i, 0, full);
  }

  private transmit(device: DeviceId, name: IfaceName, bytes: Uint8Array, origin: FrameOrigin): number {
    const frameId = this.s.nextFrameId++;
    const t = this.s.t;
    const summary = summarizeEth(bytes);
    if (!this.oper(device, name).up) {
      // Linux won't put a frame on a link that is down; the sender's door is where it dies.
      this.emit({ kind: "frame.drop", t, device, iface: name, frameId, reason: "link-down" });
      return frameId;
    }
    this.emit({ kind: "frame.tx", t, device, iface: name, frameId, bytes, summary, origin });
    const i = this.iface(device, name);
    const l = i?.link ? this.s.links[i.link] : undefined;
    if (!l) return frameId;
    const dir: 0 | 1 = l.a.device === device && l.a.iface === name ? 0 : 1;
    if (l.inFlight[dir] >= l.queueLimit) {
      this.emit({ kind: "frame.drop", t, device, iface: name, frameId, reason: "queue-full" });
      return frameId;
    }
    const start = Math.max(t, l.busyUntil[dir]);
    const txMs = ((bytes.length * 8) / l.bandwidthBps) * 1000;
    l.busyUntil[dir] = start + txMs;
    l.inFlight[dir] += 1;
    const arriveAt = start + txMs + l.delayMs;
    const from = dir === 0 ? l.a : l.b;
    const to = dir === 0 ? l.b : l.a;
    this.emit({ kind: "link.enter", t, link: l.id, dir, frameId, from, to, arriveAt, bytes, summary });
    this.schedule({ t: arriveAt, kind: "arrive", link: l.id, dir, frameId, hex: toHex(bytes) });
    return frameId;
  }

  private run(ev: Scheduled): void {
    if (ev.kind === "arrive") {
      this.arrive(ev);
      return;
    }
    if (ev.kind === "lab-reply") {
      const d = this.s.devices[ev.device];
      const iface = d?.ifaces.find((i) => i.name === ev.iface);
      if (!d || !iface) return;
      const bytes = encodeEth({ dst: ev.to, src: iface.mac, type: ETHERTYPE.lab, payload: encodeLab(ev.text) });
      this.transmit(d.id, iface.name, bytes, "responder");
      return;
    }
    if (ev.kind === "timer") {
      if (ev.service === "messenger") this.messengerTick(ev.device);
      else this.announcerTick(ev.device);
    }
  }

  private arrive(ev: Extract<Scheduled, { kind: "arrive" }>): void {
    const l = this.s.links[ev.link];
    if (!l) return;
    l.inFlight[ev.dir] = Math.max(0, l.inFlight[ev.dir] - 1);
    const t = this.s.t;
    this.emit({ kind: "link.exit", t, link: l.id, dir: ev.dir, frameId: ev.frameId });
    const to = ev.dir === 0 ? l.b : l.a;
    if (!this.oper(to.device, to.iface).up) {
      this.emit({
        kind: "frame.drop",
        t,
        device: to.device,
        iface: to.iface,
        frameId: ev.frameId,
        reason: "link-down",
      });
      return;
    }
    const bytes = fromHex(ev.hex);
    this.emit({
      kind: "frame.rx",
      t,
      device: to.device,
      iface: to.iface,
      frameId: ev.frameId,
      bytes,
      summary: summarizeEth(bytes),
    });
    this.receive(to.device, to.iface, ev.frameId, bytes);
  }

  /** A host NIC accepts frames for its own address or broadcast; everything else is ignored (SIM-11). */
  private receive(device: DeviceId, name: IfaceName, frameId: number, bytes: Uint8Array): void {
    const d = this.s.devices[device];
    const iface = d?.ifaces.find((i) => i.name === name);
    if (!d || !iface) return;
    const t = this.s.t;
    const f = decodeEth(bytes);
    const forMe = f.dst === iface.mac || f.dst === BROADCAST;
    this.emit({
      kind: "fwd.decision",
      t,
      device,
      frameId,
      layer: "l2",
      decision: forMe ? "deliver" : "drop",
      egress: [],
      tableRef: { dst: f.dst, own: iface.mac },
    });
    if (!forMe) {
      this.emit({ kind: "frame.drop", t, device, iface: name, frameId, reason: "not-for-me" });
      return;
    }
    if (f.type !== ETHERTYPE.lab) {
      this.emit({ kind: "frame.drop", t, device, iface: name, frameId, reason: "no-listener" });
      return;
    }
    const text = decodeLab(f.payload);
    this.emit({ kind: "app.deliver", t, device, iface: name, proto: "lab", frameId, from: f.src, to: f.dst, text });
    this.labRespond(d, iface, f.src, f.dst === BROADCAST);
  }

  private labRespond(d: DeviceState, iface: IfaceState, sender: Mac, wasBroadcast: boolean): void {
    const lab = d.lab;
    if (lab?.mode !== "responder") return;
    let text: string;
    if (wasBroadcast) {
      if (!lab.answersBroadcast) return;
      text = `I'm here — ${d.hostname}`;
    } else {
      text = lab.reply ?? `hello from ${d.hostname}`;
    }
    const jitter = nextFloat(this.s.prng) * LAB_REPLY_MS;
    this.schedule({
      t: this.s.t + LAB_REPLY_MS + jitter,
      kind: "lab-reply",
      device: d.id,
      iface: iface.name,
      to: sender,
      text,
    });
  }
}

function build(topology: Topology, seed: number): WorldState {
  const devices: Record<DeviceId, DeviceState> = {};
  for (const spec of topology.devices) {
    devices[spec.id] = {
      id: spec.id,
      hostname: spec.hostname,
      kind: spec.kind,
      // ifindex 1 is the loopback device every Linux machine has; doors start at 2.
      ifaces: spec.interfaces.map((i, n) => ({
        name: i.name,
        ifindex: n + 2,
        mac: i.mac,
        mtu: 1500,
        adminUp: i.adminUp ?? true,
        everUp: i.adminUp ?? true,
        link: null,
      })),
      lab: spec.lab ? { ...spec.lab } : null,
      messenger: spec.messenger
        ? {
            to: spec.messenger.to,
            msg: spec.messenger.msg ?? "hello",
            intervalMs: spec.messenger.intervalMs ?? 4000,
            dev: spec.messenger.dev ?? spec.interfaces[0]?.name ?? "eth0",
          }
        : null,
      announcer: spec.announcer
        ? { ...spec.announcer, dev: spec.announcer.dev ?? spec.interfaces[0]?.name ?? "eth0", nextId: 0 }
        : null,
    };
  }
  const links: Record<string, LinkState> = {};
  for (const spec of topology.links) {
    for (const end of [spec.a, spec.b]) {
      const iface = devices[end.device]?.ifaces.find((i) => i.name === end.iface);
      if (!iface) throw new Error(`link ${spec.id}: no interface ${end.device}/${end.iface}`);
      if (iface.link)
        throw new Error(`link ${spec.id}: ${end.device}/${end.iface} already has a cable (cables never branch)`);
      iface.link = spec.id;
    }
    links[spec.id] = {
      id: spec.id,
      a: spec.a,
      b: spec.b,
      plugged: spec.plugged ?? true,
      delayMs: spec.delayMs ?? DEFAULT_DELAY_MS,
      bandwidthBps: spec.bandwidthBps ?? DEFAULT_BW,
      queueLimit: spec.queueLimit ?? DEFAULT_QUEUE,
      busyUntil: [0, 0],
      inFlight: [0, 0],
    };
  }
  const prng = seedPrng(seed);
  const queue: Scheduled[] = [];
  let seq = 0;
  for (const d of Object.values(devices)) {
    // First messages come early so the player sees the service working; then at its interval.
    if (d.messenger)
      queue.push({
        t: Math.min(1500, d.messenger.intervalMs),
        seq: seq++,
        kind: "timer",
        device: d.id,
        service: "messenger",
      });
    if (d.announcer) {
      d.announcer.nextId = Math.floor(nextFloat(prng) * 0xffff);
      queue.push({ t: d.announcer.intervalMs * 0.6, seq: seq++, kind: "timer", device: d.id, service: "announcer" });
    }
  }
  queue.sort((a, b) => a.t - b.t || a.seq - b.seq);
  return { t: 0, seq, nextFrameId: 1, prng, devices, links, queue };
}

function applyFault(s: WorldState, f: Fault): void {
  switch (f.kind) {
    case "iface-down": {
      const i = s.devices[f.device]?.ifaces.find((x) => x.name === f.iface);
      if (!i) throw new Error(`fault: no interface ${f.device}/${f.iface}`);
      i.adminUp = false;
      // A machine whose door was never opened shows the `noop` qdisc.
      i.everUp = false;
      return;
    }
    case "unplug": {
      const l = s.links[f.link];
      if (!l) throw new Error(`fault: no link ${f.link}`);
      l.plugged = false;
      return;
    }
    case "lab": {
      const d = s.devices[f.device];
      if (!d) throw new Error(`fault: no device ${f.device}`);
      d.lab = { ...f.lab };
      return;
    }
    case "card": {
      const m = s.devices[f.device]?.messenger;
      if (!m) throw new Error(`fault: ${f.device} has no messenger`);
      m.to = f.to;
      return;
    }
  }
}

/** World state is plain JSON by design, so a JSON round-trip is a faithful deep copy. */
function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}
