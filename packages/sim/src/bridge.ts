/**
 * Linux bridges (switches): the forwarding database and the forwarding decision, following the
 * kernel's br_handle_frame_finish and br_fdb_update (net/bridge). STP is off, so ports forward as
 * soon as they're up and loops are real (tech/simulator.md).
 *
 * Verified on this machine's kernel (7.1): learning moves a static entry to the port its address
 * is seen on unless the entry is also sticky; a sticky static entry stays put.
 */

import { hold } from "./keeper";
import { deviceOf, ifaceOf, type Kernel } from "./kernel";
import { BROADCAST, type Mac } from "./mac";
import { decodeEth, toHex } from "./proto/ethernet";
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
    if (!e.static) scheduleAgeing(k, device, br, e);
    return;
  }
  const entry: FdbEntry = { mac, port, local: false, static: false, sticky: false, updated: t };
  br.fdb.push(entry);
  k.emit({ kind: "table.change", t, device, table: "fdb", op: "add", key: mac, before: null, after: port });
  scheduleAgeing(k, device, br, entry);
}

function scheduleAgeing(k: Kernel, device: DeviceId, br: BridgeState, e: FdbEntry): void {
  // The bridge's clean-up runs on a kernel timer, rounded as the timer wheel rounds it (wheel.ts).
  const t = kernelTimer(k.s.t, e.updated + br.ageingMs - k.s.t);
  k.schedule({ t, kind: "fdb-age", device, bridge: br.name, mac: e.mac, updated: e.updated });
}

/**
 * A bridge port stopped forwarding (carrier lost or switched off): its learned entries go, static
 * ones stay (br_stp_disable_port → br_fdb_delete_by_port without do_all; measured on 7.1.13).
 */
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

/** An ageing timer fired: forget the entry if nothing refreshed it since. */
export function fdbAge(k: Kernel, device: DeviceId, bridge: IfaceName, mac: Mac, updated: number): void {
  const br = deviceOf(k, device)?.bridges[bridge];
  const e = br && lookup(br, mac);
  if (!br || !e || e.static || e.local || e.updated !== updated) return;
  br.fdb = br.fdb.filter((x) => x !== e);
  k.emit({ kind: "table.change", t: k.s.t, device, table: "fdb", op: "del", key: mac, before: e.port, after: null });
}

/**
 * The ports that can carry a frame now (up, with carrier), in the order Linux floods them: its port
 * list puts each new port first, so the last port added gets a flooded frame first (measured: with
 * two machines answering one ARP question, the one on the newest port answers first, every time).
 */
function livePorts(k: Kernel, d: DeviceState, br: BridgeState): IfaceName[] {
  return d.ifaces
    .filter((i) => i.master === br.name && k.oper(d.id, i.name).up)
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
  if (k.oper(device, out).up) k.wire(device, out, bytes, "forward", frameId);
  else k.emit({ kind: "frame.drop", t, device, iface: out, frameId, reason: "link-down" });
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
    if (k.oper(device, known.port).up) k.wire(device, known.port, bytes, origin, parent);
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
  if (!entry.static) scheduleAgeing(k, device, br, entry);
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
