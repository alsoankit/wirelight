/**
 * The discrete-event network simulator (SIM-01..05). Pure TypeScript, deterministic:
 * same topology + faults + seed + inputs ⇒ same trace. Linux is the reference for behaviour.
 *
 * This file is the core: time, the event queue, cables, the trace, snapshots and Reset, and the
 * actions commands call. The packet path lives in its layers, in Linux's order: a door's MAC check
 * (here), bridges (bridge.ts), ARP and neighbours (neigh.ts), IPv4 and ICMP (inet.ts), ping (ping.ts),
 * and the game's lab protocol (here).
 */

import type { WorldView } from "./backend";
import {
  bridgeInput,
  bridgeXmit,
  DEFAULT_AGEING_MS,
  type FdbResult,
  fdbAdd,
  fdbDel,
  fdbGc,
  fdbGcArm,
  fdbPortDown,
  isGroup,
} from "./bridge";
import {
  configureDhcpServer,
  type DhclientStart,
  dhcpSend,
  dhcpTap,
  dhcpTimer,
  initDhcpServer,
  interruptDhclient,
  startDhclient,
} from "./dhcp";
import {
  type AddrResult,
  addrAdd,
  addrDel,
  addrFlush,
  inetInput,
  onCarrierDown,
  onIfaceDown,
  onIfaceUp,
  queuedFailed,
  type RouteGet,
  type RouteResult,
  routeAdd,
  routeCache,
  routeDel,
  routeFlushCache,
  routeGet,
  SYSCTL_DEFAULTS,
  sendIp,
} from "./inet";
import { type KeeperResult, keeperAsk, keeperForward, keeperLearn, keeperSend, keeperWrap, wakeKeeper } from "./keeper";
import type { Kernel, Unscheduled } from "./kernel";
import { BROADCAST, type Mac, parseMac } from "./mac";
import { NEIGH_DEFAULTS, neighAddPermanent, neighDelete, neighFlush, neighTimer } from "./neigh";
import { interruptPing, type PingStart, pingHears, pingTimer, startPing } from "./ping";
import { nextFloat, seedPrng } from "./prng";
import { decodeEth, ETHERTYPE, encodeEth, fromHex, summarizeEth, toHex } from "./proto/ethernet";
import { encodeIcmp, ICMP, pingPayload } from "./proto/icmp";
import { encodeIPv4, encodeUDP, IPPROTO, parseIp } from "./proto/ipv4";
import { decodeLab, encodeLab } from "./proto/lab";
import { heapPop, heapPush } from "./queue";
import {
  type ScannerCatch,
  type ScannerCompare,
  type ScannerLayerName,
  type ScannerOpen,
  scannerCatches,
  scannerCatchNext,
  scannerCompare,
  scannerKeep,
  scannerOpen,
  scannerSees,
  scannerTraceNext,
} from "./scanner";
import {
  newBridgeStp,
  type StpTimes,
  stpBridgeDown,
  stpBridgeUp,
  stpSetBridgePriority,
  stpSetEnabled,
  stpSetPortCost,
  stpSetPortPriority,
  stpSetTimes,
  stpSyncPorts,
  stpTimer,
} from "./stp";
import { type SysctlWrite, sysctlList, sysctlRead, sysctlWrite } from "./sysctl";
import { interruptTcpdump, startTcpdump, type TcpdumpStart, tcpdumpHears } from "./tcpdump";
import type {
  DeviceId,
  DeviceState,
  EndRef,
  Fault,
  FrameOrigin,
  IfaceName,
  IfaceState,
  Ip,
  LinkState,
  Scheduled,
  SimEvent,
  Topology,
  Unsubscribe,
  WorldState,
} from "./types";
import { kernelTimer } from "./wheel";

const DEFAULT_DELAY_MS = 0.05;
const DEFAULT_BW = 1_000_000_000;
const DEFAULT_QUEUE = 64;
/** A host takes a moment to answer, with a little seeded jitter (SIM-19 spirit). */
const LAB_REPLY_MS = 0.02;

export interface OperState {
  adminUp: boolean;
  carrier: boolean;
  /** Both ends up and the cable plugged in (for a bridge: up, with at least one live port). */
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
  /** The layers' view of this simulator. */
  private readonly k: Kernel;

  constructor(topology: Topology, faults: Fault[] = [], seed = 1) {
    this.s = build(topology, seed);
    this.k = this.kernel();
    // Bridges come up as `ip link set br0 up` brings them: ports with carrier are enabled, and with
    // STP on they start listening (no trace before the room starts).
    this.muted = true;
    for (const d of Object.values(this.s.devices))
      for (const br of Object.values(d.bridges)) if (this.iface(d.id, br.name)?.adminUp) stpBridgeUp(this.k, d.id, br);
    this.correct = clone(this.s);
    // Faults go through the same actions as commands, but quietly (no trace before the room starts).
    for (const f of faults) this.applyFault(f);
    this.muted = false;
    this.initial = clone(this.s);
  }

  private muted = false;

  private kernel(): Kernel {
    const sim = this;
    return {
      get s() {
        return sim.s;
      },
      emit: (e) => this.emit(e),
      schedule: (item) => this.schedule(item),
      random: () => nextFloat(this.s.prng),
      oper: (device, iface) => this.oper(device, iface),
      wire: (device, iface, bytes, origin, parent) => this.wire(device, iface, bytes, origin, parent),
      send: (device, iface, bytes, origin, parent) => this.sendFrame(device, iface, bytes, origin, parent),
      hostReceive: (device, iface, frameId, bytes) => this.hostReceive(device, iface, frameId, bytes, true),
    };
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
      heapPop(this.s.queue);
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
    if (this.muted) return;
    this.trace.push(e);
    for (const fn of this.listeners) fn(e);
    if (e.kind === "frame.tx" || e.kind === "frame.rx") scannerSees(this.k, e);
  }

  // ── The Scanner (0043) ────────────────────────────────────────────────────────────────

  scannerCatchNext(device: DeviceId, from?: string): void {
    scannerCatchNext(this.k, device, from);
  }
  /**
   * Catching by hand (CORE-18): a copy of a message in flight goes into the jar (the Scanner's catches,
   * 0043); the message itself goes on. Returns the catch's number, or null if there's no such frame.
   */
  catchFrame(frameId: number): number | null {
    for (let i = this.trace.length - 1; i >= 0; i--) {
      const e = this.trace[i];
      if (e?.kind === "frame.tx" && e.frameId === frameId) {
        scannerKeep(this.k, e, false);
        return this.scannerCatches().length;
      }
    }
    return null;
  }

  scannerTraceNext(device: DeviceId): void {
    scannerTraceNext(this.k, device);
  }
  scannerCatches(): readonly ScannerCatch[] {
    return scannerCatches(this.k);
  }
  scannerOpen(device: DeviceId, n: number, layer: ScannerLayerName): ScannerOpen {
    return scannerOpen(this.k, device, n, layer);
  }
  scannerCompare(a: number, b: number): ScannerCompare | null {
    return scannerCompare(this.k, a, b);
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
    // The starting world's clock began at 0; move its timers, cables and table times to now. A
    // uniform shift keeps the queue a valid heap.
    this.s.t = t;
    for (const q of this.s.queue) q.t += t;
    for (const l of Object.values(this.s.links)) l.busyUntil = [l.busyUntil[0] + t, l.busyUntil[1] + t];
    for (const d of Object.values(this.s.devices)) {
      for (const br of Object.values(d.bridges)) {
        for (const e of br.fdb) e.updated += t;
        if (br.gc) br.gc.at += t;
        for (const tm of Object.values(br.stp.timers)) tm.at += t;
        for (const p of br.stp.ports) p.designatedAge += t;
      }
      for (const n of d.neigh) {
        n.updated += t;
        n.confirmed += t;
      }
      for (const b of Object.values(d.icmpTokens)) b.at += t;
      for (const e of d.exceptions ?? []) e.expires += t;
    }
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
    if (i.kind === "loopback") return { adminUp: i.adminUp, carrier: i.adminUp, up: i.adminUp };
    if (i.kind === "bridge") {
      // A bridge has carrier while at least one of its ports forwards (br_port_state_selection):
      // with STP off, any port that's up; with STP on, not until a port has listened and learned.
      const br = this.s.devices[device]?.bridges[name];
      const carrier = i.adminUp && !!br?.stp.ports.some((p) => p.state === "forwarding");
      return { adminUp: i.adminUp, carrier, up: carrier };
    }
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
    const carriers = this.carrierSnapshot();
    i.adminUp = up;
    if (up) i.everUp = true;
    this.emit({ kind: "table.change", t: this.s.t, device, table: "link", op: "set", key: name, before, after: up });
    const br = i.kind === "bridge" ? this.s.devices[device]?.bridges[name] : undefined;
    if (br) {
      if (up) stpBridgeUp(this.k, device, br);
      else stpBridgeDown(this.k, device, br);
    }
    if (up) onIfaceUp(this.k, device, name);
    else {
      onIfaceDown(this.k, device, name);
      fdbPortDown(this.k, device, name);
    }
    this.syncBridgePorts();
    this.carrierChanges(carriers, { device, iface: name });
    return true;
  }

  /** Plugs or pulls a cable: at one end (`end`, the machine whose door it is) or at both. */
  setPlugged(linkId: string, plugged: boolean, end?: DeviceId): boolean {
    const l = this.s.links[linkId];
    if (!l) return false;
    const sides: ("a" | "b")[] =
      end === undefined ? ["a", "b"] : end === l.a.device ? ["a"] : end === l.b.device ? ["b"] : [];
    if (sides.length === 0) return false;
    const carriers = this.carrierSnapshot();
    for (const side of sides) {
      const isOut = l.out.includes(side);
      if (isOut !== plugged) continue; // already as asked
      l.out = plugged ? l.out.filter((x) => x !== side) : [...l.out, side];
      const ref = side === "a" ? l.a : l.b;
      this.emit({
        kind: "table.change",
        t: this.s.t,
        device: ref.device,
        table: "link",
        op: "set",
        key: `${ref.iface}:cable`,
        before: !plugged,
        after: plugged,
      });
    }
    l.plugged = l.out.length === 0;
    this.syncBridgePorts();
    this.carrierChanges(carriers);
    return true;
  }

  /** Every bridge port's spanning-tree state follows its carrier (br_port_carrier_check). */
  private syncBridgePorts(): void {
    for (const d of Object.values(this.s.devices))
      for (const br of Object.values(d.bridges)) stpSyncPorts(this.k, d.id, br);
  }

  /** Every door's carrier now, to see which ones a change took down. */
  private carrierSnapshot(): Map<string, boolean> {
    const m = new Map<string, boolean>();
    for (const d of Object.values(this.s.devices))
      for (const i of d.ifaces) m.set(`${d.id}\u0000${i.name}`, this.oper(d.id, i.name).carrier);
    return m;
  }

  /** Doors that lost carrier forget their neighbours (Linux neigh_carrier_down). */
  private carrierChanges(before: Map<string, boolean>, skip?: EndRef): void {
    for (const d of Object.values(this.s.devices))
      for (const i of d.ifaces) {
        if (skip && skip.device === d.id && skip.iface === i.name) continue;
        if (before.get(`${d.id}\u0000${i.name}`) && !this.oper(d.id, i.name).carrier) {
          onCarrierDown(this.k, d.id, i.name);
          fdbPortDown(this.k, d.id, i.name);
        }
      }
  }

  /** `lab send-frame` (SIM-09). */
  sendLabFrame(device: DeviceId, opts: { to: string; from?: string; dev?: IfaceName; msg: string }): SendResult {
    const d = this.s.devices[device];
    if (!d) return { ok: false, error: "no-device" };
    const iface = opts.dev ? d.ifaces.find((i) => i.name === opts.dev) : firstDoor(d);
    if (!iface) return { ok: false, error: "no-iface" };
    const to = parseMac(opts.to);
    const from = opts.from === undefined ? iface.mac : parseMac(opts.from);
    if (!to || !from) return { ok: false, error: "bad-mac" };
    const bytes = encodeEth({ dst: to, src: from, type: ETHERTYPE.lab, payload: encodeLab(opts.msg) });
    const frameId = this.s.nextFrameId;
    this.sendFrame(device, iface.name, bytes, "command");
    return { ok: true, frameId, length: bytes.length };
  }

  /** `lab card --to`: change the address on a messenger's card (number `index`, from 1): a door name or a house address. */
  setCard(device: DeviceId, to: string, index = 1): boolean {
    const m = this.s.devices[device]?.messengers[index - 1];
    const card = cardAddress(to);
    if (!m || card === null) return false;
    if (m.to === card) return true;
    const before = m.to;
    m.to = card;
    this.emit({
      kind: "table.change",
      t: this.s.t,
      device,
      table: "lab",
      op: "set",
      key: index === 1 ? "card.to" : `card.${index}.to`,
      before,
      after: card,
    });
    return true;
  }

  addrAdd(device: DeviceId, cidr: string, dev: IfaceName): AddrResult {
    return addrAdd(this.k, device, cidr, dev);
  }

  addrDel(device: DeviceId, cidr: string, dev: IfaceName): AddrResult {
    return addrDel(this.k, device, cidr, dev);
  }

  /** A bridge's ageing time (`ip link set br0 type bridge ageing_time <cs>`): the clean-up runs at once. */
  setBridgeAgeing(device: DeviceId, bridge: IfaceName, ms: number): boolean {
    const br = this.s.devices[device]?.bridges[bridge];
    if (!br) return false;
    br.ageingMs = ms;
    br.stp.ageingNow = ms;
    if (this.iface(device, bridge)?.adminUp) fdbGcArm(this.k, device, br, 0);
    return true;
  }

  /** `ip link set <br> type bridge stp_state 0|1`: the spanning tree on or off (stp.ts). */
  setBridgeStp(device: DeviceId, bridge: IfaceName, on: boolean): boolean {
    const br = this.s.devices[device]?.bridges[bridge];
    if (!br) return false;
    stpSetEnabled(this.k, device, br, on);
    return true;
  }

  /** `ip link set <br> type bridge priority N` (the lowest bridge id becomes the root). */
  setBridgePriority(device: DeviceId, bridge: IfaceName, priority: number): boolean {
    const br = this.s.devices[device]?.bridges[bridge];
    if (!br) return false;
    stpSetBridgePriority(this.k, device, br, priority);
    return true;
  }

  /** `ip link set <br> type bridge forward_delay|hello_time|max_age` (ms). "range": the kernel refused it. */
  setBridgeTimes(device: DeviceId, bridge: IfaceName, times: StpTimes): "ok" | "range" | "no-bridge" {
    const br = this.s.devices[device]?.bridges[bridge];
    if (!br) return "no-bridge";
    return stpSetTimes(this.k, device, br, times);
  }

  /** `bridge link set dev <port> cost N | priority N`. */
  setPortStp(
    device: DeviceId,
    port: IfaceName,
    opts: { cost?: number; priority?: number },
  ): "ok" | "range" | "not-a-port" {
    const master = this.iface(device, port)?.master;
    const br = master ? this.s.devices[device]?.bridges[master] : undefined;
    if (!br) return "not-a-port";
    if (opts.cost !== undefined && stpSetPortCost(this.k, device, br, port, opts.cost) !== "ok") return "range";
    if (opts.priority !== undefined && stpSetPortPriority(this.k, device, br, port, opts.priority) !== "ok")
      return "range";
    return "ok";
  }

  /** A program sends one UDP datagram (bash's `echo … > /dev/udp/<ip>/<port>`). */
  sendUdp(device: DeviceId, dst: Ip, port: number, text: string): boolean {
    const d = this.s.devices[device];
    if (!d) return false;
    // An ephemeral source port, from Linux's range (32768–60999), seeded.
    const srcPort = 32768 + Math.floor(nextFloat(this.s.prng) * (60999 - 32768));
    const src = routeGet(d, dst);
    if (src.kind === "unreachable") return false;
    const from = src.kind === "local" ? dst : src.src;
    const payload = encodeUDP(from, dst, srcPort, port, encodeLab(text));
    return sendIp(this.k, device, { dst, proto: IPPROTO.udp, payload, df: true }, "command").ok;
  }

  addrFlush(device: DeviceId, dev: IfaceName): void {
    addrFlush(this.k, device, dev);
  }

  routeGet(device: DeviceId, dst: Ip): RouteGet {
    const d = this.s.devices[device];
    return d ? routeGet(d, dst, this.s.t) : { kind: "unreachable" };
  }

  /** `ip route show cache`: the route exceptions redirects left (ms until each expires). */
  routeCache(device: DeviceId): ReturnType<typeof routeCache> {
    const d = this.s.devices[device];
    return d ? routeCache(d, this.s.t) : [];
  }

  /** `ip route flush cache`. */
  routeFlushCache(device: DeviceId): void {
    routeFlushCache(this.k, device);
  }

  routeAdd(device: DeviceId, spec: { dst: string; via?: Ip; dev?: IfaceName }, replace = false): RouteResult {
    return routeAdd(this.k, device, spec, replace);
  }

  routeDel(device: DeviceId, spec: { dst: string; via?: Ip; dev?: IfaceName }): RouteResult {
    return routeDel(this.k, device, spec);
  }

  neighDel(device: DeviceId, ip: Ip, dev: IfaceName): boolean {
    return neighDelete(this.k, device, ip, dev);
  }

  neighFlush(device: DeviceId, dev: IfaceName): void {
    neighFlush(this.k, device, dev);
  }

  neighAdd(device: DeviceId, ip: Ip, mac: Mac, dev: IfaceName, replace = false): "ok" | "exists" {
    return neighAddPermanent(this.k, device, ip, mac, dev, replace);
  }

  fdbAdd(device: DeviceId, mac: Mac, port: IfaceName, opts: { static: boolean; sticky: boolean }): FdbResult {
    return fdbAdd(this.k, device, mac, port, opts);
  }

  fdbDel(device: DeviceId, mac: Mac, port: IfaceName): FdbResult {
    return fdbDel(this.k, device, mac, port);
  }

  /** `sysctl -w key=value`. */
  setSysctl(device: DeviceId, key: string, value: string): SysctlWrite {
    return sysctlWrite(this.k, device, key, value);
  }

  sysctlRead(device: DeviceId, key: string): string | undefined {
    const d = this.s.devices[device];
    return d ? sysctlRead(d, key) : undefined;
  }

  sysctlList(device: DeviceId): [string, string][] {
    const d = this.s.devices[device];
    return d ? sysctlList(d) : [];
  }

  startPing(device: DeviceId, execId: number, opts: Parameters<typeof startPing>[3]): PingStart {
    return startPing(this.k, device, execId, opts);
  }

  // ── Hand mode (0042) ──

  keeperLearn(device: DeviceId, mac: string, door: IfaceName): KeeperResult {
    return keeperLearn(this.k, device, mac, door);
  }

  keeperSend(device: DeviceId, where: string): KeeperResult {
    return keeperSend(this.k, device, where);
  }

  keeperAsk(device: DeviceId, ip: Ip): KeeperResult {
    return keeperAsk(this.k, device, ip);
  }

  keeperWrap(device: DeviceId, mac: string): KeeperResult {
    return keeperWrap(this.k, device, mac);
  }

  keeperForward(device: DeviceId, mac: string): KeeperResult {
    return keeperForward(this.k, device, mac);
  }

  /** The room decides the keeper remembers (switch, house); the router wakes with forwarding. */
  wakeKeeper(device: DeviceId): boolean {
    return wakeKeeper(this.k, device);
  }

  /** `lab cable plug|unplug <door>`: the cable at this door. */
  /** A worn-out control was touched (0040): it runs nothing, but rooms notice. */
  touch(device: DeviceId, control: string): void {
    this.emit({ kind: "control.touch", t: this.s.t, device, control });
  }

  plugCable(device: DeviceId, door: IfaceName, plugged: boolean): "ok" | "no-door" | "no-cable" {
    const i = this.iface(device, door);
    if (!i || i.kind !== "ether") return "no-door";
    if (!i.link) return "no-cable";
    this.setPlugged(i.link, plugged, device);
    return "ok";
  }

  /** Ctrl+C on a running command. */
  interrupt(device: DeviceId, execId: number): boolean {
    return (
      interruptPing(this.k, device, execId) ||
      interruptTcpdump(this.k, device, execId) ||
      interruptDhclient(this.k, device, execId)
    );
  }

  /** `dhclient` (dhcp.ts): a client per door, or a release. */
  startDhclient(device: DeviceId, execId: number, opts: Parameters<typeof startDhclient>[3]): DhclientStart {
    return startDhclient(this.k, device, execId, opts);
  }

  startTcpdump(device: DeviceId, execId: number, opts: Parameters<typeof startTcpdump>[3]): TcpdumpStart {
    return startTcpdump(this.k, device, execId, opts);
  }

  private messengerTick(device: DeviceId, index: number): void {
    const d = this.s.devices[device];
    const m = d?.messengers[index];
    if (!d || !m) return;
    this.schedule({ t: this.s.t + m.intervalMs, kind: "timer", device, service: "messenger", index });
    // A blank card: nowhere to send to.
    if (!m.to) return;
    if (parseIp(m.to)) {
      // A house address: one real echo request, as `ping -c 1` would send, routed and resolved as usual.
      m.seq += 1;
      const msg = encodeIcmp({
        type: ICMP.echoRequest,
        code: 0,
        id: m.echoId,
        seq: m.seq,
        data: pingPayload(this.s.t, 56),
      });
      sendIp(this.k, device, { dst: m.to, proto: IPPROTO.icmp, payload: msg }, "messenger");
      return;
    }
    const iface = d.ifaces.find((i) => i.name === m.dev);
    // Like any program on a door that's switched off, the messenger's send fails (ENETDOWN): nothing leaves.
    if (!iface?.adminUp) return;
    const bytes = encodeEth({ dst: m.to, src: iface.mac, type: ETHERTYPE.lab, payload: encodeLab(m.msg) });
    this.sendFrame(device, iface.name, bytes, "messenger");
  }

  private announcerTick(device: DeviceId): void {
    const d = this.s.devices[device];
    const a = d?.announcer;
    if (!d || !a) return;
    this.schedule({ t: this.s.t + a.intervalMs, kind: "timer", device, service: "announcer" });
    const iface = d.ifaces.find((i) => i.name === a.dev);
    if (!iface?.adminUp) return;
    const udp = encodeUDP(a.ip, a.dst, a.port, a.port, encodeLab(a.text));
    const ip = encodeIPv4({
      src: a.ip,
      dst: a.dst,
      proto: IPPROTO.udp,
      ttl: 64,
      id: a.nextId,
      df: false,
      payload: udp,
    });
    a.nextId = (a.nextId + 1) & 0xffff;
    const bytes = encodeEth({ dst: BROADCAST, src: iface.mac, type: ETHERTYPE.ipv4, payload: ip });
    this.sendFrame(device, iface.name, bytes, "announcer");
  }

  // ── Faults: declarative, applied on top of the correct network ────────────────────────

  private applyFault(f: Fault): void {
    const s = this.s;
    switch (f.kind) {
      case "iface-down": {
        const i = s.devices[f.device]?.ifaces.find((x) => x.name === f.iface);
        if (!i) throw new Error(`fault: no interface ${f.device}/${f.iface}`);
        this.setAdmin(f.device, f.iface, false);
        // A machine whose door was never opened shows the `noop` qdisc.
        i.everUp = false;
        return;
      }
      case "unplug": {
        if (!s.links[f.link]) throw new Error(`fault: no link ${f.link}`);
        this.setPlugged(f.link, false, f.end);
        return;
      }
      case "lab": {
        const d = s.devices[f.device];
        if (!d) throw new Error(`fault: no device ${f.device}`);
        d.lab = { ...f.lab };
        return;
      }
      case "card": {
        const m = s.devices[f.device]?.messengers[(f.messenger ?? 1) - 1];
        if (!m) throw new Error(`fault: ${f.device} has no messenger ${f.messenger ?? 1}`);
        m.to = f.to;
        return;
      }
      case "fdb-static": {
        const r = this.fdbAdd(f.device, f.mac, f.port, { static: true, sticky: !!f.sticky });
        if (!r.ok) throw new Error(`fault: fdb-static ${f.device} ${f.mac} ${f.port}: ${r.error}`);
        return;
      }
      case "addr-remove": {
        const r = this.addrDel(f.device, f.cidr, f.dev);
        if (!r.ok) throw new Error(`fault: addr-remove ${f.device} ${f.cidr}: ${r.error}`);
        return;
      }
      case "addr-set": {
        const r = this.addrAdd(f.device, f.cidr, f.dev);
        if (!r.ok) throw new Error(`fault: addr-set ${f.device} ${f.cidr}: ${r.error}`);
        return;
      }
      case "route-remove": {
        const r = this.routeDel(f.device, { dst: f.dst });
        if (!r.ok) throw new Error(`fault: route-remove ${f.device} ${f.dst}: ${r.error}`);
        return;
      }
      case "route-set": {
        const r = this.routeAdd(f.device, { dst: f.route.dst, via: f.route.via, dev: f.route.dev }, true);
        if (!r.ok) throw new Error(`fault: route-set ${f.device} ${f.route.dst}: ${r.error}`);
        return;
      }
      case "keeper-asleep": {
        const d = s.devices[f.device];
        if (!d) throw new Error(`fault: no device ${f.device}`);
        d.keeper.asleep = f.desk;
        return;
      }
      case "sysctl": {
        if (this.setSysctl(f.device, f.key, f.value) !== "ok") throw new Error(`fault: sysctl ${f.key}`);
        return;
      }
      case "neigh-permanent": {
        if (neighAddPermanent(this.k, f.device, f.ip, f.mac, f.dev, true) !== "ok")
          throw new Error(`fault: neigh-permanent ${f.ip}`);
        return;
      }
      case "dhcp-config": {
        const srv = s.devices[f.device]?.dhcpServer;
        if (!srv) throw new Error(`fault: ${f.device} runs no DHCP server`);
        configureDhcpServer(srv, f.config);
        return;
      }
    }
  }

  // ── Internals ─────────────────────────────────────────────────────────────────────────

  private schedule(item: Unscheduled): void {
    heapPush(this.s.queue, { ...item, seq: this.s.seq++ } as Scheduled);
  }

  /** Out of a door as the machine sends: a bridge decides its port; anything else goes on the wire. */
  private sendFrame(device: DeviceId, name: IfaceName, bytes: Uint8Array, origin: FrameOrigin, parent?: number): void {
    const i = this.iface(device, name);
    if (i?.kind === "bridge") {
      if (!i.adminUp) {
        this.emit({
          kind: "frame.drop",
          t: this.s.t,
          device,
          iface: name,
          frameId: this.s.nextFrameId++,
          reason: "link-down",
        });
        return;
      }
      bridgeXmit(this.k, device, name, bytes, origin, parent);
      return;
    }
    this.wire(device, name, bytes, origin, parent);
  }

  /** Puts bytes on the cable plugged into a physical door. */
  private wire(device: DeviceId, name: IfaceName, bytes: Uint8Array, origin: FrameOrigin, parent?: number): number {
    const frameId = this.s.nextFrameId++;
    const t = this.s.t;
    const summary = summarizeEth(bytes);
    if (!this.oper(device, name).up) {
      // Linux won't put a frame on a link that is down; the sender's door is where it dies.
      this.emit({ kind: "frame.drop", t, device, iface: name, frameId, reason: "link-down" });
      return frameId;
    }
    this.emit({
      kind: "frame.tx",
      t,
      device,
      iface: name,
      frameId,
      bytes,
      summary,
      origin,
      ...(parent !== undefined ? { parent } : {}),
    });
    tcpdumpHears(this.k, device, name, bytes);
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
    switch (ev.kind) {
      case "arrive":
        this.arrive(ev);
        return;
      case "lab-reply": {
        const d = this.s.devices[ev.device];
        const iface = d?.ifaces.find((i) => i.name === ev.iface);
        if (!d || !iface) return;
        const bytes = encodeEth({ dst: ev.to, src: iface.mac, type: ETHERTYPE.labAnswer, payload: encodeLab(ev.text) });
        this.sendFrame(d.id, iface.name, bytes, "responder");
        return;
      }
      case "timer":
        if (ev.service === "messenger") this.messengerTick(ev.device, ev.index ?? 0);
        else this.announcerTick(ev.device);
        return;
      case "fdb-gc":
        fdbGc(this.k, ev.device, ev.bridge, ev.stamp);
        return;
      case "stp":
        stpTimer(this.k, ev);
        return;
      case "neigh":
        neighTimer(this.k, ev.device, ev.dev, ev.ip, ev.stamp, (device, q) => queuedFailed(this.k, device, q));
        return;
      case "ping":
        pingTimer(this.k, ev.device, ev.execId, ev.what);
        return;
      case "ping-error":
        pingHears(this.k, ev.device, {
          kind: "error",
          from: ev.from,
          id: ev.id,
          seq: ev.icmpSeq,
          type: ev.type,
          code: ev.code,
        });
        return;
      case "dhcp":
        dhcpTimer(this.k, ev);
        return;
      case "dhcp-send":
        dhcpSend(this.k, ev);
        return;
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
    tcpdumpHears(this.k, to.device, to.iface, bytes);
    const port = this.iface(to.device, to.iface);
    if (port?.master) {
      const br = this.iface(to.device, port.master);
      if (!br?.adminUp) {
        // A bridge that's switched off has disabled its ports: nothing gets through.
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
      bridgeInput(this.k, to.device, to.iface, ev.frameId, bytes);
      return;
    }
    this.hostReceive(to.device, to.iface, ev.frameId, bytes, false);
  }

  /**
   * A frame reached this machine's stack on `name`. A door takes in frames for its own address,
   * broadcast and multicast; everything else is ignored (SIM-11). Then by EtherType. When a bridge
   * passed it up, the bridge already made (and recorded) that decision.
   */
  private hostReceive(device: DeviceId, name: IfaceName, frameId: number, bytes: Uint8Array, viaBridge: boolean): void {
    const d = this.s.devices[device];
    const iface = d?.ifaces.find((i) => i.name === name);
    if (!d || !iface) return;
    const t = this.s.t;
    const f = decodeEth(bytes);
    if (!viaBridge) {
      const forMe = f.dst === iface.mac || f.dst === BROADCAST || isGroup(f.dst);
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
    }
    if (f.type === ETHERTYPE.lab || f.type === ETHERTYPE.labAnswer) {
      const text = decodeLab(f.payload);
      this.emit({ kind: "app.deliver", t, device, iface: name, proto: "lab", frameId, from: f.src, to: f.dst, text });
      if (f.type === ETHERTYPE.lab) this.labRespond(d, iface, f.src, f.dst === BROADCAST);
      return;
    }
    // Raw packet sockets (dhclient, arping, dnsmasq's ping) see the frame before the IP layer does.
    dhcpTap(this.k, device, name, bytes);
    if (inetInput(this.k, device, name, frameId, bytes)) return;
    this.emit({ kind: "frame.drop", t, device, iface: name, frameId, reason: "no-listener" });
  }

  private labRespond(d: DeviceState, iface: IfaceState, sender: Mac, wasBroadcast: boolean): void {
    const lab = d.lab;
    if (lab?.mode !== "responder") return;
    let text: string;
    if (wasBroadcast) {
      if (!lab.answersBroadcast) return;
      text = lab.broadcastReply ?? `I'm here — ${d.hostname}`;
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

/** What a card can hold: a door name (MAC), a house address (IPv4), or nothing. Null if it's neither. */
export function cardAddress(text: string): string | null {
  if (text === "") return "";
  if (parseIp(text)) return text;
  return parseMac(text);
}

/** The first door that isn't the loopback: where lab tools send by default. */
function firstDoor(d: DeviceState): IfaceState | undefined {
  return d.ifaces.find((i) => i.kind !== "loopback");
}

function build(topology: Topology, seed: number): WorldState {
  const devices: Record<DeviceId, DeviceState> = {};
  for (const spec of topology.devices) {
    // ifindex 1 is the loopback every Linux machine has; doors follow in order, then bridges.
    const ifaces: IfaceState[] = [
      {
        name: "lo",
        ifindex: 1,
        kind: "loopback",
        mac: "00:00:00:00:00:00",
        mtu: 65536,
        adminUp: true,
        everUp: true,
        link: null,
        master: null,
      },
      ...spec.interfaces.map(
        (i, n): IfaceState => ({
          name: i.name,
          ifindex: n + 2,
          kind: "ether",
          mac: i.mac,
          mtu: 1500,
          adminUp: i.adminUp ?? true,
          everUp: i.adminUp ?? true,
          link: null,
          master: null,
        }),
      ),
    ];
    const bridges: DeviceState["bridges"] = {};
    for (const b of spec.bridges ?? []) {
      const ports = b.ports.map((p) => {
        const port = ifaces.find((i) => i.name === p);
        if (!port) throw new Error(`bridge ${spec.id}/${b.name}: no port ${p}`);
        port.master = b.name;
        return port;
      });
      // Linux gives a bridge the lowest of its ports' addresses unless one is set.
      const mac = b.mac ?? ports.map((p) => p.mac).sort()[0] ?? "02:00:00:00:00:00";
      ifaces.push({
        name: b.name,
        ifindex: ifaces.length + 1,
        kind: "bridge",
        mac,
        mtu: 1500,
        adminUp: b.adminUp ?? true,
        everUp: true,
        link: null,
        master: null,
      });
      bridges[b.name] = {
        name: b.name,
        ageingMs: b.ageingMs ?? DEFAULT_AGEING_MS,
        // Each port's own address is a permanent local entry.
        fdb: ports.map((p) => ({ mac: p.mac, port: p.name, local: true, static: true, sticky: false, updated: 0 })),
        gc: null,
        stp: newBridgeStp(mac, b.ports, { ...b, ageingMs: b.ageingMs ?? DEFAULT_AGEING_MS }),
      };
    }
    devices[spec.id] = {
      id: spec.id,
      hostname: spec.hostname,
      kind: spec.kind,
      ifaces,
      bridges,
      addrs: [{ dev: "lo", ip: "127.0.0.1", prefix: 8, broadcast: null, scope: "host", secondary: false }],
      routes: [],
      neigh: [],
      neighParms: {},
      sysctl: { ...(spec.sysctl ?? {}) },
      ipId: 0,
      icmpTokens: {},
      procs: [],
      keeper: { asleep: null, desk: [] },
      lab: spec.lab ? { ...spec.lab } : null,
      messengers: [...(spec.messenger ? [spec.messenger] : []), ...(spec.messengers ?? [])].map((m) => ({
        to: m.to,
        msg: m.msg ?? "hello",
        intervalMs: m.intervalMs ?? 4000,
        dev: m.dev ?? spec.interfaces[0]?.name ?? "eth0",
        echoId: 0,
        seq: 0,
      })),
      announcer: spec.announcer
        ? {
            ...spec.announcer,
            dst: spec.announcer.dst ?? "255.255.255.255",
            dev: spec.announcer.dev ?? spec.interfaces[0]?.name ?? "eth0",
            nextId: 0,
          }
        : null,
      dhcpServer: spec.dhcpServer ? initDhcpServer(spec.dhcpServer, spec.interfaces[0]?.name ?? "eth0") : null,
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
      out: spec.plugged === false ? ["a", "b"] : [],
      delayMs: spec.delayMs ?? DEFAULT_DELAY_MS,
      bandwidthBps: spec.bandwidthBps ?? DEFAULT_BW,
      queueLimit: spec.queueLimit ?? DEFAULT_QUEUE,
      busyUntil: [0, 0],
      inFlight: [0, 0],
    };
  }
  const prng = seedPrng(seed);
  const s: WorldState = { t: 0, seq: 0, nextFrameId: 1, prng, devices, links, queue: [] };
  for (const d of Object.values(devices)) {
    // First messages come early so the player sees the service working; then at its interval.
    // Several messengers start a little apart, so their letters don't all cross at once.
    d.messengers.forEach((m, index) => {
      m.echoId = Math.floor(nextFloat(prng) * 0xffff) + 1;
      heapPush(s.queue, {
        t: Math.min(1500, m.intervalMs) + index * 400,
        seq: s.seq++,
        kind: "timer",
        device: d.id,
        service: "messenger",
        index,
      });
    });
    if (d.announcer) {
      d.announcer.nextId = Math.floor(nextFloat(prng) * 0xffff);
      heapPush(s.queue, {
        t: d.announcer.intervalMs * 0.6,
        seq: s.seq++,
        kind: "timer",
        device: d.id,
        service: "announcer",
      });
    }
    // The machine's IP ID counter starts somewhere seeded, as Linux's does (randomised per boot).
    d.ipId = Math.floor(nextFloat(prng) * 0xffff);
    // Each door's neighbour settings, with its own randomised reachable time.
    for (const name of ["default", ...d.ifaces.map((i) => i.name)]) {
      d.neighParms[name] = {
        ...NEIGH_DEFAULTS,
        reachableMs: Math.floor(NEIGH_DEFAULTS.baseReachableMs * (0.5 + nextFloat(prng))),
      };
    }
  }
  // Addresses, routes and settings the room gives each machine, applied as a person would.
  const k = staticKernel(s);
  for (const spec of topology.devices) {
    for (const a of spec.addrs ?? []) {
      const r = addrAdd(k, spec.id, a.cidr, a.dev);
      if (!r.ok) throw new Error(`device ${spec.id}: address ${a.cidr} on ${a.dev}: ${r.error}`);
    }
    for (const r of spec.routes ?? []) {
      const res = routeAdd(k, spec.id, { dst: r.dst, via: r.via, dev: r.dev });
      if (!res.ok) throw new Error(`device ${spec.id}: route ${r.dst}: ${res.error}`);
    }
  }
  return s;
}

/** A kernel for building the starting world: no trace, no cables used. */
function staticKernel(s: WorldState): Kernel {
  return {
    s,
    emit: () => {},
    schedule: (item) => heapPush(s.queue, { ...item, seq: s.seq++ } as Scheduled),
    random: () => nextFloat(s.prng),
    oper: () => ({ adminUp: true, carrier: true, up: true }),
    wire: () => 0,
    send: () => {},
    hostReceive: () => {},
  };
}

/** World state is plain JSON by design, so a JSON round-trip is a faithful deep copy. */
function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}
