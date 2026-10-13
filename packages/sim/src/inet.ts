/**
 * IPv4: addresses, the routing table, and the packet path as Linux runs it (tech/simulator.md):
 * - receive: header and checksum check; for us (any of our addresses, or broadcast) → deliver
 *   (ICMP echo → reply; ICMP errors and replies → the ping that's waiting; UDP → port unreachable);
 *   not for us → forward if net.ipv4.ip_forward is 1 (TTL, route, neighbour), else drop quietly;
 * - send: route lookup (longest prefix; none → "Network is unreachable"), source address, neighbour
 *   resolution, frame.
 * Linux behaviours kept: taking a door down removes every route through it and forgets its
 * neighbours; an address brings its connected route (proto kernel scope link src …) while its door
 * is up; ICMP errors are rate-limited per destination (icmp_ratelimit 1000 ms, burst 6).
 * ICMP redirects (measured, tools/golden/capture-redirect.sh): a router forwarding a packet back out
 * of the door it came in on, when the sender is directly on that door's street, tells the sender of
 * the better next hop (send_redirects), at most as often as ip_rt_send_redirect allows (load 20 ms
 * doubling per redirect, 9 at most, reset after 20.48 s of quiet); a redirect resets the same
 * per-destination bucket ICMP errors draw on. A host (accept_redirects; a router doesn't, because
 * turning forwarding on clears conf.all.accept_redirects) whose route goes through the redirecting
 * router keeps a route exception for that destination for 300 s, once the new gateway's address is
 * known (otherwise it only asks for it).
 */
import { broadcastOf, inSubnet, ipToInt, networkOf, parseCidr, routeNet } from "./addr";
import { dhcpUdp } from "./dhcp";
import { hold } from "./keeper";
import { deviceOf, ifaceOf, type Kernel } from "./kernel";
import { BROADCAST, type Mac } from "./mac";
import { messengerHears } from "./messenger";
import { arpInput, neighEventSend, neighFlushDev, resolve } from "./neigh";
import { pingHears } from "./ping";
import { decodeEth, ETHERTYPE, encodeEth, fromHex, toHex } from "./proto/ethernet";
import { decodeIcmp, encodeIcmp, ICMP, UNREACH } from "./proto/icmp";
import { decodeIPv4, decodeUDP, encodeIPv4, IPPROTO } from "./proto/ipv4";
import type {
  AddrState,
  DeviceId,
  DeviceState,
  FrameOrigin,
  IfaceName,
  Ip,
  NeighState,
  RouteException,
  RouteState,
} from "./types";

export const SYSCTL_DEFAULTS: Record<string, string> = {
  "net.ipv4.ip_forward": "0",
  "net.ipv4.icmp_echo_ignore_broadcasts": "1",
  "net.ipv4.icmp_ratelimit": "1000",
  "net.ipv4.icmp_ratemask": "6168",
  "net.ipv4.ip_default_ttl": "64",
  "net.ipv4.conf.all.send_redirects": "1",
  "net.ipv4.conf.all.forwarding": "0",
};

const ICMP_BURST = 6;
/** Linux quotes as much of the original packet as fits in a 576-byte reply (RFC 1812). */
const ICMP_QUOTE_MAX = 576 - 20 - 8;

export function sysctl(d: DeviceState, key: string): string | undefined {
  return d.sysctl[key] ?? SYSCTL_DEFAULTS[key];
}

function forwarding(d: DeviceState): boolean {
  return sysctl(d, "net.ipv4.ip_forward") === "1";
}

// ── Addresses ──────────────────────────────────────────────────────────────────────────────

export function isLocal(d: DeviceState, ip: Ip): boolean {
  return d.addrs.some((a) => a.ip === ip) || ip.startsWith("127.");
}

/** 255.255.255.255, or the broadcast address of a subnet we're on. */
function isBroadcastFor(d: DeviceState, ip: Ip): boolean {
  return (
    ip === "255.255.255.255" ||
    d.addrs.some((a) => a.broadcast === ip || (a.prefix < 31 && broadcastOf(a.ip, a.prefix) === ip))
  );
}

function connectedRoute(a: AddrState): RouteState {
  return {
    dst: `${networkOf(a.ip, a.prefix)}/${a.prefix}`,
    via: null,
    dev: a.dev,
    proto: "kernel",
    scope: "link",
    src: a.ip,
    metric: null,
  };
}

function sameRoute(a: RouteState, b: RouteState): boolean {
  return a.dst === b.dst && a.dev === b.dev && a.via === b.via;
}

function addRoute(k: Kernel, device: DeviceId, r: RouteState): void {
  const d = deviceOf(k, device);
  if (!d || d.routes.some((x) => sameRoute(x, r))) return;
  d.routes.push(r);
  k.emit({
    kind: "table.change",
    t: k.s.t,
    device,
    table: "route",
    op: "add",
    key: r.dst,
    before: null,
    after: { ...r },
  });
}

function removeRoutes(k: Kernel, device: DeviceId, which: (r: RouteState) => boolean): void {
  const d = deviceOf(k, device);
  if (!d) return;
  for (const r of d.routes.filter(which)) {
    d.routes = d.routes.filter((x) => x !== r);
    k.emit({
      kind: "table.change",
      t: k.s.t,
      device,
      table: "route",
      op: "del",
      key: r.dst,
      before: { ...r },
      after: null,
    });
  }
  // A route exception hangs on its nexthop: when no route uses that nexthop any more, it goes too.
  if (d.exceptions?.length) d.exceptions = d.exceptions.filter((e) => d.routes.some((r) => nhKey(r) === e.nh));
}

export type AddrResult = { ok: true } | { ok: false; error: "exists" | "missing" | "no-dev" | "bad" };

function samePrefix(a: AddrState, ip: Ip, prefix: number): boolean {
  return a.prefix === prefix && networkOf(a.ip, a.prefix) === networkOf(ip, prefix);
}

/**
 * `ip addr add`: a second address in a subnet the door already has is `secondary` and brings no
 * route of its own; a bare address is a /32 and brings none either. No broadcast address unless
 * one is given (`brd`), as iproute2 6.x adds it.
 */
export function addrAdd(k: Kernel, device: DeviceId, cidr: string, dev: IfaceName): AddrResult {
  const d = deviceOf(k, device);
  const iface = ifaceOf(d, dev);
  const c = parseCidr(cidr);
  if (!d || !iface) return { ok: false, error: "no-dev" };
  if (!c) return { ok: false, error: "bad" };
  if (d.addrs.some((a) => a.dev === dev && a.ip === c.ip && a.prefix === c.prefix))
    return { ok: false, error: "exists" };
  const secondary = d.addrs.some((a) => a.dev === dev && !a.secondary && samePrefix(a, c.ip, c.prefix));
  const a: AddrState = { dev, ip: c.ip, prefix: c.prefix, broadcast: null, scope: "global", secondary };
  d.addrs.push(a);
  k.emit({
    kind: "table.change",
    t: k.s.t,
    device,
    table: "addr",
    op: "add",
    key: `${c.ip}/${c.prefix} dev ${dev}`,
    before: null,
    after: { ...a },
  });
  if (iface.adminUp && !secondary && c.prefix < 32) addRoute(k, device, connectedRoute(a));
  return { ok: true };
}

function dropAddr(k: Kernel, device: DeviceId, d: DeviceState, a: AddrState): void {
  d.addrs = d.addrs.filter((x) => x !== a);
  k.emit({
    kind: "table.change",
    t: k.s.t,
    device,
    table: "addr",
    op: "del",
    key: `${a.ip}/${a.prefix} dev ${a.dev}`,
    before: { ...a },
    after: null,
  });
  removeRoutes(k, device, (r) => r.dev === a.dev && r.src === a.ip);
}

/** The last IPv4 address on a door went: Linux disables IP there; every route through it and every neighbour on it go. */
function afterRemoval(k: Kernel, device: DeviceId, d: DeviceState, dev: IfaceName): void {
  if (d.addrs.some((a) => a.dev === dev)) return;
  removeRoutes(k, device, (r) => r.dev === dev);
  // fib_disable_ip also runs arp_ifdown: the door's neighbours are forgotten (measured).
  neighFlushDev(k, device, dev, (dv, q) => queuedFailed(k, dv, q));
}

/**
 * `ip addr del`: with a prefix, that exact address; without, the first with that address (iproute2's
 * wildcard delete). Deleting a primary deletes its secondaries too (promote_secondaries is 0).
 */
export function addrDel(k: Kernel, device: DeviceId, cidr: string, dev: IfaceName): AddrResult {
  const d = deviceOf(k, device);
  const c = parseCidr(cidr);
  if (!d || !ifaceOf(d, dev)) return { ok: false, error: "no-dev" };
  if (!c) return { ok: false, error: "bad" };
  const a = d.addrs.find((x) => x.dev === dev && x.ip === c.ip && (cidr.includes("/") ? x.prefix === c.prefix : true));
  if (!a) return { ok: false, error: "missing" };
  if (!a.secondary)
    for (const s of d.addrs.filter((x) => x.dev === dev && x.secondary && samePrefix(x, a.ip, a.prefix)))
      dropAddr(k, device, d, s);
  dropAddr(k, device, d, a);
  afterRemoval(k, device, d, dev);
  return { ok: true };
}

/** `ip addr flush dev <dev>`: every IPv4 address on the door. */
export function addrFlush(k: Kernel, device: DeviceId, dev: IfaceName): void {
  const d = deviceOf(k, device);
  if (!d) return;
  for (const a of d.addrs.filter((x) => x.dev === dev)) dropAddr(k, device, d, a);
  afterRemoval(k, device, d, dev);
}

/** A door came up: its addresses' connected routes return (fib_add_ifaddr on NETDEV_UP). */
export function onIfaceUp(k: Kernel, device: DeviceId, dev: IfaceName): void {
  const d = deviceOf(k, device);
  if (!d) return;
  for (const a of d.addrs.filter((x) => x.dev === dev && !x.secondary && x.prefix < 32))
    addRoute(k, device, connectedRoute(a));
}

/** A door was switched off: every route through it goes, and its neighbours are forgotten. */
export function onIfaceDown(k: Kernel, device: DeviceId, dev: IfaceName): void {
  removeRoutes(k, device, (r) => r.dev === dev);
  neighFlushDev(k, device, dev, (dv, q) => queuedFailed(k, dv, q));
}

/** A door lost its carrier (cable out, far end off): neighbours forgotten, routes kept ("linkdown"). */
export function onCarrierDown(k: Kernel, device: DeviceId, dev: IfaceName): void {
  neighFlushDev(k, device, dev, (dv, q) => queuedFailed(k, dv, q));
}

// ── Routes ─────────────────────────────────────────────────────────────────────────────────

export type RouteResult =
  | { ok: true }
  | { ok: false; error: "exists" | "missing" | "unreachable-gw" | "no-dev" | "bad" | "host-bits" };

function parseDst(text: string): { dst: string; hostBits: boolean } | null {
  if (text === "default" || text === "0.0.0.0/0") return { dst: "default", hostBits: false };
  const c = parseCidr(text);
  if (!c) return null;
  const net = networkOf(c.ip, c.prefix);
  return { dst: c.prefix === 32 ? c.ip : `${net}/${c.prefix}`, hostBits: net !== c.ip };
}

/**
 * `ip route add|replace`, with Linux's checks in its order: the prefix has no host bits; there is a
 * door (named, or the gateway's); a gateway is reachable through a scope-link route on an up door;
 * the destination isn't there already (unless replacing).
 */
export function routeAdd(
  k: Kernel,
  device: DeviceId,
  spec: { dst: string; via?: Ip; dev?: IfaceName },
  replace = false,
): RouteResult {
  const d = deviceOf(k, device);
  if (!d) return { ok: false, error: "no-dev" };
  const p = parseDst(spec.dst);
  if (!p) return { ok: false, error: "bad" };
  if (p.hostBits) return { ok: false, error: "host-bits" };
  let dev = spec.dev;
  if (spec.via) {
    const onLink = d.routes.find(
      (r) =>
        r.scope === "link" &&
        (!dev || r.dev === dev) &&
        !!ifaceOf(d, r.dev)?.adminUp &&
        inSubnet(spec.via as Ip, routeNet(r.dst).net, routeNet(r.dst).prefix),
    );
    if (!onLink) return { ok: false, error: "unreachable-gw" };
    dev = dev ?? onLink.dev;
  }
  if (!dev || !ifaceOf(d, dev)) return { ok: false, error: "no-dev" };
  const r: RouteState = {
    dst: p.dst,
    via: spec.via ?? null,
    dev,
    proto: "boot",
    scope: spec.via ? "global" : "link",
    src: null,
    metric: null,
  };
  const existing = d.routes.find((x) => x.dst === p.dst);
  if (existing && !replace) return { ok: false, error: "exists" };
  if (existing) removeRoutes(k, device, (x) => x === existing);
  addRoute(k, device, r);
  return { ok: true };
}

export function routeDel(k: Kernel, device: DeviceId, spec: { dst: string; via?: Ip; dev?: IfaceName }): RouteResult {
  const d = deviceOf(k, device);
  if (!d) return { ok: false, error: "no-dev" };
  const p = parseDst(spec.dst);
  if (!p) return { ok: false, error: "bad" };
  const r = d.routes.find(
    (x) => x.dst === p.dst && (!spec.via || x.via === spec.via) && (!spec.dev || x.dev === spec.dev),
  );
  if (!r) return { ok: false, error: "missing" };
  removeRoutes(k, device, (x) => x === r);
  return { ok: true };
}

/** The main table in the order `ip route` lists it (the kernel's prefix tree: by address, then length). */
export function routesInOrder(d: Readonly<DeviceState>): RouteState[] {
  return [...d.routes].sort((a, b) => {
    const x = routeNet(a.dst);
    const y = routeNet(b.dst);
    return (ipToInt(x.net) ?? 0) - (ipToInt(y.net) ?? 0) || x.prefix - y.prefix;
  });
}

/** The nexthop a route exception belongs to (Linux shares one fib_info between identical nexthops). */
export function nhKey(r: RouteState): string {
  return `${r.via}|${r.dev}|${r.proto}`;
}

/** The live route exception for `dst` through route `r`, if any. */
function exceptionFor(d: Readonly<DeviceState>, r: RouteState, dst: Ip, now: number): RouteException | undefined {
  const key = nhKey(r);
  return d.exceptions?.find((e) => e.dst === dst && e.nh === key && e.expires > now);
}

/**
 * The route a packet to `dst` takes now: the longest-prefix match, with its gateway replaced by a
 * redirect's route exception if one is live (`now` given). Without `now`, the table alone.
 */
export function lookupRoute(d: DeviceState, dst: Ip, now?: number): RouteState | null {
  const r = tableLookup(d, dst);
  if (!r || now === undefined) return r;
  const e = exceptionFor(d, r, dst, now);
  if (!e) return r;
  e.bound = true;
  return { ...r, via: e.gw };
}

/** Longest-prefix match over the main table (lookups skip routes whose door is down). */
function tableLookup(d: DeviceState, dst: Ip): RouteState | null {
  let best: RouteState | null = null;
  let bestPrefix = -1;
  for (const r of d.routes) {
    const { net, prefix } = routeNet(r.dst);
    if (!inSubnet(dst, net, prefix)) continue;
    if (!ifaceOf(d, r.dev)?.adminUp) continue;
    if (prefix > bestPrefix) {
      best = r;
      bestPrefix = prefix;
    }
  }
  return best;
}

/** `ip route get <addr>`: where a packet to it would go, and from which address. */
export type RouteGet =
  | { kind: "local"; dst: Ip }
  | {
      kind: "unicast";
      dst: Ip;
      via: Ip | null;
      dev: IfaceName;
      src: Ip;
      /** A redirect's exception: ms until it expires (`cache <redirected> expires Nsec`). */
      redirected?: number;
    }
  | { kind: "unreachable" };

export function routeGet(d: DeviceState, dst: Ip, now?: number): RouteGet {
  if (isLocal(d, dst)) return { kind: "local", dst };
  const base = tableLookup(d, dst);
  if (!base) return { kind: "unreachable" };
  const e = now === undefined ? undefined : exceptionFor(d, base, dst, now);
  const r = e ? { ...base, via: e.gw } : base;
  return {
    kind: "unicast",
    dst,
    via: r.via,
    dev: r.dev,
    src: sourceFor(d, r, dst) ?? "0.0.0.0",
    ...(e && now !== undefined ? { redirected: e.expires - now } : {}),
  };
}

/**
 * `ip route show cache`: the route exceptions, listed under each route that shares their nexthop, in
 * table order (so one exception shows twice when two routes share a gateway, as on Linux).
 */
export function routeCache(d: Readonly<DeviceState>, now: number): { dst: Ip; gw: Ip; dev: IfaceName; ms: number }[] {
  const out: { dst: Ip; gw: Ip; dev: IfaceName; ms: number }[] = [];
  for (const r of routesInOrder(d))
    for (const e of d.exceptions ?? [])
      if (e.nh === nhKey(r) && e.expires > now && e.bound)
        out.push({ dst: e.dst, gw: e.gw, dev: e.dev, ms: e.expires - now });
  return out;
}

/** `ip route flush cache`: every route exception goes (Linux bumps the exceptions' generation). */
export function routeFlushCache(k: Kernel, device: DeviceId): void {
  const d = deviceOf(k, device);
  if (d) d.exceptions = [];
}

function sourceFor(d: DeviceState, r: RouteState, dst: Ip): Ip | null {
  if (r.src) return r.src;
  const onDev = d.addrs.filter((a) => a.dev === r.dev && a.scope === "global");
  const hop = r.via ?? dst;
  return (
    (onDev.find((a) => inSubnet(hop, a.ip, a.prefix)) ?? onDev[0] ?? d.addrs.find((a) => a.scope === "global"))?.ip ??
    null
  );
}

// ── Sending ────────────────────────────────────────────────────────────────────────────────

export type SendIpResult = { ok: true } | { ok: false; error: "unreachable" };

/** A packet this machine originates (a ping, an ICMP error, a reply). */
export function sendIp(
  k: Kernel,
  device: DeviceId,
  p: { dst: Ip; proto: number; payload: Uint8Array; ttl?: number; src?: Ip; df?: boolean; tos?: number },
  origin: FrameOrigin,
  parent: number | null = null,
): SendIpResult {
  const d = deviceOf(k, device);
  if (!d) return { ok: false, error: "unreachable" };
  const id = d.ipId;
  d.ipId = (d.ipId + 1) & 0xffff;
  // To ourselves: through the loopback, never onto a cable.
  if (isLocal(d, p.dst)) {
    const bytes = encodeIPv4({
      src: p.src ?? p.dst,
      dst: p.dst,
      proto: p.proto,
      ttl: p.ttl ?? 64,
      id,
      df: p.df ?? true,
      tos: p.tos,
      payload: p.payload,
    });
    ipLocal(k, device, "lo", null, decodeIPv4(bytes), bytes);
    return { ok: true };
  }
  const r = lookupRoute(d, p.dst, k.s.t);
  if (!r) return { ok: false, error: "unreachable" };
  const src = p.src ?? sourceFor(d, r, p.dst) ?? "0.0.0.0";
  const bytes = encodeIPv4({
    src,
    dst: p.dst,
    proto: p.proto,
    ttl: p.ttl ?? Number(sysctl(d, "net.ipv4.ip_default_ttl")),
    id,
    df: p.df ?? true,
    tos: p.tos,
    payload: p.payload,
  });
  output(k, device, r, p.dst, bytes, origin, parent);
  return { ok: true };
}

/** Puts an IPv4 packet onto `r.dev` toward its next hop (resolving the neighbour if needed). */
function output(
  k: Kernel,
  device: DeviceId,
  r: RouteState,
  dst: Ip,
  packet: Uint8Array,
  origin: FrameOrigin,
  parent: number | null,
): void {
  const d = deviceOf(k, device);
  const iface = ifaceOf(d, r.dev);
  if (!d || !iface) return;
  if (isBroadcastFor(d, dst)) {
    k.send(
      device,
      r.dev,
      encodeEth({ dst: BROADCAST, src: iface.mac, type: ETHERTYPE.ipv4, payload: packet }),
      origin,
      parent ?? undefined,
    );
    return;
  }
  // A house whose keeper has forgotten how to address envelopes (hand mode, 0042): its own packets
  // wait at the desk, unwrapped.
  if (d.keeper.asleep === "host" && origin !== "forward") {
    hold(k, device, { kind: "packet", hex: toHex(packet), port: r.dev, frameId: parent ?? 0 });
    return;
  }
  const hop = r.via ?? dst;
  const waiting = { hex: toHex(packet), origin, parent };
  const mac = resolve(k, device, r.dev, hop, waiting);
  if (mac) frameOut(k, device, r.dev, mac, waiting);
}

/** A held packet of this machine's own goes out the normal way (when its keeper wakes). */
export function outputPacket(k: Kernel, device: DeviceId, packet: Uint8Array, parent: number): void {
  const d = deviceOf(k, device);
  const dst = decodeIPv4(packet).dst;
  const r = d && lookupRoute(d, dst, k.s.t);
  if (r) output(k, device, r, dst, packet, "kernel", parent || null);
}

export function frameOut(k: Kernel, device: DeviceId, dev: IfaceName, mac: Mac, q: NeighState["queue"][number]): void {
  const iface = ifaceOf(deviceOf(k, device), dev);
  if (!iface) return;
  const bytes = encodeEth({ dst: mac, src: iface.mac, type: ETHERTYPE.ipv4, payload: fromHex(q.hex) });
  k.send(device, dev, bytes, q.origin, q.parent ?? undefined);
}

/** Resolution failed for a waiting packet: forwarded ones earn the sender an ICMP host unreachable. */
export function queuedFailed(k: Kernel, device: DeviceId, q: NeighState["queue"][number]): void {
  const packet = fromHex(q.hex);
  const ip = decodeIPv4(packet);
  const d = deviceOf(k, device);
  if (!d) return;
  if (isLocal(d, ip.src)) {
    // Our own packet: the local sender (ping) hears "Destination Host Unreachable" from us.
    localError(k, device, ip.src, ip, packet, UNREACH.host, ICMP.unreachable);
    return;
  }
  icmpError(k, device, packet, ICMP.unreachable, UNREACH.host, q.parent ?? 0);
}

// ── Receiving ──────────────────────────────────────────────────────────────────────────────

/** A frame for this machine (after the MAC check) on `dev`: by EtherType. */
export function inetInput(k: Kernel, device: DeviceId, dev: IfaceName, frameId: number, bytes: Uint8Array): boolean {
  const f = decodeEth(bytes);
  if (f.type === ETHERTYPE.arp) {
    arpInput(k, device, dev, f.payload, (q, mac, outDev) => frameOut(k, device, outDev, mac, q), f.dst);
    return true;
  }
  if (f.type !== ETHERTYPE.ipv4) return false;
  const d = deviceOf(k, device);
  if (!d) return true;
  const ip = decodeIPv4(f.payload);
  if (ip.version !== 4 || !ip.checksumOk) {
    k.emit({ kind: "frame.drop", t: k.s.t, device, iface: dev, frameId, reason: "bad-checksum" });
    return true;
  }
  const packet = f.payload.subarray(0, ip.totalLength);
  if (isLocal(d, ip.dst) || isBroadcastFor(d, ip.dst)) {
    k.emit({
      kind: "fwd.decision",
      t: k.s.t,
      device,
      frameId,
      layer: "l3",
      decision: "deliver",
      egress: [],
      tableRef: { dst: f.dst, ip: ip.dst, route: null },
    });
    ipLocal(k, device, dev, frameId, ip, packet);
    return true;
  }
  forward(k, device, dev, frameId, f.dst, ip, packet);
  return true;
}

function forward(
  k: Kernel,
  device: DeviceId,
  inDev: IfaceName,
  frameId: number,
  frameDst: Mac,
  ip: ReturnType<typeof decodeIPv4>,
  packet: Uint8Array,
): void {
  const d = deviceOf(k, device);
  if (!d) return;
  const t = k.s.t;
  const drop = (reason: "forwarding-disabled" | "ttl-expired" | "no-route", route: RouteState | null) => {
    k.emit({
      kind: "fwd.decision",
      t,
      device,
      frameId,
      layer: "l3",
      decision: "drop",
      egress: [],
      tableRef: { dst: frameDst, ip: ip.dst, route: route && { dst: route.dst, via: route.via, dev: route.dev } },
    });
    k.emit({ kind: "frame.drop", t, device, iface: inDev, frameId, reason });
  };
  // A host with forwarding off drops it quietly (Linux sends nothing back), unless its navigator
  // is asleep at the lectern (hand mode, 0042): then the packet waits there.
  if (!forwarding(d)) {
    if (d.keeper.asleep === "router") {
      hold(k, device, { kind: "packet", hex: toHex(packet), port: inDev, frameId });
      return;
    }
    drop("forwarding-disabled", null);
    return;
  }
  if (ip.ttl <= 1) {
    drop("ttl-expired", null);
    icmpError(k, device, packet, ICMP.timeExceeded, 0, frameId);
    return;
  }
  const r = lookupRoute(d, ip.dst, k.s.t);
  if (!r) {
    drop("no-route", null);
    if (allowRoutingError(k, d, ip.src)) icmpError(k, device, packet, ICMP.unreachable, UNREACH.net, frameId);
    return;
  }
  k.emit({
    kind: "fwd.decision",
    t,
    device,
    frameId,
    layer: "l3",
    decision: "forward",
    egress: [r.dev],
    tableRef: { dst: frameDst, ip: ip.dst, route: { dst: r.dst, via: r.via, dev: r.dev } },
  });
  const out = decrementTtl(packet);
  // Back out of the door it came in on, from a sender on that street: tell the sender (after the
  // TTL decrement, so the quoted header shows the new TTL), then forward it anyway.
  if (r.dev === inDev && sendsRedirects(d, inDev) && onLinkVia(d, ip.src, inDev) && allowRedirect(k, d, ip.src))
    icmpError(k, device, out, ICMP.redirect, REDIRECT_HOST, frameId, r.via ?? ip.dst);
  output(k, device, r, ip.dst, out, "forward", frameId);
}

const REDIRECT_HOST = 1;

/** conf.all.send_redirects OR conf.<door>.send_redirects (IN_DEV_TX_REDIRECTS). */
function sendsRedirects(d: DeviceState, dev: IfaceName): boolean {
  return (
    sysctl(d, "net.ipv4.conf.all.send_redirects") !== "0" ||
    (d.sysctl[`net.ipv4.conf.${dev}.send_redirects`] ?? "1") !== "0"
  );
}

/** The sender is directly on this door's street: its route back is a gateway-less route out of it. */
function onLinkVia(d: DeviceState, src: Ip, dev: IfaceName): boolean {
  const back = tableLookup(d, src);
  return !!back && back.via === null && back.dev === dev;
}

/**
 * Whether this machine takes redirects on `dev` (IN_DEV_RX_REDIRECTS): a host if conf.all or the
 * door's accept_redirects is on, a router only if both are. Turning forwarding on sets
 * conf.all.accept_redirects to 0 (and off, to 1), as Linux's inet_forward_change does.
 */
export function acceptsRedirects(d: Readonly<DeviceState>, dev: IfaceName): boolean {
  const fwd = forwarding(d as DeviceState);
  const all = (d.sysctl["net.ipv4.conf.all.accept_redirects"] ?? (fwd ? "0" : "1")) !== "0";
  const door = (d.sysctl[`net.ipv4.conf.${dev}.accept_redirects`] ?? "1") !== "0";
  return fwd ? all && door : all || door;
}

const EXCEPTION_MS = 300_000;

/**
 * An ICMP redirect arrived (icmp_redirect → __ip_do_redirect): the route to the quoted packet's
 * destination must go through the router that sent it; the new gateway must be an ordinary address;
 * if its link address is known, a route exception sends that destination to it from now on, else
 * the machine only starts asking for it.
 */
function takeRedirect(k: Kernel, device: DeviceId, dev: IfaceName, from: Ip, gw: Ip, code: number, quoted: Ip): void {
  const d = deviceOf(k, device);
  if (!d || code > 3) return;
  const base = tableLookup(d, quoted);
  if (!base) return;
  const now = k.s.t;
  const current = exceptionFor(d, base, quoted, now)?.gw ?? base.via;
  if (current !== from || gw === from || !acceptsRedirects(d, dev)) return;
  const n = ipToInt(gw) ?? 0;
  if (n === 0 || n >>> 28 === 14 || gw === "255.255.255.255" || isLocal(d, gw) || isBroadcastFor(d, gw)) return;
  const neigh = d.neigh.find((x) => x.ip === gw && x.dev === base.dev);
  if (!neigh || neigh.state === "INCOMPLETE" || neigh.state === "FAILED") {
    neighEventSend(k, device, base.dev, gw);
    return;
  }
  const nh = nhKey(base);
  d.exceptions ??= [];
  const list = d.exceptions;
  const e = list.find((x) => x.dst === quoted && x.nh === nh);
  const before = e ? { dst: quoted, via: e.gw, dev: e.dev, redirected: true } : null;
  if (e) {
    e.gw = gw;
    e.expires = now + EXCEPTION_MS;
  } else list.push({ dst: quoted, gw, dev: base.dev, nh, expires: now + EXCEPTION_MS });
  k.emit({
    kind: "table.change",
    t: now,
    device,
    table: "route",
    op: e ? "set" : "add",
    key: `cache ${quoted}`,
    before,
    after: { dst: quoted, via: gw, dev: base.dev, redirected: true },
  });
}

/** TTL down by one, the header checksum recomputed: what a router does to every packet it passes. */
function decrementTtl(packet: Uint8Array): Uint8Array {
  const ip = decodeIPv4(packet);
  const out = packet.slice();
  out[8] = ip.ttl - 1;
  out[10] = 0;
  out[11] = 0;
  const c = checksumOf(out.subarray(0, ip.ihl));
  out[10] = c >> 8;
  out[11] = c & 0xff;
  return out;
}

/**
 * A packet on the lectern goes on (hand mode). By hand (`mac` given): the TTL check and decrement,
 * returning the packet to frame (null if it died: "time exceeded" was sent). When the navigator
 * wakes (`mac` null): the whole normal forwarding path.
 */
export function forwardPacket(
  k: Kernel,
  device: DeviceId,
  inDev: IfaceName,
  frameId: number,
  packet: Uint8Array,
  mac: Mac | null,
): Uint8Array | null {
  const ip = decodeIPv4(packet);
  if (mac === null) {
    forward(k, device, inDev, frameId, "", ip, packet);
    return null;
  }
  if (ip.ttl <= 1) {
    icmpError(k, device, packet, ICMP.timeExceeded, 0, frameId);
    return null;
  }
  return decrementTtl(packet);
}

function checksumOf(b: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < b.length; i += 2) sum += ((b[i] ?? 0) << 8) | (b[i + 1] ?? 0);
  while (sum >> 16) sum = (sum & 0xffff) + (sum >> 16);
  return ~sum & 0xffff;
}

/** Delivered to this machine: ICMP and UDP. */
function ipLocal(
  k: Kernel,
  device: DeviceId,
  dev: IfaceName,
  frameId: number | null,
  ip: ReturnType<typeof decodeIPv4>,
  packet: Uint8Array,
): void {
  const d = deviceOf(k, device);
  if (!d) return;
  const broadcast = isBroadcastFor(d, ip.dst);
  if (ip.proto === IPPROTO.icmp) {
    const m = decodeIcmp(ip.payload);
    if (!m.checksumOk) return;
    if (m.type === ICMP.echoRequest) {
      if (broadcast && sysctl(d, "net.ipv4.icmp_echo_ignore_broadcasts") === "1") return;
      const reply = encodeIcmp({ type: ICMP.echoReply, code: 0, id: m.id, seq: m.seq, data: m.data });
      // Echo replies go without Don't Fragment (measured: requests have it, replies don't).
      sendIp(
        k,
        device,
        { dst: ip.src, src: broadcast ? undefined : ip.dst, proto: IPPROTO.icmp, payload: reply, df: false },
        "kernel",
        frameId,
      );
      return;
    }
    if (m.type === ICMP.echoReply) {
      messengerHears(k, device, { from: ip.src, id: m.id, seq: m.seq, frameId });
      pingHears(k, device, {
        kind: "reply",
        from: ip.src,
        id: m.id,
        seq: m.seq,
        ttl: ip.ttl,
        bytes: ip.payload.length,
      });
      return;
    }
    if (m.type === ICMP.redirect) {
      const inner = decodeIPv4(m.data);
      const gw = [m.id >> 8, m.id & 0xff, m.seq >> 8, m.seq & 0xff].join(".");
      takeRedirect(k, device, dev, ip.src, gw, m.code, inner.dst);
      // ping's raw socket sees it too, and prints it.
      if (inner.proto !== IPPROTO.icmp) return;
      const echo = decodeIcmp(m.data.subarray(inner.ihl));
      if (echo.type !== ICMP.echoRequest) return;
      pingHears(k, device, { kind: "redirect", from: ip.src, id: echo.id, seq: echo.seq, code: m.code, gw });
      return;
    }
    if (m.type === ICMP.unreachable || m.type === ICMP.timeExceeded) {
      // The quoted packet: was it one of our pings?
      const inner = decodeIPv4(m.data);
      if (inner.proto !== IPPROTO.icmp) return;
      const echo = decodeIcmp(m.data.subarray(inner.ihl));
      if (echo.type !== ICMP.echoRequest) return;
      pingHears(k, device, { kind: "error", from: ip.src, id: echo.id, seq: echo.seq, type: m.type, code: m.code });
    }
    return;
  }
  if (ip.proto === IPPROTO.udp) {
    // DHCP's ports, when a server or client runs here (dhcp.ts). Nothing else listens: Linux
    // answers "port unreachable", except to broadcasts.
    const udp = decodeUDP(ip.payload);
    if (dhcpUdp(k, device, dev, udp.dstPort, udp.data)) return;
    if (broadcast) {
      if (frameId !== null)
        k.emit({ kind: "frame.drop", t: k.s.t, device, iface: dev, frameId, reason: "no-listener" });
      return;
    }
    icmpError(k, device, packet, ICMP.unreachable, UNREACH.port, frameId ?? 0);
  }
}

// ── ICMP errors ────────────────────────────────────────────────────────────────────────────

/** Linux's per-destination token bucket for ICMP errors (inet_peer: 1 per icmp_ratelimit, burst 6). */
/** The per-destination token bucket (inet_peer): a new peer starts as if last used a minute ago. */
function peerTokens(k: Kernel, d: DeviceState, to: Ip): { tokens: number; at: number; redirects?: number } {
  const b = d.icmpTokens[to] ?? { tokens: 0, at: k.s.t - 60_000 };
  d.icmpTokens[to] = b;
  return b;
}

/**
 * ip_error's own limit on routing errors (ip_rt_error_cost 1 s, burst 5 s), which draws on the same
 * bucket as ICMP's limit: a "net unreachable" for a forwarded packet pays twice (measured: 2 of a
 * burst get through, against 6 time-exceeded).
 */
function allowRoutingError(k: Kernel, d: DeviceState, to: Ip): boolean {
  const b = peerTokens(k, d, to);
  const now = k.s.t;
  b.tokens = Math.min(5000, b.tokens + (now - b.at));
  b.at = now;
  if (b.tokens < 1000) return false;
  b.tokens -= 1000;
  return true;
}

function allowError(k: Kernel, d: DeviceState, to: Ip): boolean {
  const rate = Number(sysctl(d, "net.ipv4.icmp_ratelimit") ?? 1000);
  if (rate === 0) return true;
  const now = k.s.t;
  const b = peerTokens(k, d, to);
  b.tokens = Math.min(ICMP_BURST * rate, b.tokens + (now - b.at));
  b.at = now;
  d.icmpTokens[to] = b;
  if (b.tokens < rate) return false;
  b.tokens -= rate;
  return true;
}

/**
 * ip_rt_send_redirect's limit, per destination, on the same peer as the ICMP error bucket: after
 * 20.48 s of quiet it starts over (and empties the error tokens); the first redirect goes at once,
 * the next only after 20 ms << (redirects sent); after 9, none (each refusal restarts the quiet).
 */
const REDIRECT_LOAD_MS = 20;
const REDIRECT_NUMBER = 9;
const REDIRECT_SILENCE_MS = REDIRECT_LOAD_MS << (REDIRECT_NUMBER + 1);

function allowRedirect(k: Kernel, d: DeviceState, to: Ip): boolean {
  const now = k.s.t;
  const b = peerTokens(k, d, to);
  if (now > b.at + REDIRECT_SILENCE_MS) {
    b.tokens = 0;
    b.redirects = 0;
  }
  const n = b.redirects ?? 0;
  if (n >= REDIRECT_NUMBER) {
    b.at = now;
    return false;
  }
  if (n === 0 || now > b.at + (REDIRECT_LOAD_MS << n)) {
    b.at = now;
    b.redirects = n + 1;
    return true;
  }
  return false;
}

/** Sends an ICMP error (or a redirect, with the new `gateway`) about `packet` back to its sender. */
function icmpError(
  k: Kernel,
  device: DeviceId,
  packet: Uint8Array,
  type: number,
  code: number,
  about: number,
  gateway?: Ip,
): void {
  const d = deviceOf(k, device);
  if (!d) return;
  const ip = decodeIPv4(packet);
  // Never about an ICMP error, a broadcast, or a packet from nowhere (RFC 1122).
  if (ip.proto === IPPROTO.icmp && ![ICMP.echoRequest, ICMP.echoReply].includes(decodeIcmp(ip.payload).type as 0 | 8))
    return;
  if (isBroadcastFor(d, ip.dst) || ip.src === "0.0.0.0") return;
  // Only the types in icmp_ratemask (unreachable, source quench, time exceeded, parameter problem) are limited.
  const mask = Number(sysctl(d, "net.ipv4.icmp_ratemask") ?? 6168);
  if ((mask >> type) & 1 && !allowError(k, d, ip.src)) return;
  const quoted = packet.subarray(0, Math.min(packet.length, ICMP_QUOTE_MAX));
  const g = ipToInt(gateway ?? "0.0.0.0") ?? 0;
  const msg = encodeIcmp({ type, code, id: g >>> 16, seq: g & 0xffff, data: quoted });
  const kind =
    type === ICMP.redirect
      ? "redirect"
      : type === ICMP.timeExceeded
        ? "time-exceeded"
        : code === UNREACH.net
          ? "net-unreachable"
          : code === UNREACH.port
            ? "port-unreachable"
            : "host-unreachable";
  k.emit({ kind: "icmp.error", t: k.s.t, device, type: kind, to: ip.src, about });
  sendIp(k, device, { dst: ip.src, proto: IPPROTO.icmp, payload: msg, ttl: 64, df: false, tos: 0xc0 }, "kernel", about);
}

/** Our own packet failed here (no neighbour): the local ping reads the error a moment later. */
const PROCESS_WAKE_MS = 20;

function localError(
  k: Kernel,
  device: DeviceId,
  from: Ip,
  ip: ReturnType<typeof decodeIPv4>,
  _packet: Uint8Array,
  code: number,
  type: number,
): void {
  if (ip.proto !== IPPROTO.icmp) return;
  const echo = decodeIcmp(ip.payload);
  if (echo.type !== ICMP.echoRequest) return;
  k.schedule({
    t: k.s.t + PROCESS_WAKE_MS,
    kind: "ping-error",
    device,
    from,
    id: echo.id,
    icmpSeq: echo.seq,
    type,
    code,
  });
}

export { ipToInt };
