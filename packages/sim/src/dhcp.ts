/**
 * DHCP: the registry's server and the machines' client, copied from the real pair measured on the
 * capture machine (tools/golden/capture-dhcp.sh, LINUX-FACTS.md "DHCP"):
 *
 * Server (dnsmasq 2.92, as `dnsmasq -i eth0 --dhcp-range=A,B,1h --port=0`):
 * - a new client's address is picked from a hash of its MAC (sdbm), walking up the range from there
 *   (--dhcp-sequential-ip: from the start); a client with a lease, or asking for a free address
 *   (option 50), gets that one;
 * - before offering a new address it pings it (ICMP echo, 20 zero bytes, seq 0) and waits 3 s,
 *   handling nothing else meanwhile (later messages wait and are answered in order afterwards);
 *   an answer means "in use": the next address is tried at once. A free result is remembered 30 s.
 *   --no-ping (`pingCheck: false`) offers at once;
 * - replies go unicast to the offered address at the client's MAC: it first writes that pair into
 *   its own neighbour table (STALE), so the frame needs no ARP; TOS 0xc0, no DF, TTL 64;
 * - options: 53, 54 (itself), 51 (lease), 58 (T1 = lease/2), 59 (T2 = lease×7/8), 1, 28, 3 (router:
 *   itself unless configured otherwise). A renewal's T1/T2 get a random "fuzz" (≤ lease/16);
 * - DECLINE: the address is held back 10 minutes. RELEASE: the lease goes.
 *
 * Client (ISC dhclient 4.4.3-P1 with Fedora 44's dhclient-script):
 * - DISCOVER, broadcast from 0.0.0.0 through a raw socket (TOS 0x10, TTL 128, IP id 0, no DF);
 *   retransmitted with ISC's backoff (3 + random(0..5) s, then +random(0..2×), cut off near 15 s)
 *   for 60 s, then "No DHCPOFFERS received." and it goes to the background to retry in 5 minutes;
 * - the first OFFER is taken at once: REQUEST, broadcast; ACK;
 * - Fedora's script checks the address with `arping -D -c2` (two ARP probes from 0.0.0.0, 1 s
 *   apart, then 1 s more): a reply means someone has it: DHCPDECLINE, and a fresh DISCOVER 10 s later;
 * - otherwise `ip addr replace <ip>/<prefix> broadcast <brd> valid_lft L+60 preferred_lft L+60` and
 *   `ip route replace default via <router>`; "bound to … -- renewal in N seconds." (N: ISC's
 *   randomised T1, less the 2 s the check took) and it goes to the background (the command ends);
 * - renewal: unicast REQUEST from its address through an ordinary socket, ACK, the same check;
 * - `dhclient -r`: kills a running client (~1 s), sends DHCPRELEASE to the server through the socket
 *   and removes the address.
 */
import { broadcastOf, intToIp, ipToInt, maskOf } from "./addr";
import { addrAdd, addrDel, frameOut, lookupRoute, routeAdd } from "./inet";
import { deviceOf, ifaceOf, type Kernel } from "./kernel";
import { BROADCAST, type Mac } from "./mac";
import { resolve } from "./neigh";
import { ARP_REPLY, ARP_REQUEST, decodeArp, encodeArp } from "./proto/arp";
import {
  BOOTP,
  DHCP_MSG,
  DHCP_MSG_NAME,
  DHCP_OPT,
  DHCP_PORT,
  type DhcpMessage,
  decodeDhcp,
  dhcpType,
  encodeDhcp,
  ipBytes,
  optIp,
  optU32,
  u32Bytes,
} from "./proto/dhcp";
import { decodeEth, ETHERTYPE, encodeEth, fromHex, toHex } from "./proto/ethernet";
import { decodeIcmp, encodeIcmp, ICMP } from "./proto/icmp";
import { decodeIPv4, decodeUDP, encodeIPv4, encodeUDP, IPPROTO } from "./proto/ipv4";
import type {
  AddrState,
  DeviceId,
  DeviceState,
  DhclientProc,
  DhcpLease,
  DhcpServerSpec,
  DhcpServerState,
  IfaceName,
  Ip,
  Scheduled,
} from "./types";

// ── Measured constants ─────────────────────────────────────────────────────────────────────

/** dnsmasq waits this long for an answer to its ping (PING_WAIT). */
const PING_WAIT_MS = 3000;
/** A ping that went unanswered is trusted this long (PING_CACHE_TIME). */
const PING_CACHE_MS = 30_000;
/** A declined address is held back (DECLINE_BACKOFF). */
const DECLINE_BACKOFF_MS = 600_000;
/** dnsmasq answers within a fraction of a millisecond. */
const SERVER_MS = 0.2;
/** dhclient starts (and runs PREINIT) before its first DISCOVER: measured 45–85 ms. */
const START_MS = 60;
/** dhclient answers an OFFER at once (measured 0.3–0.6 ms). */
const CLIENT_MS = 0.4;
/** The script starts and arping sends its first probe (measured 20–38 ms after the ACK). */
const SCRIPT_MS = 30;
/** Between arping's two probes, and after the last one. */
const ARPING_MS = 1000;
/** After arping: dhconfig's ip commands, then dhclient prints "bound to" and forks (measured). */
const CONFIG_MS = 80;
/** A second arping (to read the answering MAC) starts this soon after the first is answered. */
const REARP_MS = 15;
/** …and the DECLINE leaves this soon after its answer. */
const DECLINE_MS = 20;
/** `dhclient -r` with a running client: SIGTERM, then a second's wait before the release. */
const KILL_MS = 1000;
/** `dhclient -r`, or `-r` with nothing running: done in about this long. */
const RELEASE_MS = 40;

/** ISC dhclient defaults (dhclient.conf(5)). */
const INITIAL_INTERVAL = 3;
const BACKOFF_CUTOFF = 15;
const SELECT_TIMEOUT = 60;
const REBOOT_TIMEOUT = 10;
const RETRY_MS = 300_000;
const DECLINE_WAIT_MS = 10_000;

/** What Fedora's dhclient asks for (option 55), in its order. */
const PARAMS = [1, 28, 2, 121, 15, 6, 12, 40, 41, 42, 26, 119, 3];

// ── Small helpers ──────────────────────────────────────────────────────────────────────────

const sec = (k: Kernel) => Math.floor(k.s.t / 1000);
const randInt = (k: Kernel, n: number) => Math.floor(k.random() * n);
/** C's random(): 31 bits. */
const random31 = (k: Kernel) => randInt(k, 0x80000000);
const hex32 = (n: number) => `0x${(n >>> 0).toString(16)}`;

function schedule(k: Kernel, at: number, device: DeviceId, role: "client" | "server", stamp: number, pid = 0): void {
  k.schedule({ t: at, kind: "dhcp", device, role, pid, stamp } as Omit<Extract<Scheduled, { kind: "dhcp" }>, "seq">);
}

function out(k: Kernel, device: DeviceId, p: DhclientProc, text: string): void {
  if (!p.verbose || !p.foreground) return;
  k.emit({ kind: "proc.output", t: k.s.t, device, execId: p.execId, text, stream: "stderr" });
}

function primaryAddr(d: DeviceState, dev: IfaceName): AddrState | undefined {
  return d.addrs.find((a) => a.dev === dev && a.scope === "global" && !a.secondary);
}

function state(
  k: Kernel,
  device: DeviceId,
  role: "client" | "server",
  what: DhclientEvent,
  xid: number,
  ip: Ip | null,
  leaseSecs?: number,
): void {
  k.emit({
    kind: "dhcp.state",
    t: k.s.t,
    device,
    role,
    what,
    xid,
    ip,
    ...(leaseSecs !== undefined ? { leaseSecs } : {}),
  });
}

type DhclientEvent = Extract<import("./types").SimEvent, { kind: "dhcp.state" }>["what"];

/**
 * A program writes a neighbour's address itself (arp_req_set, as dnsmasq does before a unicast
 * reply to a client with no address yet): the entry becomes STALE with that address, its timer
 * stops, and whatever was waiting for it goes out.
 */
function neighSetStale(k: Kernel, device: DeviceId, dev: IfaceName, ip: Ip, mac: Mac): void {
  const d = deviceOf(k, device);
  if (!d) return;
  const n = d.neigh.find((x) => x.ip === ip && x.dev === dev);
  if (n?.state === "PERMANENT") return;
  if (!n) {
    d.neigh.push({
      ip,
      dev,
      mac,
      state: "STALE",
      confirmed: 0,
      used: k.s.t,
      updated: k.s.t,
      probes: 0,
      queue: [],
      stamp: 0,
    });
    k.emit({
      kind: "table.change",
      t: k.s.t,
      device,
      table: "neigh",
      op: "add",
      key: `${ip} dev ${dev}`,
      before: null,
      after: { state: "STALE", mac },
    });
    return;
  }
  const before = { state: n.state, mac: n.mac };
  n.mac = mac;
  n.state = "STALE";
  n.updated = k.s.t;
  n.probes = 0;
  n.stamp += 1;
  k.emit({
    kind: "table.change",
    t: k.s.t,
    device,
    table: "neigh",
    op: "set",
    key: `${ip} dev ${dev}`,
    before,
    after: { state: "STALE", mac },
  });
  const queued = n.queue;
  n.queue = [];
  for (const q of queued) frameOut(k, device, dev, mac, q);
}

/** A UDP datagram from a socket bound to `dev` (SO_BINDTODEVICE): no route needed, on-link if none. */
function socketSend(
  k: Kernel,
  device: DeviceId,
  dev: IfaceName,
  dst: Ip,
  ports: [number, number],
  data: Uint8Array,
  opts: { src?: Ip; tos: number; df: boolean },
): boolean {
  const d = deviceOf(k, device);
  const iface = ifaceOf(d, dev);
  if (!d || !iface || !k.oper(device, dev).adminUp) return false;
  const r = lookupRoute(d, dst);
  const hop = r && r.dev === dev ? (r.via ?? dst) : dst;
  const src = opts.src ?? primaryAddr(d, dev)?.ip ?? "0.0.0.0";
  const id = d.ipId;
  d.ipId = (d.ipId + 1) & 0xffff;
  const packet = encodeIPv4({
    src,
    dst,
    proto: IPPROTO.udp,
    ttl: 64,
    id,
    df: opts.df,
    tos: opts.tos,
    payload: encodeUDP(src, dst, ports[0], ports[1], data),
  });
  const waiting = { hex: toHex(packet), origin: "dhcp" as const, parent: null };
  const mac = resolve(k, device, dev, hop, waiting);
  if (mac) frameOut(k, device, dev, mac, waiting);
  return true;
}

// ── Server ─────────────────────────────────────────────────────────────────────────────────

export function initDhcpServer(spec: DhcpServerSpec, firstDoor: IfaceName): DhcpServerState {
  return {
    dev: spec.dev ?? firstDoor,
    range: [spec.range[0], spec.range[1]],
    leaseSecs: spec.leaseSecs ?? 3600,
    router: spec.router === undefined ? "self" : spec.router,
    pingCheck: spec.pingCheck ?? true,
    sequential: spec.sequential ?? false,
    leases: [],
    declined: [],
    pinged: [],
    ping: null,
    backlog: [],
    stamp: 0,
  };
}

/** `dhcp-config` fault, or a room changing the registry: the new settings over the old. */
export function configureDhcpServer(s: DhcpServerState, spec: Partial<DhcpServerSpec>): void {
  if (spec.dev !== undefined) s.dev = spec.dev;
  if (spec.range) s.range = [spec.range[0], spec.range[1]];
  if (spec.leaseSecs !== undefined) s.leaseSecs = spec.leaseSecs;
  if (spec.router !== undefined) s.router = spec.router;
  if (spec.pingCheck !== undefined) s.pingCheck = spec.pingCheck;
  if (spec.sequential !== undefined) s.sequential = spec.sequential;
}

/** dnsmasq's seed for a client: the sdbm hash of its MAC (dhcp.c, address_allocate). */
export function macHash(mac: Mac): number {
  let j = 0;
  for (const b of mac.split(":").map((x) => Number.parseInt(x, 16))) j = (b + (j << 6) + (j << 16) - j) >>> 0;
  return j === 0 ? 1 : j;
}

function prune(k: Kernel, s: DhcpServerState): void {
  s.leases = s.leases.filter((l) => l.expires > k.s.t);
  s.declined = s.declined.filter((x) => x.until > k.s.t);
  s.pinged = s.pinged.filter((x) => k.s.t - x.at <= PING_CACHE_MS);
}

function inRange(s: DhcpServerState, ip: Ip): boolean {
  const n = ipToInt(ip);
  const lo = ipToInt(s.range[0]);
  const hi = ipToInt(s.range[1]);
  return n !== null && lo !== null && hi !== null && n >= lo && n <= hi;
}

/** Free for this client: in the range, nobody else's lease, not declined, not the server's own. */
function available(d: DeviceState, s: DhcpServerState, ip: Ip, mac: Mac): boolean {
  if (!inRange(s, ip)) return false;
  if (s.leases.some((l) => l.ip === ip && l.mac !== mac)) return false;
  if (s.declined.some((x) => x.ip === ip)) return false;
  if (d.addrs.some((a) => a.ip === ip)) return false;
  // dnsmasq skips .0 and .255 in class C networks.
  const n = ipToInt(ip) ?? 0;
  const first = n >>> 24;
  if (first >= 192 && first <= 223 && ((n & 0xff) === 0 || (n & 0xff) === 0xff)) return false;
  return true;
}

/** The order dnsmasq tries addresses in for this client. */
function walk(s: DhcpServerState, mac: Mac): Ip[] {
  const lo = ipToInt(s.range[0]) ?? 0;
  const hi = ipToInt(s.range[1]) ?? 0;
  const size = hi - lo + 1;
  if (size <= 0) return [];
  let start: number;
  if (s.sequential) {
    // The highest address leased in the range, else the range's start.
    start = 0;
    for (const l of s.leases) {
      const n = (ipToInt(l.ip) ?? 0) - lo;
      if (n >= 0 && n < size && n > start) start = n;
    }
  } else start = macHash(mac) % size;
  const list: Ip[] = [];
  for (let i = 0; i < size; i++) list.push(intToIp(lo + ((start + i) % size)));
  return list;
}

/** A DHCP message reached the server's UDP port 67 (through the IP layer). */
function serverInput(k: Kernel, device: DeviceId, dev: IfaceName, msgHex: string): void {
  const d = deviceOf(k, device);
  const s = d?.dhcpServer;
  if (!d || !s || dev !== s.dev) return;
  if (s.ping) {
    // dnsmasq is waiting for its ping: everything else waits on the socket.
    s.backlog.push(msgHex);
    return;
  }
  const msg = decodeDhcp(fromHex(msgHex));
  if (!msg || msg.op !== BOOTP.request) return;
  prune(k, s);
  const me = primaryAddr(d, s.dev);
  if (!me) return;
  switch (dhcpType(msg)) {
    case DHCP_MSG.discover:
      discover(k, device, d, s, msg, msgHex);
      return;
    case DHCP_MSG.request:
      request(k, device, d, s, me, msg);
      return;
    case DHCP_MSG.decline: {
      const ip = optIp(msg, DHCP_OPT.requestedIp);
      if (!ip) return;
      s.leases = s.leases.filter((l) => l.ip !== ip);
      s.declined.push({ ip, until: k.s.t + DECLINE_BACKOFF_MS });
      return;
    }
    case DHCP_MSG.release:
      s.leases = s.leases.filter((l) => !(l.ip === msg.ciaddr && l.mac === msg.chaddr));
      return;
  }
}

function discover(
  k: Kernel,
  device: DeviceId,
  d: DeviceState,
  s: DhcpServerState,
  msg: DhcpMessage,
  msgHex: string,
): void {
  const lease = s.leases.find((l) => l.mac === msg.chaddr);
  if (lease) {
    reply(k, device, d, s, msg, lease.ip, DHCP_MSG.offer);
    return;
  }
  const wanted = optIp(msg, DHCP_OPT.requestedIp);
  if (wanted && available(d, s, wanted, msg.chaddr)) {
    reply(k, device, d, s, msg, wanted, DHCP_MSG.offer);
    return;
  }
  allocate(k, device, d, s, msg, msgHex, []);
}

/** address_allocate: the first free address in this client's order, pinged first if so set. */
function allocate(
  k: Kernel,
  device: DeviceId,
  d: DeviceState,
  s: DhcpServerState,
  msg: DhcpMessage,
  msgHex: string,
  tried: Ip[],
): void {
  for (const ip of walk(s, msg.chaddr)) {
    if (tried.includes(ip) || !available(d, s, ip, msg.chaddr)) continue;
    if (!s.pingCheck || s.pinged.some((x) => x.ip === ip && x.mac === msg.chaddr)) {
      reply(k, device, d, s, msg, ip, DHCP_MSG.offer);
      return;
    }
    // Ping it (a raw ICMP socket: the kernel's routing and ARP) and wait up to 3 s.
    const id = randInt(k, 0x10000);
    const echo = encodeIcmp({ type: ICMP.echoRequest, code: 0, id, seq: 0, data: new Uint8Array(20) });
    socketPing(k, device, ip, echo);
    s.stamp += 1;
    s.ping = { ip, id, mac: msg.chaddr, request: msgHex, tried, started: k.s.t };
    schedule(k, k.s.t + PING_WAIT_MS, device, "server", s.stamp);
    return;
  }
  // No address left: dnsmasq logs it and stays silent.
}

function socketPing(k: Kernel, device: DeviceId, dst: Ip, icmp: Uint8Array): void {
  const d = deviceOf(k, device);
  if (!d) return;
  const r = lookupRoute(d, dst);
  if (!r) return;
  const src = r.src ?? primaryAddr(d, r.dev)?.ip ?? "0.0.0.0";
  const id = d.ipId;
  d.ipId = (d.ipId + 1) & 0xffff;
  const packet = encodeIPv4({ src, dst, proto: IPPROTO.icmp, ttl: 64, id, df: true, payload: icmp });
  const waiting = { hex: toHex(packet), origin: "dhcp" as const, parent: null };
  const mac = resolve(k, device, r.dev, r.via ?? dst, waiting);
  if (mac) frameOut(k, device, r.dev, mac, waiting);
}

/** The ping went unanswered for 3 s: the address is free; offer it, then read what waited. */
function serverTimer(k: Kernel, device: DeviceId, stamp: number): void {
  const d = deviceOf(k, device);
  const s = d?.dhcpServer;
  if (!d || !s?.ping || s.stamp !== stamp) return;
  const p = s.ping;
  s.ping = null;
  s.pinged.push({ ip: p.ip, mac: p.mac, at: k.s.t });
  const msg = decodeDhcp(fromHex(p.request));
  if (msg && primaryAddr(d, s.dev)) reply(k, device, d, s, msg, p.ip, DHCP_MSG.offer);
  drainBacklog(k, device, s);
}

function drainBacklog(k: Kernel, device: DeviceId, s: DhcpServerState): void {
  while (s.backlog.length > 0 && !s.ping) {
    const next = s.backlog.shift() as string;
    serverInput(k, device, s.dev, next);
  }
}

/** Someone answered the server's ping: that address is taken; try the next one at once. */
function serverHearsEcho(k: Kernel, device: DeviceId, from: Ip, id: number): void {
  const d = deviceOf(k, device);
  const s = d?.dhcpServer;
  if (!d || !s?.ping || s.ping.ip !== from || s.ping.id !== id) return;
  const p = s.ping;
  s.ping = null;
  s.stamp += 1;
  const msg = decodeDhcp(fromHex(p.request));
  state(k, device, "server", "IN-USE", msg?.xid ?? 0, from);
  if (msg) allocate(k, device, d, s, msg, p.request, [...p.tried, from]);
  if (!s.ping) drainBacklog(k, device, s);
}

function request(k: Kernel, device: DeviceId, d: DeviceState, s: DhcpServerState, me: AddrState, msg: DhcpMessage) {
  const server = optIp(msg, DHCP_OPT.serverId);
  if (server && server !== me.ip) return; // the client chose another server
  const ip = optIp(msg, DHCP_OPT.requestedIp) ?? (msg.ciaddr !== "0.0.0.0" ? msg.ciaddr : undefined);
  if (!ip) return;
  const ok = inRange(s, ip) && available(d, s, ip, msg.chaddr);
  if (!ok) {
    reply(k, device, d, s, msg, ip, DHCP_MSG.nak);
    return;
  }
  s.leases = s.leases.filter((l) => l.mac !== msg.chaddr && l.ip !== ip);
  s.leases.push({ mac: msg.chaddr, ip, expires: k.s.t + s.leaseSecs * 1000 });
  reply(k, device, d, s, msg, ip, DHCP_MSG.ack);
}

/** OFFER, ACK or NAK, a moment later (dnsmasq's processing time). */
function reply(
  k: Kernel,
  device: DeviceId,
  d: DeviceState,
  s: DhcpServerState,
  msg: DhcpMessage,
  ip: Ip,
  type: number,
) {
  const me = primaryAddr(d, s.dev);
  if (!me) return;
  const L = s.leaseSecs;
  let t1 = Math.floor(L / 2);
  let t2 = Math.floor((L * 7) / 8);
  if (type === DHCP_MSG.ack && msg.ciaddr !== "0.0.0.0") {
    // A renewal: dnsmasq spreads renewals with a little fuzz.
    let fuzz = randInt(k, 0x10000);
    while (fuzz > Math.floor(L / 16)) fuzz = Math.floor(fuzz / 2);
    t1 -= fuzz;
    t2 -= fuzz;
  }
  const options: DhcpMessage["options"] = [{ code: DHCP_OPT.msgType, data: [type] }];
  options.push({ code: DHCP_OPT.serverId, data: ipBytes(me.ip) });
  if (type !== DHCP_MSG.nak) {
    const router = s.router === "self" ? me.ip : s.router;
    options.push(
      { code: DHCP_OPT.leaseTime, data: u32Bytes(L) },
      { code: DHCP_OPT.renewalTime, data: u32Bytes(t1) },
      { code: DHCP_OPT.rebindingTime, data: u32Bytes(t2) },
      { code: DHCP_OPT.subnetMask, data: u32Bytes(maskOf(me.prefix)) },
      { code: DHCP_OPT.broadcast, data: ipBytes(broadcastOf(me.ip, me.prefix)) },
    );
    if (router) options.push({ code: DHCP_OPT.router, data: ipBytes(router) });
  }
  const bytes = encodeDhcp({
    op: BOOTP.reply,
    xid: msg.xid,
    secs: 0,
    flags: msg.flags,
    ciaddr: msg.ciaddr,
    yiaddr: type === DHCP_MSG.nak ? "0.0.0.0" : ip,
    siaddr: type === DHCP_MSG.nak ? "0.0.0.0" : me.ip,
    giaddr: "0.0.0.0",
    chaddr: msg.chaddr,
    options,
  });
  const name = DHCP_MSG_NAME[type] as "OFFER" | "ACK" | "NAK";
  k.schedule({
    t: k.s.t + SERVER_MS,
    kind: "dhcp-send",
    device,
    role: "server",
    hex: toHex(bytes),
    name,
    ip,
    ciaddr: msg.ciaddr,
  });
}

/** The server's reply leaves (scheduled by `reply`). */
function serverSend(k: Kernel, device: DeviceId, hex: string, name: "OFFER" | "ACK" | "NAK", ip: Ip, ciaddr: Ip): void {
  const d = deviceOf(k, device);
  const s = d?.dhcpServer;
  const me = d && s && primaryAddr(d, s.dev);
  if (!d || !s || !me) return;
  const data = fromHex(hex);
  const msg = decodeDhcp(data);
  if (!msg) return;
  state(k, device, "server", name, msg.xid, name === "NAK" ? null : ip, name === "NAK" ? undefined : s.leaseSecs);
  if (name === "NAK") {
    // To everyone: the client may have no usable address.
    const iface = ifaceOf(d, s.dev);
    if (!iface) return;
    const id = d.ipId;
    d.ipId = (d.ipId + 1) & 0xffff;
    const packet = encodeIPv4({
      src: me.ip,
      dst: "255.255.255.255",
      proto: IPPROTO.udp,
      ttl: 64,
      id,
      df: false,
      tos: 0xc0,
      payload: encodeUDP(me.ip, "255.255.255.255", DHCP_PORT.server, DHCP_PORT.client, data),
    });
    k.send(device, s.dev, encodeEth({ dst: BROADCAST, src: iface.mac, type: ETHERTYPE.ipv4, payload: packet }), "dhcp");
    return;
  }
  // To a client with an address already (a renewal): there. Otherwise to the offered address at the
  // client's MAC, written into the neighbour table first.
  const to = ciaddr !== "0.0.0.0" ? ciaddr : ip;
  if (ciaddr === "0.0.0.0") neighSetStale(k, device, s.dev, ip, msg.chaddr);
  socketSend(k, device, s.dev, to, [DHCP_PORT.server, DHCP_PORT.client], data, { src: me.ip, tos: 0xc0, df: false });
}

// ── Client ─────────────────────────────────────────────────────────────────────────────────

export type DhclientStart =
  | { ok: true; pid: number; killed: boolean; stale: boolean }
  | { ok: false; error: "running"; pid: number }
  | { ok: false; error: "no-dev"; dev: IfaceName };

function db(d: DeviceState): NonNullable<DeviceState["dhclientDb"]> {
  d.dhclientDb ??= { pidFile: "none", pid: 0, leases: {} };
  return d.dhclientDb;
}

function alive(d: DeviceState): DhclientProc[] {
  return d.procs.filter((p): p is DhclientProc => p.kind === "dhclient" && !p.done);
}

/** The interfaces dhclient runs on with none named: every Ethernet door that isn't a bridge port. */
export function dhclientDoors(d: DeviceState): IfaceName[] {
  return d.ifaces.filter((i) => i.kind === "ether" && !i.master).map((i) => i.name);
}

/**
 * `dhclient [-v] [-r] [<doors>]`. Get mode starts a client per door; release mode releases each
 * door's lease. The shell prints what dhclient prints before its first packet; the rest arrives as
 * `proc.output` (verbose only) and the end as `proc.exit`.
 */
export function startDhclient(
  k: Kernel,
  device: DeviceId,
  execId: number,
  opts: { doors: IfaceName[]; verbose: boolean; release: boolean },
): DhclientStart {
  const d = deviceOf(k, device);
  if (!d) return { ok: false, error: "no-dev", dev: opts.doors[0] ?? "" };
  const file = db(d);
  const running = alive(d);
  if (!opts.release && running.length > 0) return { ok: false, error: "running", pid: file.pid };
  for (const dev of opts.doors) if (!ifaceOf(d, dev)) return { ok: false, error: "no-dev", dev };
  const pid = 1000 + randInt(k, 30000);
  let killed = false;
  let stale = false;
  if (opts.release) {
    if (running.length > 0) {
      killed = true;
      for (const p of running) stop(k, device, p, null);
    } else if (file.pidFile === "stale") stale = true;
  }
  file.pidFile = "live";
  file.pid = pid;
  opts.doors.forEach((dev, n) => {
    const p: DhclientProc = {
      kind: "dhclient",
      execId,
      pid,
      dev,
      verbose: opts.verbose,
      foreground: true,
      // Only the first door's client ends the command (the others share it).
      leader: n === 0,
      mode: opts.release ? "release" : "get",
      state: "init",
      xid: 0,
      interval: 0,
      firstSending: 0,
      secs: 0,
      offer: null,
      lease: null,
      check: null,
      stamp: 0,
      done: false,
    };
    d.procs.push(p);
    const at = opts.release ? k.s.t + (killed ? KILL_MS : RELEASE_MS) : k.s.t + START_MS;
    arm(k, device, p, at);
  });
  return { ok: true, pid, killed, stale };
}

function arm(k: Kernel, device: DeviceId, p: DhclientProc, at: number): void {
  p.stamp += 1;
  schedule(k, at, device, "client", p.stamp, p.pid);
}

function procOf(d: DeviceState, pid: number, stamp: number): DhclientProc | undefined {
  return d.procs.find((p): p is DhclientProc => p.kind === "dhclient" && !p.done && p.pid === pid && p.stamp === stamp);
}

/** The process ends: by itself (exit code), killed (null), or by Ctrl+C (130). */
function stop(k: Kernel, device: DeviceId, p: DhclientProc, exitCode: number | null): void {
  const d = deviceOf(k, device);
  p.done = true;
  p.stamp += 1;
  if (d) {
    d.procs = d.procs.filter((x) => x !== p);
    const file = db(d);
    if (alive(d).length === 0) file.pidFile = "stale";
  }
  if (exitCode !== null && p.foreground && p.leader)
    k.emit({ kind: "proc.exit", t: k.s.t, device, execId: p.execId, exitCode });
  p.foreground = false;
}

/** The command's part ends (dhclient forks into the background): exit 0, the daemon runs on. */
function background(k: Kernel, device: DeviceId, p: DhclientProc): void {
  if (!p.foreground) return;
  const d = deviceOf(k, device);
  // One command, several doors: it returns when the first one is settled.
  for (const x of d ? alive(d).filter((y) => y.execId === p.execId) : [p]) {
    if (x.foreground && x.leader) k.emit({ kind: "proc.exit", t: k.s.t, device, execId: x.execId, exitCode: 0 });
    x.foreground = false;
  }
}

/** Ctrl+C while the command still holds the console. */
export function interruptDhclient(k: Kernel, device: DeviceId, execId: number): boolean {
  const d = deviceOf(k, device);
  const ps = d ? alive(d).filter((p) => p.execId === execId && p.foreground) : [];
  if (ps.length === 0) return false;
  for (const p of ps) {
    p.foreground = p.leader;
    stop(k, device, p, 130);
  }
  return true;
}

function clientTimer(k: Kernel, device: DeviceId, pid: number, stamp: number): void {
  const d = deviceOf(k, device);
  const p = d && procOf(d, pid, stamp);
  if (!d || !p) return;
  switch (p.state) {
    case "init":
      if (p.mode === "release") release(k, device, d, p);
      else stateInit(k, device, d, p);
      return;
    case "selecting":
      sendDiscover(k, device, d, p);
      return;
    case "requesting":
    case "renewing":
    case "rebinding":
      sendRequest(k, device, d, p);
      return;
    case "bound":
      // T1: time to renew.
      p.state = "renewing";
      p.firstSending = sec(k);
      p.interval = 0;
      sendRequest(k, device, d, p);
      return;
    case "checking":
      checkStep(k, device, d, p);
      return;
    case "declined":
    case "sleeping":
      stateInit(k, device, d, p);
      return;
    case "releasing": {
      // The script (RELEASE) starts a moment after the packet left, and removes the address.
      const lease = db(d).leases[p.dev];
      if (lease && d.addrs.some((a) => a.dev === p.dev && a.ip === lease.ip)) removeAddr(k, device, p.dev, lease);
      stop(k, device, p, 0);
      return;
    }
  }
}

function stateInit(k: Kernel, device: DeviceId, d: DeviceState, p: DhclientProc): void {
  p.state = "selecting";
  p.xid = (random31(k) * 2 + randInt(k, 2)) >>> 0;
  p.firstSending = sec(k);
  p.interval = INITIAL_INTERVAL;
  p.offer = null;
  sendDiscover(k, device, d, p, true);
}

/** ISC's backoff: the interval grows by up to twice itself, cut back near backoff-cutoff. */
function backoff(k: Kernel, p: DhclientProc, first: boolean): void {
  if (first || !p.interval) {
    p.interval = INITIAL_INTERVAL + (first ? random31(k) % (2 * INITIAL_INTERVAL) : 0);
  } else p.interval += random31(k) % (2 * p.interval);
  if (p.interval > BACKOFF_CUTOFF) p.interval = Math.floor(BACKOFF_CUTOFF / 2) + (random31(k) % BACKOFF_CUTOFF);
}

/** When ISC's next timeout fires: whole seconds from now, plus a random part of a second. */
function nextAt(k: Kernel, p: DhclientProc): number {
  const frac = p.interval > 1 ? k.random() * 1000 : k.s.t % 1000;
  return (sec(k) + p.interval) * 1000 + frac;
}

function rawSend(k: Kernel, device: DeviceId, dev: IfaceName, src: Ip, data: Uint8Array): void {
  const iface = ifaceOf(deviceOf(k, device), dev);
  if (!iface) return;
  // ISC builds the IP header itself: TOS 0x10 (low delay), TTL 128, id 0, no DF.
  const packet = encodeIPv4({
    src,
    dst: "255.255.255.255",
    proto: IPPROTO.udp,
    ttl: 128,
    id: 0,
    df: false,
    tos: 0x10,
    payload: encodeUDP(src, "255.255.255.255", DHCP_PORT.client, DHCP_PORT.server, data),
  });
  k.send(device, dev, encodeEth({ dst: BROADCAST, src: iface.mac, type: ETHERTYPE.ipv4, payload: packet }), "dhcp");
}

function message(
  p: DhclientProc,
  mac: Mac,
  type: number,
  extra: DhcpMessage["options"],
  ciaddr = "0.0.0.0",
): Uint8Array {
  return encodeDhcp({
    op: BOOTP.request,
    xid: p.xid,
    secs: p.secs,
    flags: 0,
    ciaddr,
    yiaddr: "0.0.0.0",
    siaddr: "0.0.0.0",
    giaddr: "0.0.0.0",
    chaddr: mac,
    options: [{ code: DHCP_OPT.msgType, data: [type] }, ...extra],
  });
}

function sendDiscover(k: Kernel, device: DeviceId, d: DeviceState, p: DhclientProc, first = false): void {
  const iface = ifaceOf(d, p.dev);
  if (!iface) return;
  const elapsed = sec(k) - p.firstSending;
  if (elapsed >= SELECT_TIMEOUT) {
    // state_panic: no offers and no lease to fall back on.
    out(k, device, p, "No DHCPOFFERS received.");
    out(k, device, p, "No working leases in persistent database - sleeping.");
    p.state = "sleeping";
    arm(k, device, p, k.s.t + RETRY_MS);
    background(k, device, p);
    return;
  }
  backoff(k, p, first);
  if (sec(k) + p.interval > p.firstSending + SELECT_TIMEOUT) p.interval = p.firstSending + SELECT_TIMEOUT - sec(k) + 1;
  p.secs = Math.min(elapsed, 65535);
  const prior = db(d).leases[p.dev];
  const extra: DhcpMessage["options"] = [];
  if (prior) extra.push({ code: DHCP_OPT.requestedIp, data: ipBytes(prior.ip) });
  extra.push({ code: DHCP_OPT.paramRequest, data: PARAMS });
  rawSend(k, device, p.dev, "0.0.0.0", message(p, iface.mac, DHCP_MSG.discover, extra));
  state(k, device, "client", "DISCOVER", p.xid, prior?.ip ?? null);
  out(k, device, p, `DHCPDISCOVER on ${p.dev} to 255.255.255.255 port 67 interval ${p.interval} (xid=${hex32(p.xid)})`);
  arm(k, device, p, nextAt(k, p));
}

function sendRequest(k: Kernel, device: DeviceId, d: DeviceState, p: DhclientProc): void {
  const iface = ifaceOf(d, p.dev);
  const target = p.state === "requesting" ? p.offer : p.lease;
  if (!iface || !target) return;
  const elapsed = sec(k) - p.firstSending;
  if (p.state === "requesting" && elapsed > REBOOT_TIMEOUT) {
    stateInit(k, device, d, p);
    return;
  }
  if (p.state !== "requesting" && p.lease && k.s.t >= p.lease.expiresAt) {
    expire(k, device, d, p);
    return;
  }
  if (p.state === "renewing" && p.lease && k.s.t >= p.lease.rebindAt) p.state = "rebinding";
  backoff(k, p, false);
  if (p.state !== "requesting" && p.lease && sec(k) + p.interval > p.lease.expiresAt / 1000)
    p.interval = Math.floor(p.lease.expiresAt / 1000) - sec(k) + 1;
  if (p.state !== "requesting") p.secs = Math.min(elapsed, 65535);
  if (p.state === "requesting") {
    const data = message(p, iface.mac, DHCP_MSG.request, [
      { code: DHCP_OPT.serverId, data: ipBytes(target.server) },
      { code: DHCP_OPT.requestedIp, data: ipBytes(target.ip) },
      { code: DHCP_OPT.paramRequest, data: PARAMS },
    ]);
    rawSend(k, device, p.dev, "0.0.0.0", data);
    out(k, device, p, `DHCPREQUEST for ${target.ip} on ${p.dev} to 255.255.255.255 port 67 (xid=${hex32(p.xid)})`);
  } else {
    const data = message(p, iface.mac, DHCP_MSG.request, [{ code: DHCP_OPT.paramRequest, data: PARAMS }], target.ip);
    if (p.state === "renewing")
      socketSend(k, device, p.dev, target.server, [DHCP_PORT.client, DHCP_PORT.server], data, {
        src: target.ip,
        tos: 0,
        df: true,
      });
    else rawSend(k, device, p.dev, target.ip, data);
  }
  state(k, device, "client", "REQUEST", p.xid, target.ip);
  arm(k, device, p, nextAt(k, p));
}

/** A frame reached this machine's door (a raw packet socket sees it before the IP layer does). */
export function dhcpTap(k: Kernel, device: DeviceId, dev: IfaceName, bytes: Uint8Array): void {
  const d = deviceOf(k, device);
  if (!d) return;
  const hasClient = d.procs.some((p) => p.kind === "dhclient" && !p.done);
  if (!hasClient && !d.dhcpServer?.ping) return;
  const f = decodeEth(bytes);
  if (f.type === ETHERTYPE.arp) {
    const a = decodeArp(f.payload);
    if (a?.op === ARP_REPLY)
      for (const p of alive(d)) if (p.dev === dev) clientHearsArp(k, device, d, p, a.senderIp, a.senderMac);
    return;
  }
  if (f.type !== ETHERTYPE.ipv4) return;
  const ip = decodeIPv4(f.payload);
  if (!ip.checksumOk) return;
  if (ip.proto === IPPROTO.icmp) {
    const m = decodeIcmp(ip.payload);
    if (m.type === ICMP.echoReply) serverHearsEcho(k, device, ip.src, m.id);
    return;
  }
  if (ip.proto !== IPPROTO.udp) return;
  const u = decodeUDP(ip.payload);
  if (u.dstPort !== DHCP_PORT.client) return;
  const msg = decodeDhcp(u.data);
  if (!msg || msg.op !== BOOTP.reply) return;
  for (const p of alive(d)) if (p.dev === dev) clientInput(k, device, d, p, msg, ip.src);
}

function leaseFrom(k: Kernel, msg: DhcpMessage, from: Ip): DhcpLease {
  const server = optIp(msg, DHCP_OPT.serverId) ?? from;
  const mask = optU32(msg, DHCP_OPT.subnetMask);
  // No mask option: the address's class decides (a 10.x address would be /8); our servers always send one.
  const exact = mask === undefined ? 24 : prefixOf(mask);
  const leaseSecs = optU32(msg, DHCP_OPT.leaseTime) ?? 0;
  return {
    ip: msg.yiaddr,
    server,
    prefix: exact,
    broadcast: optIp(msg, DHCP_OPT.broadcast) ?? broadcastOf(msg.yiaddr, exact),
    router: optIp(msg, DHCP_OPT.router) ?? null,
    leaseSecs,
    t1: optU32(msg, DHCP_OPT.renewalTime) ?? null,
    t2: optU32(msg, DHCP_OPT.rebindingTime) ?? null,
    since: k.s.t,
    renewAt: 0,
    rebindAt: 0,
    expiresAt: 0,
  };
}

function prefixOf(mask: number): number {
  let n = 0;
  for (let b = 31; b >= 0 && (mask >>> b) & 1; b--) n++;
  return n;
}

function clientInput(k: Kernel, device: DeviceId, d: DeviceState, p: DhclientProc, msg: DhcpMessage, from: Ip): void {
  const iface = ifaceOf(d, p.dev);
  if (!iface || msg.xid !== p.xid || msg.chaddr !== iface.mac) return;
  const type = dhcpType(msg);
  if (type === DHCP_MSG.offer && p.state === "selecting") {
    out(k, device, p, `DHCPOFFER of ${msg.yiaddr} from ${from}`);
    state(k, device, "client", "OFFER", p.xid, msg.yiaddr);
    p.offer = leaseFrom(k, msg, from);
    // state_selecting: the first offer is taken; the REQUEST keeps the DISCOVER's secs.
    p.state = "requesting";
    p.firstSending = sec(k);
    p.interval = 0;
    arm(k, device, p, k.s.t + CLIENT_MS);
    return;
  }
  if (type === DHCP_MSG.ack && (p.state === "requesting" || p.state === "renewing" || p.state === "rebinding")) {
    const renewing = p.state !== "requesting";
    out(k, device, p, `DHCPACK of ${msg.yiaddr} from ${from} (xid=${hex32(p.xid)})`);
    state(k, device, "client", "ACK", p.xid, msg.yiaddr, optU32(msg, DHCP_OPT.leaseTime));
    const lease = leaseFrom(k, msg, from);
    // dhcpack: lease times from the server, the renewal time randomised (to 3/4..1 of T1).
    const L = lease.leaseSecs;
    let renewal = lease.t1 ?? Math.floor(L / 2) + 1;
    renewal = Math.floor((renewal * 3 + 3) / 4) + Math.floor(((random31(k) % renewal) + 3) / 4);
    const rebind = lease.t2 ?? Math.floor((L * 7) / 8);
    const now = sec(k);
    lease.renewAt = (now + renewal) * 1000;
    lease.rebindAt = (now + rebind) * 1000;
    lease.expiresAt = (now + L) * 1000;
    p.offer = lease;
    p.state = "checking";
    p.check = { step: "probe", probes: 0, renewing };
    arm(k, device, p, k.s.t + SCRIPT_MS);
    return;
  }
  if (type === DHCP_MSG.nak && p.state !== "selecting" && p.state !== "checking") {
    out(k, device, p, `DHCPNAK from ${from} (xid=${hex32(p.xid)})`);
    if (p.lease) removeAddr(k, device, p.dev, p.lease);
    p.lease = null;
    stateInit(k, device, d, p);
  }
}

/**
 * One step of Fedora's address check (BOUND, RENEW, REBIND): `arping -D -c2` sends two probes 1 s
 * apart and waits 1 s more; an answer from another machine stops it, and the script runs arping a
 * second time to read who answered, then declines.
 */
function checkStep(k: Kernel, device: DeviceId, d: DeviceState, p: DhclientProc): void {
  const c = p.check;
  const lease = p.offer;
  const iface = ifaceOf(d, p.dev);
  if (!c || !lease || !iface) return;
  switch (c.step) {
    case "probe":
      if (c.probes < 2) {
        probe(k, device, p.dev, iface.mac, lease.ip);
        c.probes += 1;
        arm(k, device, p, k.s.t + ARPING_MS);
      } else {
        c.step = "settle";
        arm(k, device, p, k.s.t + CONFIG_MS);
      }
      return;
    case "settle":
      configure(k, device, d, p);
      return;
    case "reprobe":
      probe(k, device, p.dev, iface.mac, lease.ip);
      c.step = "reprobing";
      arm(k, device, p, k.s.t + 2 * ARPING_MS);
      return;
    case "reprobing":
      // The second arping heard nothing: no MAC to compare, and the script goes ahead.
      configure(k, device, d, p);
      return;
    case "decline":
      decline(k, device, d, p, lease);
      return;
  }
}

function probe(k: Kernel, device: DeviceId, dev: IfaceName, mac: Mac, ip: Ip): void {
  const arp = encodeArp({ op: ARP_REQUEST, senderMac: mac, senderIp: "0.0.0.0", targetMac: BROADCAST, targetIp: ip });
  k.send(device, dev, encodeEth({ dst: BROADCAST, src: mac, type: ETHERTYPE.arp, payload: arp }), "dhcp");
}

function clientHearsArp(k: Kernel, device: DeviceId, d: DeviceState, p: DhclientProc, ip: Ip, mac: Mac): void {
  const c = p.check;
  if (p.state !== "checking" || !c || !p.offer || ip !== p.offer.ip) return;
  // The reply can come from this machine itself: that's fine (Fedora's script compares MACs).
  const own = d.ifaces.some((i) => i.mac === mac);
  if (c.step === "probe" && !own) {
    c.step = "reprobe";
    state(k, device, "client", "CONFLICT", p.xid, ip);
    arm(k, device, p, k.s.t + REARP_MS);
  } else if (c.step === "reprobing") {
    if (own) configure(k, device, d, p);
    else {
      c.step = "decline";
      arm(k, device, p, k.s.t + DECLINE_MS);
    }
  }
}

function decline(k: Kernel, device: DeviceId, d: DeviceState, p: DhclientProc, lease: DhcpLease): void {
  const iface = ifaceOf(d, p.dev);
  if (!iface) return;
  p.secs = 0;
  const data = message(p, iface.mac, DHCP_MSG.decline, [
    { code: DHCP_OPT.serverId, data: ipBytes(lease.server) },
    { code: DHCP_OPT.requestedIp, data: ipBytes(lease.ip) },
  ]);
  rawSend(k, device, p.dev, "0.0.0.0", data);
  state(k, device, "client", "DECLINE", p.xid, lease.ip);
  out(k, device, p, `DHCPDECLINE of ${lease.ip} on ${p.dev} to 255.255.255.255 port 67 (xid=${hex32(p.xid)})`);
  // A renewal that found its address taken gives it up too.
  if (p.lease) removeAddr(k, device, p.dev, p.lease);
  p.lease = null;
  p.offer = null;
  p.check = null;
  p.state = "declined";
  arm(k, device, p, k.s.t + DECLINE_WAIT_MS);
}

/** dhconfig: the address (with its lifetimes), the default route; then "bound to". */
function configure(k: Kernel, device: DeviceId, d: DeviceState, p: DhclientProc): void {
  const lease = p.offer;
  const c = p.check;
  if (!lease || !c) return;
  const cidr = `${lease.ip}/${lease.prefix}`;
  if (p.lease && p.lease.ip !== lease.ip) removeAddr(k, device, p.dev, p.lease);
  if (!d.addrs.some((a) => a.dev === p.dev && a.ip === lease.ip && a.prefix === lease.prefix))
    addrAdd(k, device, cidr, p.dev);
  const a = d.addrs.find((x) => x.dev === p.dev && x.ip === lease.ip && x.prefix === lease.prefix);
  if (a) {
    const before = { ...a };
    a.broadcast = lease.broadcast;
    // Fedora's script adds a minute so the address outlives a slow renewal.
    a.lft = { valid: lease.leaseSecs + 60, preferred: lease.leaseSecs + 60, since: k.s.t };
    k.emit({
      kind: "table.change",
      t: k.s.t,
      device,
      table: "addr",
      op: "set",
      key: `${a.ip}/${a.prefix} dev ${a.dev}`,
      before,
      after: { ...a },
    });
    k.schedule({
      t: k.s.t + a.lft.valid * 1000,
      kind: "dhcp",
      device,
      role: "lft",
      pid: 0,
      stamp: k.s.t,
      dev: a.dev,
      ip: a.ip,
    });
  }
  if (!c.renewing && lease.router) routeAdd(k, device, { dst: "default", via: lease.router, dev: p.dev }, true);
  p.lease = lease;
  p.offer = null;
  p.check = null;
  p.state = "bound";
  db(d).leases[p.dev] = { ip: lease.ip, server: lease.server, prefix: lease.prefix };
  state(k, device, "client", "BOUND", p.xid, lease.ip, lease.leaseSecs);
  out(k, device, p, `bound to ${lease.ip} -- renewal in ${Math.floor(lease.renewAt / 1000) - sec(k)} seconds.`);
  const frac = k.random() * 1000;
  p.stamp += 1;
  schedule(k, Math.max(lease.renewAt + frac, k.s.t + 1), device, "client", p.stamp, p.pid);
  background(k, device, p);
}

/** The lease ran out without a renewal: the script removes the address; start again. */
function expire(k: Kernel, device: DeviceId, d: DeviceState, p: DhclientProc): void {
  if (p.lease) removeAddr(k, device, p.dev, p.lease);
  state(k, device, "client", "EXPIRED", p.xid, p.lease?.ip ?? null);
  p.lease = null;
  stateInit(k, device, d, p);
}

function removeAddr(k: Kernel, device: DeviceId, dev: IfaceName, lease: { ip: Ip; prefix: number }): void {
  addrDel(k, device, `${lease.ip}/${lease.prefix}`, dev);
}

/** `dhclient -r`: DHCPRELEASE for the door's last lease, then the address goes. */
function release(k: Kernel, device: DeviceId, d: DeviceState, p: DhclientProc): void {
  const lease = db(d).leases[p.dev];
  const iface = ifaceOf(d, p.dev);
  p.state = "releasing";
  if (lease && iface) {
    p.xid = (random31(k) * 2 + randInt(k, 2)) >>> 0;
    p.secs = 0;
    const data = message(
      p,
      iface.mac,
      DHCP_MSG.release,
      [{ code: DHCP_OPT.serverId, data: ipBytes(lease.server) }],
      lease.ip,
    );
    out(k, device, p, `DHCPRELEASE of ${lease.ip} on ${p.dev} to ${lease.server} port 67 (xid=${hex32(p.xid)})`);
    const mine = d.addrs.some((a) => a.dev === p.dev && a.ip === lease.ip);
    const sent = socketSend(k, device, p.dev, lease.server, [DHCP_PORT.client, DHCP_PORT.server], data, {
      src: mine ? lease.ip : undefined,
      tos: 0,
      df: true,
    });
    if (sent) state(k, device, "client", "RELEASE", p.xid, lease.ip);
    else {
      out(k, device, p, "send_packet: Network is unreachable");
      out(k, device, p, "send_packet: please consult README file regarding broadcast address.");
      out(k, device, p, "dhclient.c:3587: Failed to send 300 byte long packet over fallback interface.");
    }
  }
  arm(k, device, p, k.s.t + RELEASE_MS);
}

/** A dhcp timer fired (world.ts dispatches every `dhcp` queue item here). */
export function dhcpTimer(k: Kernel, ev: Extract<Scheduled, { kind: "dhcp" }>): void {
  if (ev.role === "server") serverTimer(k, ev.device, ev.stamp);
  else if (ev.role === "client") clientTimer(k, ev.device, ev.pid, ev.stamp);
  else lifetimeEnds(k, ev.device, ev.dev ?? "", ev.ip ?? "", ev.stamp);
}

/** The kernel removes an address whose valid lifetime ran out (unless it was renewed since). */
function lifetimeEnds(k: Kernel, device: DeviceId, dev: IfaceName, ip: Ip, since: number): void {
  const d = deviceOf(k, device);
  const a = d?.addrs.find((x) => x.dev === dev && x.ip === ip);
  if (!a?.lft || a.lft.since !== since) return;
  addrDel(k, device, `${a.ip}/${a.prefix}`, dev);
}

/** A server's reply leaves (world.ts dispatches `dhcp-send` queue items here). */
export function dhcpSend(k: Kernel, ev: Extract<Scheduled, { kind: "dhcp-send" }>): void {
  serverSend(k, ev.device, ev.hex, ev.name, ev.ip, ev.ciaddr);
}

/**
 * The IP layer has a UDP datagram for one of this machine's addresses (or a broadcast): is a DHCP
 * program listening on its port? The server reads port 67; port 68 belongs to a running client
 * (which already read the message through its raw socket). True if the port is open.
 */
export function dhcpUdp(k: Kernel, device: DeviceId, dev: IfaceName, dstPort: number, data: Uint8Array): boolean {
  const d = deviceOf(k, device);
  if (!d) return false;
  if (dstPort === DHCP_PORT.server && d.dhcpServer) {
    serverInput(k, device, dev, toHex(data));
    return true;
  }
  return dstPort === DHCP_PORT.client && alive(d).length > 0;
}

/** Remaining lifetime as `ip addr` prints it: whole seconds since it was set are subtracted. */
export function lftLeft(a: AddrState, now: number): { valid: number; preferred: number } | null {
  if (!a.lft) return null;
  const gone = Math.floor((now - a.lft.since) / 1000);
  return { valid: Math.max(0, a.lft.valid - gone), preferred: Math.max(0, a.lft.preferred - gone) };
}
