/**
 * Linux bridges (switches): the forwarding database and the forwarding decision, following the
 * kernel's br_handle_frame, br_handle_frame_finish and br_fdb_update (net/bridge). Each port has a
 * spanning-tree state (stp.ts): with STP off (the default) a port forwards as soon as it's up, so
 * loops are real (tech/simulator.md); with STP on, only forwarding ports carry frames.
 *
 * Verified on this machine's kernel (7.1): learning moves a static entry to the port its address
 * is seen on unless the entry is also sticky; a sticky static entry stays put.
 */

import { hold } from "./keeper";
import { deviceOf, ifaceOf, type Kernel } from "./kernel";
import { BROADCAST, type Mac } from "./mac";
import { decodeEth, toHex } from "./proto/ethernet";
import { STP_GROUP } from "./proto/stp";
import { portForwards, stpPort, stpReceive } from "./stp";
import { tcpdumpHears } from "./tcpdump";
import type { BridgeState, DeviceId, DeviceState, FdbEntry, IfaceName } from "./types";
import { kernelTimer } from "./wheel";

export const DEFAULT_AGEING_MS = 300_000;

/** Group addresses (broadcast and multicast) have the lowest bit of the first byte set. */
export function isGroup(mac: Mac): boolean {
  return (Number.parseInt(mac.slice(0, 2), 16) & 1) === 1;
}

export function bridgeOfPort(d: DeviceState, port: IfaceName): BridgeState | undefined {
  const master = ifaceOf(d, port)?.master;
  return master ? d.bridges[master] : undefined;
}

function lookup(br: BridgeState, mac: Mac): FdbEntry | undefined {
  return br.fdb.find((e) => e.mac === mac);
}

/** Learning (br_fdb_update): remember which port a source address was seen on. */
function learn(k: Kernel, device: DeviceId, br: BridgeState, mac: Mac, port: IfaceName): void {
  if (isGroup(mac)) return;
  const t = k.s.t;
  const e = lookup(br, mac);
  if (e) {
    // A frame claiming one of the bridge's own addresses changes nothing (Linux warns and moves on).
    if (e.local) return;
    e.updated = t;
    if (e.port !== port && !e.sticky) {
      const before = e.port;
      e.port = port;
      k.emit({ kind: "table.change", t, device, table: "fdb", op: "set", key: mac, before, after: port });
    }
    return;
  }
  const entry: FdbEntry = { mac, port, local: false, static: false, sticky: false, updated: t };
  br.fdb.push(entry);
  k.emit({ kind: "table.change", t, device, table: "fdb", op: "add", key: mac, before: null, after: port });
}

/**
 * How long a learned entry lasts (hold_time): the ageing time, or the forward delay while the
 * spanning tree reports a topology change.
 */
function holdTime(br: BridgeState): number {
  return br.stp.topologyChange ? br.stp.forwardDelay : br.stp.ageingNow;
}

/** Has this entry outlived its hold time? `bridge fdb show` prints such an entry "stale" until the clean-up removes it. */
export function fdbStale(br: BridgeState, e: FdbEntry, now: number): boolean {
  return !e.static && !e.local && e.updated + holdTime(br) <= now;
}

/** (Re)schedules the clean-up work (mod_delayed_work on gc_work) `delay` ms from now. */
export function fdbGcArm(k: Kernel, device: DeviceId, br: BridgeState, delay: number): void {
  const now = k.s.t;
  const at = delay <= 0 ? now : kernelTimer(now, delay);
  const stamp = ++br.stp.stamp;
  br.gc = { at, stamp };
  k.schedule({ t: at, kind: "fdb-gc", device, bridge: br.name, stamp });
}

/**
 * The forwarding database's clean-up (br_fdb_cleanup): it removes every learned entry older than
 * the hold time, then sleeps until the next one would expire (at most a hold time). Entries aren't
 * removed the moment they expire: a hold time that shrinks (a topology change) takes effect at the
 * next clean-up, as on Linux.
 */
export function fdbGc(k: Kernel, device: DeviceId, bridge: IfaceName, stamp: number): void {
  const br = deviceOf(k, device)?.bridges[bridge];
  if (!br || br.gc?.stamp !== stamp) return;
  br.gc = null;
  const now = k.s.t;
  const delay = holdTime(br);
  let next = delay;
  for (const e of [...br.fdb]) {
    if (e.static || e.local) continue;
    const expires = e.updated + delay;
    if (expires > now) next = Math.min(next, expires - now);
    else {
      br.fdb = br.fdb.filter((x) => x !== e);
      k.emit({
        kind: "table.change",
        t: now,
        device,
        table: "fdb",
        op: "del",
        key: e.mac,
        before: e.port,
        after: null,
      });
    }
  }
  fdbGcArm(k, device, br, Math.max(next, 10));
}

/** A port's learned entries go (br_fdb_delete_by_port without do_all; static ones stay, measured on 7.1.13). */
export function fdbPortDown(k: Kernel, device: DeviceId, port: IfaceName): void {
  const d = deviceOf(k, device);
  const master = d?.ifaces.find((i) => i.name === port)?.master;
  for (const br of Object.values(d?.bridges ?? {})) {
    if (br.name !== master) continue;
    const gone = br.fdb.filter((e) => e.port === port && !e.static && !e.local);
    if (gone.length === 0) continue;
    br.fdb = br.fdb.filter((e) => !gone.includes(e));
    for (const e of gone)
      k.emit({
        kind: "table.change",
        t: k.s.t,
        device,
        table: "fdb",
        op: "del",
        key: e.mac,
        before: port,
        after: null,
      });
  }
}

/**
 * The ports that can carry a frame now (forwarding: up, with carrier, and not held back by the
 * spanning tree), in the order Linux floods them: its port list puts each new port first, so the
 * last port added gets a flooded frame first (measured: with two machines answering one ARP
 * question, the one on the newest port answers first, every time).
 */
function livePorts(k: Kernel, d: DeviceState, br: BridgeState): IfaceName[] {
  return d.ifaces
    .filter((i) => i.master === br.name && portForwards(br, i.name) && k.oper(d.id, i.name).up)
    .map((i) => i.name)
    .reverse();
}

/**
 * A frame arrived on a bridge port (br_handle_frame_finish): learn, then deliver it to the machine,
 * forward it out one port, filter it, or flood it.
 */
export function bridgeInput(k: Kernel, device: DeviceId, port: IfaceName, frameId: number, bytes: Uint8Array): void {
  const d = deviceOf(k, device);
  const br = d && bridgeOfPort(d, port);
  if (!d || !br) return;
  const brIface = ifaceOf(d, br.name);
  const t = k.s.t;
  const f = decodeEth(bytes);
  const state = stpPort(br, port)?.state ?? "disabled";
  // The bridge group address: with STP on, a BPDU goes to the port's spanning tree (its sender is
  // learned if the port learns); with STP off it is flooded like any group frame, so that bridges
  // without STP don't hide a loop from those running it (br_handle_frame).
  if (f.dst === STP_GROUP && br.stp.enabled) {
    if (state === "learning" || state === "forwarding") learn(k, device, br, f.src, port);
    stpReceive(k, device, br, port, bytes);
    return;
  }
  // Only a learning or forwarding port takes frames in; a learning one learns, then drops them.
  if (state !== "forwarding") {
    if (state === "learning") learn(k, device, br, f.src, port);
    k.emit({ kind: "frame.drop", t, device, iface: port, frameId, reason: "port-blocked" });
    return;
  }
  // A capture on the bridge puts it in promiscuous mode: it hears everything that enters.
  tcpdumpHears(k, device, br.name, bytes);
  // A keeper that has forgotten its job (hand mode, 0042): the frame waits at its desk.
  if (d.keeper.asleep === "switch") {
    hold(k, device, { kind: "frame", hex: toHex(bytes), port, frameId });
    return;
  }
  learn(k, device, br, f.src, port);

  const known = isGroup(f.dst) ? undefined : lookup(br, f.dst);
  const fdbRef = known ? { mac: known.mac, port: known.port, static: known.static, local: known.local } : null;

  // For the bridge itself (its own address, or a port's: the "permanent" local entries).
  if (known?.local || f.dst === brIface?.mac) {
    k.emit({
      kind: "fwd.decision",
      t,
      device,
      frameId,
      layer: "l2",
      decision: "deliver",
      egress: [],
      tableRef: { dst: f.dst, fdb: fdbRef },
    });
    if (brIface?.adminUp) k.hostReceive(device, br.name, frameId, bytes);
    return;
  }
  // Known: out of that port (filtered if it's the one it came in on). Unknown or group: flood.
  bridgeEgress(k, device, port, frameId, bytes, known ? known.port : "flood");
}

/** Learning, as the keeper's own step (and the hand step `lab keeper learn`). */
export function learnFrom(k: Kernel, device: DeviceId, bridge: IfaceName, mac: Mac, port: IfaceName): void {
  const br = deviceOf(k, device)?.bridges[bridge];
  if (br) learn(k, device, br, mac, port);
}

/**
 * A frame leaves the bridge: out of one port, or flooded out every other live port (and up to the
 * machine for broadcast and multicast). The automatic decision and the hand step (`lab keeper send`)
 * both end here. Sending a frame back out of the port it came in on filters it, unless done by hand,
 * when it really goes (mistakes are real, 0042).
 */
export function bridgeEgress(
  k: Kernel,
  device: DeviceId,
  inPort: IfaceName,
  frameId: number,
  bytes: Uint8Array,
  out: IfaceName | "flood",
  byHand = false,
): void {
  const d = deviceOf(k, device);
  const br = d && bridgeOfPort(d, inPort);
  if (!d || !br) return;
  const t = k.s.t;
  const f = decodeEth(bytes);
  const known = isGroup(f.dst) ? undefined : lookup(br, f.dst);
  const tableRef = {
    dst: f.dst,
    fdb: known ? { mac: known.mac, port: known.port, static: known.static, local: known.local } : null,
  };
  if (out === "flood") {
    const egress = livePorts(k, d, br).filter((p) => p !== inPort);
    k.emit({
      kind: "fwd.decision",
      t,
      device,
      frameId,
      layer: "l2",
      decision: "flood",
      egress,
      tableRef: { ...tableRef, fdb: null },
    });
    for (const p of egress) k.wire(device, p, bytes, "forward", frameId);
    const brIface = ifaceOf(d, br.name);
    if (brIface?.adminUp && (f.dst === BROADCAST || isGroup(f.dst))) k.hostReceive(device, br.name, frameId, bytes);
    return;
  }
  if (out === inPort && !byHand) {
    k.emit({ kind: "fwd.decision", t, device, frameId, layer: "l2", decision: "drop", egress: [], tableRef });
    k.emit({ kind: "frame.drop", t, device, iface: inPort, frameId, reason: "fdb-filter" });
    return;
  }
  k.emit({ kind: "fwd.decision", t, device, frameId, layer: "l2", decision: "forward", egress: [out], tableRef });
  if (!k.oper(device, out).up) k.emit({ kind: "frame.drop", t, device, iface: out, frameId, reason: "link-down" });
  else if (!portForwards(br, out))
    k.emit({ kind: "frame.drop", t, device, iface: out, frameId, reason: "port-blocked" });
  else k.wire(device, out, bytes, "forward", frameId);
}

/** The machine sends out of its bridge (br_dev_xmit): to the known port, else every live port. */
export function bridgeXmit(
  k: Kernel,
  device: DeviceId,
  bridge: IfaceName,
  bytes: Uint8Array,
  origin: Parameters<Kernel["wire"]>[3],
  parent?: number,
): void {
  const d = deviceOf(k, device);
  const br = d?.bridges[bridge];
  if (!d || !br) return;
  const f = decodeEth(bytes);
  tcpdumpHears(k, device, bridge, bytes);
  const known = isGroup(f.dst) ? undefined : lookup(br, f.dst);
  if (known && !known.local) {
    if (k.oper(device, known.port).up && portForwards(br, known.port))
      k.wire(device, known.port, bytes, origin, parent);
    return;
  }
  for (const p of livePorts(k, d, br)) k.wire(device, p, bytes, origin, parent);
}

// ── `bridge fdb add|del` ───────────────────────────────────────────────────────────────────

export type FdbResult = { ok: true } | { ok: false; error: "exists" | "missing" | "not-a-port" };

export function fdbAdd(
  k: Kernel,
  device: DeviceId,
  mac: Mac,
  port: IfaceName,
  opts: { static: boolean; sticky: boolean },
): FdbResult {
  const d = deviceOf(k, device);
  const br = d && bridgeOfPort(d, port);
  if (!d || !br) return { ok: false, error: "not-a-port" };
  if (lookup(br, mac)) return { ok: false, error: "exists" };
  const t = k.s.t;
  const entry: FdbEntry = { mac, port, local: false, static: opts.static, sticky: opts.sticky, updated: t };
  br.fdb.push(entry);
  k.emit({ kind: "table.change", t, device, table: "fdb", op: "add", key: mac, before: null, after: port });
  return { ok: true };
}

export function fdbDel(k: Kernel, device: DeviceId, mac: Mac, port: IfaceName): FdbResult {
  const d = deviceOf(k, device);
  const br = d && bridgeOfPort(d, port);
  if (!d || !br) return { ok: false, error: "not-a-port" };
  const e = br.fdb.find((x) => x.mac === mac && x.port === port);
  if (!e) return { ok: false, error: "missing" };
  br.fdb = br.fdb.filter((x) => x !== e);
  k.emit({ kind: "table.change", t: k.s.t, device, table: "fdb", op: "del", key: mac, before: port, after: null });
  return { ok: true };
}
