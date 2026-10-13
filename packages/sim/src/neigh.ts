/**
 * The neighbour (ARP) table and its state machine, as Linux 7.1 runs it (net/core/neighbour.c,
 * net/ipv4/arp.c), checked against the real kernel (tools/golden, the difftest):
 * - unknown address: INCOMPLETE; broadcast requests, mcast_solicit (3) × retrans_time (1 s); no
 *   answer: FAILED, and every packet that was waiting fails ("host unreachable");
 * - answered: REACHABLE until confirmed + reachable_time. Then, if the entry was used in the last
 *   delay_first_probe_time (5 s): DELAY; else STALE;
 * - used while STALE: DELAY;
 * - DELAY ends after 5 s: REACHABLE if something confirmed it within 5 s of now, else PROBE:
 *   unicast requests, ucast_solicit (3) × 1 s, then FAILED;
 * - sending a probe counts as using the entry. (Measured: with a reachable time under 5 s, an entry
 *   cycles REACHABLE → DELAY → probe → REACHABLE every ~6 s for as long as the neighbour answers.)
 * Only ARP replies confirm an entry; ICMP (ping) traffic doesn't.
 * Updating a known entry from ARP (neigh_update): a request for one of our addresses always
 * overrides; any other ARP (a reply, or a request we only overheard) changes the link address only
 * if the entry is older than `locktime` (1 s), so of two back-to-back replies the FIRST wins
 * (measured with two machines claiming one address, tools/golden/capture-redirect.sh).
 * Settings are per door (net.ipv4.neigh.<door>.*). reachable_time is randomised (×0.5–1.5) from
 * base_reachable_time_ms per door, and again whenever that setting changes.
 */

import { deviceOf, ifaceOf, type Kernel } from "./kernel";
import { BROADCAST, type Mac } from "./mac";
import { ARP_REPLY, ARP_REQUEST, decodeArp, encodeArp } from "./proto/arp";
import { ETHERTYPE, encodeEth } from "./proto/ethernet";
import type { DeviceId, DeviceState, IfaceName, Ip, NeighParms, NeighState } from "./types";
import { kernelTimer } from "./wheel";

export const NEIGH_DEFAULTS: Omit<NeighParms, "reachableMs"> = {
  baseReachableMs: 30_000,
  retransMs: 1000,
  delayFirstProbeMs: 5000,
  mcastSolicit: 3,
  ucastSolicit: 3,
};

/** Packets kept per unresolved neighbour (Linux limits by bytes, unres_qlen_bytes 212992). */
const QUEUE_MAX = 100;

/** net.ipv4.neigh.*.locktime: 100 centiseconds. */
const LOCKTIME_MS = 1000;

export function randomReachable(k: Kernel, base: number): number {
  return Math.floor(base * (0.5 + k.random()));
}

export function parmsOf(d: DeviceState, dev: IfaceName): NeighParms {
  return d.neighParms[dev] ?? { ...NEIGH_DEFAULTS, reachableMs: NEIGH_DEFAULTS.baseReachableMs };
}

export type Failed = (device: DeviceId, item: NeighState["queue"][number]) => void;

function entry(d: DeviceState, ip: Ip, dev: IfaceName): NeighState | undefined {
  return d.neigh.find((n) => n.ip === ip && n.dev === dev);
}

function change(k: Kernel, device: DeviceId, n: NeighState, state: NeighState["state"]): void {
  const before = { state: n.state, mac: n.mac };
  n.state = state;
  n.updated = k.s.t;
  k.emit({
    kind: "table.change",
    t: k.s.t,
    device,
    table: "neigh",
    op: "set",
    key: `${n.ip} dev ${n.dev}`,
    before,
    after: { state, mac: n.mac },
  });
}

/** Arms the entry's timer for `at`, rounded as the kernel's timer wheel rounds it (wheel.ts). */
function arm(k: Kernel, device: DeviceId, n: NeighState, at: number): void {
  n.stamp += 1;
  const t = kernelTimer(k.s.t, Math.max(at - k.s.t, 0));
  k.schedule({ t, kind: "neigh", device, dev: n.dev, ip: n.ip, stamp: n.stamp });
}

function solicit(k: Kernel, device: DeviceId, n: NeighState, unicast: boolean): void {
  const d = deviceOf(k, device);
  const iface = ifaceOf(d, n.dev);
  if (!d || !iface) return;
  // The source of a request: our address on that door in the target's subnet, else any on it.
  const onDev = d.addrs.filter((a) => a.dev === n.dev && a.scope === "global");
  const src = onDev[0]?.ip ?? "0.0.0.0";
  const arp = encodeArp({
    op: ARP_REQUEST,
    senderMac: iface.mac,
    senderIp: src,
    targetMac: "00:00:00:00:00:00",
    targetIp: n.ip,
  });
  const dst = unicast && n.mac ? n.mac : BROADCAST;
  k.send(device, n.dev, encodeEth({ dst, src: iface.mac, type: ETHERTYPE.arp, payload: arp }), "kernel");
  n.probes += 1;
  // Sending a probe counts as use (measured on kernel 7.1, see the header).
  n.used = k.s.t;
}

function newEntry(ip: Ip, dev: IfaceName, mac: Mac | null, state: NeighState["state"], t: number): NeighState {
  return { ip, dev, mac, state, confirmed: 0, used: t, updated: t, probes: 0, queue: [], stamp: 0 };
}

/**
 * The IP layer has a packet for `ip` out of `dev`. Returns the address to put on the frame now, or
 * null if the packet was queued while the address is found.
 */
export function resolve(
  k: Kernel,
  device: DeviceId,
  dev: IfaceName,
  ip: Ip,
  waiting: NeighState["queue"][number],
): Mac | null {
  const d = deviceOf(k, device);
  if (!d) return null;
  const p = parmsOf(d, dev);
  let n = entry(d, ip, dev);
  if (!n) {
    n = newEntry(ip, dev, null, "INCOMPLETE", k.s.t);
    d.neigh.push(n);
    k.emit({
      kind: "table.change",
      t: k.s.t,
      device,
      table: "neigh",
      op: "add",
      key: `${ip} dev ${dev}`,
      before: null,
      after: { state: "INCOMPLETE", mac: null },
    });
    n.queue.push(waiting);
    solicit(k, device, n, false);
    arm(k, device, n, k.s.t + p.retransMs);
    return null;
  }
  n.used = k.s.t;
  switch (n.state) {
    case "PERMANENT":
    case "REACHABLE":
    case "DELAY":
    case "PROBE":
      return n.mac;
    case "STALE":
      change(k, device, n, "DELAY");
      arm(k, device, n, k.s.t + p.delayFirstProbeMs);
      return n.mac;
    case "INCOMPLETE":
      if (n.queue.length < QUEUE_MAX) n.queue.push(waiting);
      return null;
    case "FAILED":
      // A new packet to a failed neighbour starts resolving again.
      n.probes = 0;
      n.queue = [waiting];
      change(k, device, n, "INCOMPLETE");
      solicit(k, device, n, false);
      arm(k, device, n, k.s.t + p.retransMs);
      return null;
  }
}

/** A neighbour timer fired (neigh_timer_handler). */
export function neighTimer(k: Kernel, device: DeviceId, dev: IfaceName, ip: Ip, stamp: number, failed: Failed): void {
  const d = deviceOf(k, device);
  const n = d && entry(d, ip, dev);
  if (!d || !n || n.stamp !== stamp) return;
  const p = parmsOf(d, dev);
  const now = k.s.t;
  switch (n.state) {
    case "INCOMPLETE":
      if (n.probes < p.mcastSolicit) {
        solicit(k, device, n, false);
        arm(k, device, n, now + p.retransMs);
      } else fail(k, device, n, failed);
      return;
    case "REACHABLE":
      if (now < n.confirmed + p.reachableMs) arm(k, device, n, n.confirmed + p.reachableMs);
      else if (now <= n.used + p.delayFirstProbeMs) {
        change(k, device, n, "DELAY");
        arm(k, device, n, now + p.delayFirstProbeMs);
      } else change(k, device, n, "STALE");
      return;
    case "DELAY":
      if (now <= n.confirmed + p.delayFirstProbeMs) {
        change(k, device, n, "REACHABLE");
        arm(k, device, n, n.confirmed + p.reachableMs);
      } else {
        n.probes = 0;
        change(k, device, n, "PROBE");
        solicit(k, device, n, true);
        arm(k, device, n, now + p.retransMs);
      }
      return;
    case "PROBE":
      if (n.probes < p.ucastSolicit) {
        solicit(k, device, n, true);
        arm(k, device, n, now + p.retransMs);
      } else fail(k, device, n, failed);
      return;
    default:
      return;
  }
}

function fail(k: Kernel, device: DeviceId, n: NeighState, failed: Failed): void {
  n.mac = null;
  change(k, device, n, "FAILED");
  const queued = n.queue;
  n.queue = [];
  for (const item of queued) failed(device, item);
}

const VALID: NeighState["state"][] = ["REACHABLE", "STALE", "DELAY", "PROBE", "PERMANENT"];

/**
 * neigh_update for what ARP says: `state` is REACHABLE for a reply sent to us, else STALE. An entry
 * that already has a link address keeps it unless `override`; a STALE update with the same address
 * leaves the state alone. Waiting packets go out once the entry has an address.
 */
function update(
  k: Kernel,
  device: DeviceId,
  n: NeighState,
  mac: Mac,
  state: "REACHABLE" | "STALE",
  override: boolean,
  flush: (q: NeighState["queue"][number], mac: Mac) => void,
): void {
  const d = deviceOf(k, device);
  if (!d || n.state === "PERMANENT") return;
  const now = k.s.t;
  const valid = VALID.includes(n.state);
  if (state === "REACHABLE") n.confirmed = now;
  let next: NeighState["state"] = state;
  if (valid) {
    if (n.mac !== mac && !override) return;
    if (n.mac === mac && state === "STALE") next = n.state;
  }
  const macChanged = n.mac !== mac;
  n.mac = mac;
  if (macChanged && next !== "REACHABLE") n.confirmed = now - 2 * parmsOf(d, n.dev).baseReachableMs;
  if (next !== n.state) {
    n.probes = 0;
    change(k, device, n, next);
    if (next === "REACHABLE") arm(k, device, n, now + parmsOf(d, n.dev).reachableMs);
    else n.stamp += 1; // STALE runs no timer
  } else if (macChanged) change(k, device, n, next);
  if (!valid) {
    const queued = n.queue;
    n.queue = [];
    for (const item of queued) flush(item, mac);
  }
}

/** neigh_event_send without a packet: start (or restart) resolving, or wake a STALE entry. */
export function neighEventSend(k: Kernel, device: DeviceId, dev: IfaceName, ip: Ip): void {
  const d = deviceOf(k, device);
  if (!d) return;
  const n = entry(d, ip, dev);
  if (!n) {
    ask(k, device, dev, ip);
    return;
  }
  if (n.state === "FAILED") {
    n.probes = 0;
    change(k, device, n, "INCOMPLETE");
    solicit(k, device, n, false);
    arm(k, device, n, k.s.t + parmsOf(d, dev).retransMs);
    return;
  }
  if (n.state === "STALE") {
    n.used = k.s.t;
    change(k, device, n, "DELAY");
    arm(k, device, n, k.s.t + parmsOf(d, dev).delayFirstProbeMs);
  }
}

/**
 * An ARP packet arrived for this machine on `dev` (arp_process). Answers requests for any of the
 * machine's addresses (arp_ignore 0), and learns from what it hears:
 * - a request for us: the asker's entry is created as STALE, or given the new address (STALE) if it
 *   changed; an unchanged valid entry keeps its state;
 * - a reply to us: an entry we have becomes REACHABLE (confirmed) and its queue goes out.
 * Unsolicited replies don't create entries (arp_accept 0).
 */
export function arpInput(
  k: Kernel,
  device: DeviceId,
  dev: IfaceName,
  payload: Uint8Array,
  sendQueued: (q: NeighState["queue"][number], mac: Mac, dev: IfaceName) => void,
  /** The frame's destination: a reply only confirms an entry when it was sent to us (not broadcast). */
  frameDst?: Mac,
): void {
  const d = deviceOf(k, device);
  const iface = ifaceOf(d, dev);
  const p = decodeArp(payload);
  if (!d || !iface || !p) return;
  const forUs = d.addrs.some((a) => a.ip === p.targetIp && a.scope === "global");
  const existing = entry(d, p.senderIp, dev);
  const flush = (q: NeighState["queue"][number], mac: Mac) => sendQueued(q, mac, dev);

  // A request from 0.0.0.0 is a probe for a duplicate address (the sender has none): answer it if
  // it's for us, but learn nothing from it (arp_process, "sip == 0").
  const fromNowhere = p.senderIp === "0.0.0.0";
  if (p.op === ARP_REQUEST && forUs && fromNowhere) {
    const reply = encodeArp({
      op: ARP_REPLY,
      senderMac: iface.mac,
      senderIp: p.targetIp,
      targetMac: p.senderMac,
      targetIp: p.senderIp,
    });
    k.send(device, dev, encodeEth({ dst: p.senderMac, src: iface.mac, type: ETHERTYPE.arp, payload: reply }), "kernel");
    return;
  }
  if (fromNowhere) return;
  if (p.op === ARP_REQUEST && forUs) {
    if (!existing) {
      const n = newEntry(p.senderIp, dev, p.senderMac, "STALE", k.s.t);
      d.neigh.push(n);
      k.emit({
        kind: "table.change",
        t: k.s.t,
        device,
        table: "neigh",
        op: "add",
        key: `${n.ip} dev ${dev}`,
        before: null,
        after: { state: "STALE", mac: n.mac },
      });
    } else if (existing.state === "INCOMPLETE" || existing.state === "FAILED") {
      // Their request tells us their address: resolved but not confirmed (STALE); the queue goes.
      existing.mac = p.senderMac;
      change(k, device, existing, "STALE");
      const queued = existing.queue;
      existing.queue = [];
      for (const q of queued) flush(q, p.senderMac);
    } else if (existing.state !== "PERMANENT" && existing.mac !== p.senderMac) {
      existing.mac = p.senderMac;
      change(k, device, existing, "STALE");
    }
    const reply = encodeArp({
      op: ARP_REPLY,
      senderMac: iface.mac,
      senderIp: p.targetIp,
      targetMac: p.senderMac,
      targetIp: p.senderIp,
    });
    k.send(device, dev, encodeEth({ dst: p.senderMac, src: iface.mac, type: ETHERTYPE.arp, payload: reply }), "kernel");
    return;
  }
  // Anything else heard from an address we know: a reply, or a request for someone else.
  if (!existing || existing.state === "PERMANENT") return;
  const garp = p.senderIp === p.targetIp;
  const override = k.s.t > existing.updated + LOCKTIME_MS || garp;
  const toUs = frameDst === undefined || frameDst === iface.mac;
  update(k, device, existing, p.senderMac, p.op === ARP_REPLY && toUs ? "REACHABLE" : "STALE", override, flush);
}

/** A door went down or lost its cable: Linux forgets what it knew on it (neigh_ifdown). */
export function neighFlushDev(k: Kernel, device: DeviceId, dev: IfaceName, failed: Failed): void {
  const d = deviceOf(k, device);
  if (!d) return;
  for (const n of d.neigh.filter((x) => x.dev === dev && x.state !== "PERMANENT")) {
    const queued = n.queue;
    d.neigh = d.neigh.filter((x) => x !== n);
    k.emit({
      kind: "table.change",
      t: k.s.t,
      device,
      table: "neigh",
      op: "del",
      key: `${n.ip} dev ${dev}`,
      before: { state: n.state, mac: n.mac },
      after: null,
    });
    for (const q of queued) failed(device, q);
  }
}

/** `ip neigh del <ip> dev <dev>`: true if there was such an entry. */
export function neighDelete(k: Kernel, device: DeviceId, ip: Ip, dev: IfaceName): boolean {
  const d = deviceOf(k, device);
  const n = d && entry(d, ip, dev);
  if (!d || !n) return false;
  d.neigh = d.neigh.filter((x) => x !== n);
  k.emit({
    kind: "table.change",
    t: k.s.t,
    device,
    table: "neigh",
    op: "del",
    key: `${n.ip} dev ${dev}`,
    before: { state: n.state, mac: n.mac },
    after: null,
  });
  return true;
}

/** `ip neigh flush dev <dev>`: everything but permanent entries goes. */
export function neighFlush(k: Kernel, device: DeviceId, dev: IfaceName): void {
  const d = deviceOf(k, device);
  if (!d) return;
  for (const n of d.neigh.filter((x) => x.dev === dev && x.state !== "PERMANENT")) neighDelete(k, device, n.ip, dev);
}

/** `ip neigh add|replace <ip> lladdr <mac> dev <dev> nud permanent`. */
export function neighAddPermanent(
  k: Kernel,
  device: DeviceId,
  ip: Ip,
  mac: Mac,
  dev: IfaceName,
  replace: boolean,
): "ok" | "exists" {
  const d = deviceOf(k, device);
  if (!d) return "exists";
  const existing = entry(d, ip, dev);
  if (existing && !replace) return "exists";
  if (existing) d.neigh = d.neigh.filter((x) => x !== existing);
  const n = newEntry(ip, dev, mac, "PERMANENT", k.s.t);
  d.neigh.push(n);
  k.emit({
    kind: "table.change",
    t: k.s.t,
    device,
    table: "neigh",
    op: "add",
    key: `${ip} dev ${dev}`,
    before: existing ? { state: existing.state, mac: existing.mac } : null,
    after: { state: "PERMANENT", mac },
  });
  return "ok";
}

/**
 * Asking by hand (`lab keeper arp-ask`): a broadcast "who has <ip>?" out of `dev`. The entry is made
 * (INCOMPLETE) if there isn't one, so the answer is written down as usual.
 */
export function ask(k: Kernel, device: DeviceId, dev: IfaceName, ip: Ip): void {
  const d = deviceOf(k, device);
  if (!d) return;
  let n = entry(d, ip, dev);
  if (!n) {
    n = newEntry(ip, dev, null, "INCOMPLETE", k.s.t);
    d.neigh.push(n);
    k.emit({
      kind: "table.change",
      t: k.s.t,
      device,
      table: "neigh",
      op: "add",
      key: `${ip} dev ${dev}`,
      before: null,
      after: { state: "INCOMPLETE", mac: null },
    });
    solicit(k, device, n, false);
    arm(k, device, n, k.s.t + parmsOf(d, dev).retransMs);
    return;
  }
  solicit(k, device, n, false);
}
