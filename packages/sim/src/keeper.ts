/**
 * Hand mode (0042): a device's keeper has forgotten its job, so messages wait at its desk and the
 * player does each step, for real. Every hand step is the same function the automatic path runs
 * (SIM-06): learning, forwarding and flooding are bridge.ts's; asking is the neighbour layer's
 * solicitation; wrapping and forwarding are inet.ts's framing and TTL handling.
 *
 * Three desks:
 * - "switch" (3.1): frames entering the bridge wait; `learn <MAC> <door>`, then `send <door>|flood`.
 * - "host" (6.1): packets the machine sends wait before they're framed; `arp-ask <IP>` (the answer is
 *   written to the ledger as usual), then `wrap <MAC>`.
 * - "router" (8.5): with forwarding off, packets for other streets wait on the lectern instead of
 *   being dropped; `arp-ask <IP>`, then `forward <MAC>` (one off the TTL, a new frame, sent).
 * Waking: the room decides for the switch and the host (`wakeKeeper`); the router wakes when its
 * forwarding is switched on. Then whatever is waiting goes through the normal path, in order.
 */
import { bridgeEgress, bridgeInput, learnFrom } from "./bridge";
import { forwardPacket, frameOut, lookupRoute, outputPacket } from "./inet";
import { deviceOf, ifaceOf, type Kernel } from "./kernel";
import { type Mac, parseMac } from "./mac";
import { ask } from "./neigh";
import { decodeEth, fromHex, toHex } from "./proto/ethernet";
import { decodeIPv4 } from "./proto/ipv4";
import type { DeskItem, DeviceId, DeviceState, IfaceName, Ip } from "./types";

export type KeeperResult =
  | { ok: true }
  | { ok: false; error: "not-asleep" | "empty" | "bad-mac" | "bad-ip" | "no-door" | "no-route" | "wrong-desk" };

function desk(d: DeviceState): DeskItem[] {
  return d.keeper.desk;
}

/** A message reaches an asleep keeper: it waits at the desk. */
export function hold(k: Kernel, device: DeviceId, item: DeskItem): void {
  const d = deviceOf(k, device);
  if (!d) return;
  d.keeper.desk.push(item);
  const bytes = fromHex(item.hex);
  const summary = item.kind === "frame" ? decodeEth(bytes).src : decodeIPv4(bytes).dst;
  k.emit({
    kind: "keeper.hold",
    t: k.s.t,
    device,
    desk: d.keeper.asleep ?? "switch",
    frameId: item.frameId,
    about: summary,
  });
}

function step(k: Kernel, device: DeviceId, action: string, args: string[], frameId: number | null): void {
  k.emit({ kind: "keeper.step", t: k.s.t, device, action, args, frameId });
}

function needs(d: DeviceState | undefined, kind: NonNullable<DeviceState["keeper"]["asleep"]>): KeeperResult | null {
  if (!d || d.keeper.asleep === null) return { ok: false, error: "not-asleep" };
  if (d.keeper.asleep !== kind) return { ok: false, error: "wrong-desk" };
  return null;
}

// ── The switch (3.1) ───────────────────────────────────────────────────────────────────────

/** `lab keeper learn <MAC> <door>`: write it on the board, as learning would. */
export function keeperLearn(k: Kernel, device: DeviceId, mac: string, door: IfaceName): KeeperResult {
  const d = deviceOf(k, device);
  const bad = needs(d, "switch");
  if (bad) return bad;
  const m = parseMac(mac);
  if (!m) return { ok: false, error: "bad-mac" };
  const port = ifaceOf(d, door);
  if (!port?.master) return { ok: false, error: "no-door" };
  learnFrom(k, device, port.master, m, door);
  step(k, device, "learn", [m, door], desk(d as DeviceState)[0]?.frameId ?? null);
  return { ok: true };
}

/** `lab keeper send <door>|flood`: the waiting frame leaves, as the bridge would send it. */
export function keeperSend(k: Kernel, device: DeviceId, where: string): KeeperResult {
  const d = deviceOf(k, device);
  const bad = needs(d, "switch");
  if (bad) return bad;
  const item = desk(d as DeviceState)[0];
  if (!item) return { ok: false, error: "empty" };
  if (where !== "flood" && !ifaceOf(d, where)?.master) return { ok: false, error: "no-door" };
  (d as DeviceState).keeper.desk.shift();
  step(k, device, "send", [where], item.frameId);
  bridgeEgress(
    k,
    device,
    item.port as IfaceName,
    item.frameId,
    fromHex(item.hex),
    where === "flood" ? "flood" : where,
    true,
  );
  return { ok: true };
}

// ── The house (6.1) and the router (8.5) ───────────────────────────────────────────────────

/** `lab keeper arp-ask <IP>`: ask everyone on the right door who has it (the answer is written down). */
export function keeperAsk(k: Kernel, device: DeviceId, ip: Ip): KeeperResult {
  const d = deviceOf(k, device);
  if (!d || (d.keeper.asleep !== "host" && d.keeper.asleep !== "router")) return { ok: false, error: "not-asleep" };
  const r = lookupRoute(d, ip);
  if (!r) return { ok: false, error: "no-route" };
  step(k, device, "arp-ask", [ip], desk(d)[0]?.frameId ?? null);
  ask(k, device, r.dev, ip);
  return { ok: true };
}

/** `lab keeper wrap <MAC>` (house): the waiting packet goes into a frame to that door name, and out. */
export function keeperWrap(k: Kernel, device: DeviceId, mac: string): KeeperResult {
  const d = deviceOf(k, device);
  const bad = needs(d, "host");
  if (bad) return bad;
  return sendHeld(k, device, d as DeviceState, mac, "wrap", false);
}

/** `lab keeper forward <MAC>` (router): one off the TTL, a new frame to that door name, out. */
export function keeperForward(k: Kernel, device: DeviceId, mac: string): KeeperResult {
  const d = deviceOf(k, device);
  const bad = needs(d, "router");
  if (bad) return bad;
  return sendHeld(k, device, d as DeviceState, mac, "forward", true);
}

function sendHeld(
  k: Kernel,
  device: DeviceId,
  d: DeviceState,
  mac: string,
  action: string,
  forward: boolean,
): KeeperResult {
  const item = desk(d)[0];
  if (!item) return { ok: false, error: "empty" };
  const m: Mac | null = parseMac(mac);
  if (!m) return { ok: false, error: "bad-mac" };
  const packet = fromHex(item.hex);
  const r = lookupRoute(d, decodeIPv4(packet).dst);
  if (!r) return { ok: false, error: "no-route" };
  d.keeper.desk.shift();
  step(k, device, action, [m], item.frameId);
  const out = forward ? forwardPacket(k, device, item.port as IfaceName, item.frameId, packet, m) : packet;
  if (out)
    frameOut(k, device, r.dev, m, { hex: toHex(out), origin: forward ? "forward" : "keeper", parent: item.frameId });
  return { ok: true };
}

// ── Waking ─────────────────────────────────────────────────────────────────────────────────

/** The keeper remembers: it takes over, and what was waiting goes through the normal path. */
export function wakeKeeper(k: Kernel, device: DeviceId): boolean {
  const d = deviceOf(k, device);
  if (!d || d.keeper.asleep === null) return false;
  const kind = d.keeper.asleep;
  d.keeper.asleep = null;
  const waiting = d.keeper.desk;
  d.keeper.desk = [];
  k.emit({ kind: "keeper.step", t: k.s.t, device, action: "wake", args: [], frameId: null });
  for (const item of waiting) {
    const bytes = fromHex(item.hex);
    if (kind === "switch") bridgeInput(k, device, item.port as IfaceName, item.frameId, bytes);
    else if (kind === "host") outputPacket(k, device, bytes, item.frameId);
    else forwardPacket(k, device, item.port as IfaceName, item.frameId, bytes, null);
  }
  return true;
}
