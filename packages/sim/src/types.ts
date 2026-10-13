import type { Mac } from "./mac";
import type { PrngState } from "./prng";
import type { SlateState } from "./slate";

export type DeviceId = string;
export type IfaceName = string;
export type CmdSource = "typed" | "click" | "keeper" | "script";
/** An IPv4 address in dotted form, e.g. "10.0.0.5". */
export type Ip = string;

// ── Topology: the CORRECT network a room describes (SIM-40) ────────────────────────────────

export interface LabSpec {
  /** responder answers; listener never replies or sends (SIM-07). */
  mode: "responder" | "listener";
  /** Reply to a direct message. Default `hello from <hostname>`; a room with a key uses `key: <word>`. */
  reply?: string;
  answersBroadcast?: boolean;
  /** Its answer to a broadcast (default `I'm here — <hostname>`). */
  broadcastReply?: string;
}

/**
 * The automatic messenger: every `intervalMs` it writes to the address on its card (SIM-08). A door
 * name (MAC) gets a lab frame; a house address (IPv4, from Floor 5) gets a real ping (one echo request).
 */
export interface MessengerSpec {
  /** The card's address: a MAC, an IPv4 address, or "" for a blank card (the messenger sends nothing). */
  to: string;
  msg?: string;
  intervalMs?: number;
  dev?: IfaceName;
}

/** A messenger as it runs: its card, and the echo identifier and sequence of its pings. */
export interface MessengerState extends Required<MessengerSpec> {
  echoId: number;
  seq: number;
}

/**
 * Background announcements: a periodic UDP broadcast, a real IPv4 packet inside a frame. On the
 * first floors its inner packet is shown sealed.
 */
export interface AnnouncerSpec {
  ip: string;
  /** Who it's for: the whole street (e.g. 10.0.1.255, 6.1) or everyone (default 255.255.255.255). */
  dst?: string;
  port: number;
  text: string;
  intervalMs: number;
  dev?: IfaceName;
}

/** A Linux bridge (a switch): `ip link add br0 type bridge vlan_default_pvid 0`, ports enslaved. */
export interface BridgeSpec {
  name: IfaceName;
  ports: IfaceName[];
  /** Default: the lowest port MAC, as Linux picks. */
  mac?: Mac;
  /** Default 300 000 ms (Linux `ageing_time` 30000 centiseconds). */
  ageingMs?: number;
  adminUp?: boolean;
  /** Spanning tree on from the start (`stp_state 1`). Default off, as Linux creates a bridge. */
  stp?: boolean;
  /** Bridge priority (`priority`, 0–65535). Default 32768; the lowest bridge id becomes the root. */
  priority?: number;
}

export interface AddrSpec {
  dev: IfaceName;
  /** "10.0.0.5/24" */
  cidr: string;
}

export interface RouteSpec {
  /** "10.0.2.0/24" or "default" */
  dst: string;
  via?: Ip;
  dev?: IfaceName;
}

export interface DeviceSpec {
  id: DeviceId;
  hostname: string;
  kind: "host";
  interfaces: { name: IfaceName; mac: Mac; adminUp?: boolean }[];
  bridges?: BridgeSpec[];
  addrs?: AddrSpec[];
  routes?: RouteSpec[];
  /** e.g. { "net.ipv4.ip_forward": "1" }; anything unset has the Linux default. */
  sysctl?: Record<string, string>;
  lab?: LabSpec;
  messenger?: MessengerSpec;
  /** Several messengers (3.3: one card per door); `lab card --messenger N` picks one, from 1. */
  messengers?: MessengerSpec[];
  announcer?: AnnouncerSpec;
  /** A DHCP server on this machine (the registry, Floor 7): dnsmasq, as captured. */
  dhcpServer?: DhcpServerSpec;
}

/**
 * A DHCP server as dnsmasq runs it (`dnsmasq -i <dev> --dhcp-range=<a>,<b>,<lease>`, no DNS;
 * tools/golden/capture-dhcp.sh). Defaults are dnsmasq's.
 */
export interface DhcpServerSpec {
  /** The door it serves. Default: the machine's first door. */
  dev?: IfaceName;
  /** The first and last address it hands out. */
  range: [Ip, Ip];
  /** Default 3600 (dnsmasq's 1h). */
  leaseSecs?: number;
  /** The router option (3). Default: the server's own address (dnsmasq's default); null sends none. */
  router?: Ip | null;
  /** Ping an address before offering it (dnsmasq's default). false is `--no-ping`. */
  pingCheck?: boolean;
  /** `--dhcp-sequential-ip`: the lowest free address, not one picked from the client's MAC. */
  sequential?: boolean;
}

export interface EndRef {
  device: DeviceId;
  iface: IfaceName;
}

export interface LinkSpec {
  id: string;
  a: EndRef;
  b: EndRef;
  plugged?: boolean;
  /** One-way propagation delay, network ms. Default 0.05. */
  delayMs?: number;
  /** Default 1 Gbit/s. A slow link (e.g. 64 000) keeps a storm watchable (tech/simulator.md). */
  bandwidthBps?: number;
  /** Frames per direction (SIM-30). Default 64. */
  queueLimit?: number;
}

export interface Topology {
  devices: DeviceSpec[];
  links: LinkSpec[];
}

/** Declarative mutations applied on top of the correct network. */
export type Fault =
  | { kind: "iface-down"; device: DeviceId; iface: IfaceName }
  /** The cable is out: at one machine's end (`end`), or at both. */
  | { kind: "unplug"; link: string; end?: DeviceId }
  | { kind: "lab"; device: DeviceId; lab: LabSpec }
  /** A messenger's card (the first, or number `messenger`) holds the wrong address. */
  | { kind: "card"; device: DeviceId; to: string; messenger?: number }
  /** A static forwarding-database entry, as `bridge fdb add <mac> dev <port> master static [sticky]`. */
  | { kind: "fdb-static"; device: DeviceId; mac: Mac; port: IfaceName; sticky?: boolean }
  | { kind: "addr-remove"; device: DeviceId; cidr: string; dev: IfaceName }
  | { kind: "addr-set"; device: DeviceId; cidr: string; dev: IfaceName }
  | { kind: "route-remove"; device: DeviceId; dst: string }
  | { kind: "route-set"; device: DeviceId; route: RouteSpec }
  | { kind: "sysctl"; device: DeviceId; key: string; value: string }
  /** The registry's settings change (`dhcp-config`): no conflict check, another range, no router… */
  | { kind: "dhcp-config"; device: DeviceId; config: Partial<DhcpServerSpec> }
  /** A pinned neighbour line, as `ip neigh add <ip> lladdr <mac> dev <dev> nud permanent` (6.B). */
  | { kind: "neigh-permanent"; device: DeviceId; ip: Ip; mac: Mac; dev: IfaceName }
  /** The keeper has forgotten its job (hand mode, 0042): a switch's, a house's, or a router's. */
  | { kind: "keeper-asleep"; device: DeviceId; desk: "switch" | "host" | "router" };

// ── World state: plain JSON, so it snapshots (SIM-39) ──────────────────────────────────────

export interface IfaceState {
  name: IfaceName;
  ifindex: number;
  kind: "loopback" | "ether" | "bridge";
  mac: Mac;
  mtu: number;
  adminUp: boolean;
  /** Linux gives a NIC a real qdisc the first time it comes up; until then it shows `noop`. */
  everUp: boolean;
  link: string | null;
  /** The bridge this door is a port of, if any. */
  master: IfaceName | null;
}

/** One forwarding-database entry (`bridge fdb`). Local entries are the bridge's own port addresses. */
export interface FdbEntry {
  mac: Mac;
  port: IfaceName;
  local: boolean;
  static: boolean;
  sticky: boolean;
  /** Network time it was last learned or refreshed. */
  updated: number;
}

export interface BridgeState {
  name: IfaceName;
  /** The configured ageing time (`ageing_time`; the kernel's bridge_ageing_time). */
  ageingMs: number;
  fdb: FdbEntry[];
  /** The forwarding database's clean-up work (br_fdb_cleanup): when it next runs. */
  gc: StpTimer | null;
  /** The spanning tree (stp.ts): kept even with STP off, since port states outlive it. */
  stp: StpBridge;
}

/** A bridge port's state (`bridge link show`: "state …"). */
export type StpPortState = "disabled" | "blocking" | "listening" | "learning" | "forwarding";

/** A pending kernel timer: when it fires, and a stamp so a re-armed or deleted one is ignored. */
export interface StpTimer {
  at: number;
  stamp: number;
}

/** One bridge port's spanning-tree fields (the kernel's net_bridge_port). Times are network ms. */
export interface StpPort {
  name: IfaceName;
  /** 1, 2, 3… in the order the ports were added. */
  portNo: number;
  /** Port priority, 0–63 (shown "priority 32"). */
  priority: number;
  /** Path cost (shown "cost 2"). */
  cost: number;
  state: StpPortState;
  /** priority << 10 | port number (0x8001 for port 1). */
  portId: number;
  designatedRoot: string;
  designatedCost: number;
  designatedBridge: string;
  designatedPort: number;
  /** When the stored root information was born (now − its message age). */
  designatedAge: number;
  topologyChangeAck: boolean;
  configPending: boolean;
}

/** A bridge's spanning tree (the kernel's net_bridge STP fields, br_stp*.c). Times are network ms. */
export interface StpBridge {
  /** `stp_state`: kernel STP running. */
  enabled: boolean;
  priority: number;
  /** Bridge ids are 16 hex digits (priority, then MAC): string order is the kernel's memcmp. */
  bridgeId: string;
  designatedRoot: string;
  rootPathCost: number;
  /** Port number of the root port; 0 when this bridge is the root. */
  rootPort: number;
  /** The timers in use (learned from the root); bridge* are this bridge's own settings. */
  maxAge: number;
  helloTime: number;
  forwardDelay: number;
  bridgeMaxAge: number;
  bridgeHelloTime: number;
  bridgeForwardDelay: number;
  /** The ageing time in use: 2 × forward delay during a topology change (shown as ageing_time). */
  ageingNow: number;
  topologyChange: boolean;
  topologyChangeDetected: boolean;
  /** Pending timers: "hello", "tcn", "tc", and per port "<port>:age", "<port>:fwd", "<port>:hold". */
  timers: Record<string, StpTimer>;
  stamp: number;
  /** In the order they were added (the kernel walks its list newest first). */
  ports: StpPort[];
}

export interface AddrState {
  dev: IfaceName;
  ip: Ip;
  prefix: number;
  /** The broadcast address shown as `brd`: only if one was given (iproute2 6.x adds none by default). */
  broadcast: Ip | null;
  scope: "global" | "host";
  /** A further address in a subnet the door already has (shown "secondary"; no route of its own). */
  secondary: boolean;
  /**
   * Lifetimes, for an address given with them (`valid_lft`/`preferred_lft`, as dhclient-script
   * does): shown "dynamic", counting down from `since`, and removed when `valid` runs out. Absent: forever.
   */
  lft?: { valid: number; preferred: number; since: number };
}

export interface RouteState {
  /** "10.0.0.0/24", or "default" (0.0.0.0/0). */
  dst: string;
  via: Ip | null;
  dev: IfaceName;
  /** kernel: the connected route an address brings; boot: added by a person or the room; dhcp. */
  proto: "kernel" | "boot" | "dhcp";
  scope: "link" | "global";
  /** The preferred source (`src`), set on connected routes. */
  src: Ip | null;
  metric: number | null;
}

/**
 * A route exception (Linux's fib_nh_exception): an ICMP redirect told this machine a better next hop
 * for one destination. It hangs on the nexthop (`nh`: gateway and door of the route it came through)
 * and expires 300 s after it was last set (ip_rt_gc_timeout).
 */
export interface RouteException {
  dst: Ip;
  gw: Ip;
  dev: IfaceName;
  /** The nexthop it belongs to: `<via>|<dev>` of the route used. */
  nh: string;
  expires: number;
  /** A packet has gone out through it (only then does `ip route show cache` list it, as measured). */
  bound?: boolean;
}

export type NeighNud = "INCOMPLETE" | "REACHABLE" | "STALE" | "DELAY" | "PROBE" | "FAILED" | "PERMANENT";

/** One neighbour (ARP) table entry, with Linux's state machine (tech/simulator.md). */
export interface NeighState {
  ip: Ip;
  dev: IfaceName;
  mac: Mac | null;
  state: NeighNud;
  /** When an ARP reply last confirmed it. */
  confirmed: number;
  /** When a packet (or a probe) last went out through it. */
  used: number;
  /** Network time this entry's state last changed. */
  updated: number;
  probes: number;
  /** Packets waiting for the address (hex of the IPv4 packet). Linux keeps a small queue. */
  queue: { hex: string; origin: FrameOrigin; parent: number | null }[];
  /** Bumped on every timer reschedule; stale timers are ignored. */
  stamp: number;
}

/** A running `ping`. Its output goes to the trace as `proc.output` for its exec id. */
export interface PingProc {
  kind: "ping";
  execId: number;
  dst: Ip;
  /** As the user wrote it, for the header line. */
  target: string;
  count: number | null;
  intervalMs: number;
  /** -W: how long to wait for the last reply. */
  waitMs: number;
  ttl: number;
  id: number;
  sent: number;
  received: number;
  errors: number;
  /** Network time each sequence number was sent, for round-trip times. */
  sentAt: Record<number, number>;
  rtts: number[];
  /** The most requests outstanding at once (iputils' "pipe"). */
  pipe: number;
  started: number;
  numeric: boolean;
  done: boolean;
  /**
   * Messages queued on ping's socket while it wakes to read them (only once a redirect is waiting:
   * a socket error that arrives meanwhile is read first, as on Linux).
   */
  inbox?: {
    kind: "reply" | "redirect";
    from: Ip;
    seq: number;
    ttl: number;
    bytes: number;
    at: number;
    gw: Ip;
    code: number;
  }[];
}

/** A door's neighbour settings (net.ipv4.neigh.<door>.*), as Linux keeps them per door. */
export interface NeighParms {
  baseReachableMs: number;
  /** base × 0.5–1.5, chosen again whenever the base changes. */
  reachableMs: number;
  retransMs: number;
  delayFirstProbeMs: number;
  mcastSolicit: number;
  ucastSolicit: number;
}

/** A running `tcpdump`. Its lines go to the trace as `proc.output` for its exec id. */
export interface TcpdumpProc {
  kind: "tcpdump";
  execId: number;
  iface: IfaceName;
  /** The parsed filter (tcpdump.ts, Filter): plain JSON. */
  filter: unknown;
  count: number | null;
  /** How many -n: 1 no host names, 2 no port names either. */
  numeric: number;
  ether: boolean;
  hex: boolean;
  captured: number;
  done: boolean;
}

/** A message waiting at an asleep keeper's desk (hand mode, 0042). */
export interface DeskItem {
  kind: "frame" | "packet";
  hex: string;
  /** Where it came in (a frame's port, a forwarded packet's door) or goes out (a host's packet). */
  port: IfaceName | null;
  frameId: number;
}

export interface DeviceState {
  id: DeviceId;
  hostname: string;
  kind: "host";
  ifaces: IfaceState[];
  bridges: Record<IfaceName, BridgeState>;
  addrs: AddrState[];
  routes: RouteState[];
  neigh: NeighState[];
  /** Neighbour settings by door name ("default" for new doors). */
  neighParms: Record<IfaceName, NeighParms>;
  sysctl: Record<string, string>;
  /** Next IPv4 identification value for packets this machine originates. */
  ipId: number;
  /** ICMP error rate limiting per destination (Linux inet_peer tokens, ms). */
  icmpTokens: Record<Ip, { tokens: number; at: number; redirects?: number }>;
  /** Route exceptions ("cache <redirected>") left by ICMP redirects this machine accepted. */
  exceptions?: RouteException[];
  procs: (PingProc | TcpdumpProc | DhclientProc)[];
  /** Hand mode (0042): which keeper has forgotten its job, and what waits at its desk. */
  keeper: { asleep: "switch" | "host" | "router" | null; desk: DeskItem[] };
  lab: LabSpec | null;
  messengers: MessengerState[];
  announcer: (Required<AnnouncerSpec> & { nextId: number }) | null;
  /** The DHCP server's state, if this machine runs one. */
  dhcpServer?: DhcpServerState | null;
  /** What dhclient keeps on disk: its pid file and each door's last lease (the lease file). */
  dhclientDb?: {
    pidFile: "none" | "live" | "stale";
    pid: number;
    leases: Record<IfaceName, { ip: Ip; server: Ip; prefix: number }>;
  };
}

export interface DhcpServerState {
  dev: IfaceName;
  range: [Ip, Ip];
  leaseSecs: number;
  /** "self": the server's own address. */
  router: Ip | null | "self";
  pingCheck: boolean;
  sequential: boolean;
  leases: { mac: Mac; ip: Ip; expires: number }[];
  /** Declined addresses, held back until `until`. */
  declined: { ip: Ip; until: number }[];
  /** Addresses whose ping went unanswered (free), remembered 30 s. */
  pinged: { ip: Ip; mac: Mac; at: number }[];
  /** The ping it is waiting on (it handles nothing else meanwhile), with the DISCOVER it is for. */
  ping: { ip: Ip; id: number; mac: Mac; request: string; tried: Ip[]; started: number } | null;
  /** Messages that arrived while it waited (hex of the BOOTP payload). */
  backlog: string[];
  stamp: number;
}

/** A lease as the client holds it (times are network ms). */
export interface DhcpLease {
  ip: Ip;
  server: Ip;
  prefix: number;
  broadcast: Ip;
  router: Ip | null;
  leaseSecs: number;
  t1: number | null;
  t2: number | null;
  since: number;
  renewAt: number;
  rebindAt: number;
  expiresAt: number;
}

/** A running ISC dhclient for one door. Its output goes to the trace as `proc.output` for its exec id. */
export interface DhclientProc {
  kind: "dhclient";
  execId: number;
  pid: number;
  dev: IfaceName;
  verbose: boolean;
  /** Still holding the console; false once it has gone to the background (or for later doors). */
  foreground: boolean;
  /** The door whose end ends the command (with several doors, the first). */
  leader: boolean;
  mode: "get" | "release";
  state:
    | "init"
    | "selecting"
    | "requesting"
    | "checking"
    | "bound"
    | "renewing"
    | "rebinding"
    | "declined"
    | "sleeping"
    | "releasing";
  xid: number;
  /** ISC's retransmission interval, seconds. */
  interval: number;
  /** Whole network seconds when it started sending this message. */
  firstSending: number;
  secs: number;
  /** The lease being requested or checked. */
  offer: DhcpLease | null;
  /** The lease it holds. */
  lease: DhcpLease | null;
  /** Fedora's arping check in progress. */
  check: { step: "probe" | "settle" | "reprobe" | "reprobing" | "decline"; probes: number; renewing: boolean } | null;
  stamp: number;
  done: boolean;
}

export interface LinkState {
  id: string;
  a: EndRef;
  b: EndRef;
  /** Both ends in. (A cable works only when it is plugged in at both ends.) */
  plugged: boolean;
  /** Which ends are out: "a", "b". Empty when plugged. */
  out: ("a" | "b")[];
  delayMs: number;
  bandwidthBps: number;
  queueLimit: number;
  /** Per direction: 0 = a→b, 1 = b→a. */
  busyUntil: [number, number];
  inFlight: [number, number];
}

export type Scheduled =
  | { t: number; seq: number; kind: "arrive"; link: string; dir: 0 | 1; frameId: number; hex: string }
  | { t: number; seq: number; kind: "lab-reply"; device: DeviceId; iface: IfaceName; to: Mac; text: string }
  | { t: number; seq: number; kind: "timer"; device: DeviceId; service: "messenger" | "announcer"; index?: number }
  /** The forwarding database's clean-up work (br_fdb_cleanup). */
  | { t: number; seq: number; kind: "fdb-gc"; device: DeviceId; bridge: IfaceName; stamp: number }
  /** A spanning-tree timer (stp.ts): hello, tcn, tc, or a port's age, fwd or hold. */
  | { t: number; seq: number; kind: "stp"; device: DeviceId; bridge: IfaceName; timer: string; stamp: number }
  | { t: number; seq: number; kind: "neigh"; device: DeviceId; dev: IfaceName; ip: Ip; stamp: number }
  /** ping's timers; "read": it wakes to read what's waiting on its socket. */
  | { t: number; seq: number; kind: "ping"; device: DeviceId; execId: number; what: "send" | "finish" | "read" }
  /** A local error reaching ping a moment after the kernel posts it (the process wakes and reads it). */
  | {
      t: number;
      seq: number;
      kind: "ping-error";
      device: DeviceId;
      from: Ip;
      id: number;
      icmpSeq: number;
      type: number;
      code: number;
    }
  /** DHCP timers: a client's (by pid), the server's ping wait, an address lifetime ending (`lft`). */
  | {
      t: number;
      seq: number;
      kind: "dhcp";
      device: DeviceId;
      role: "client" | "server" | "lft";
      pid: number;
      stamp: number;
      dev?: IfaceName;
      ip?: Ip;
    }
  /** A DHCP server's reply leaving, a moment after the request came in. */
  | {
      t: number;
      seq: number;
      kind: "dhcp-send";
      device: DeviceId;
      role: "server";
      hex: string;
      name: "OFFER" | "ACK" | "NAK";
      ip: Ip;
      ciaddr: Ip;
    };

export interface WorldState {
  t: number;
  seq: number;
  nextFrameId: number;
  prng: PrngState;
  devices: Record<DeviceId, DeviceState>;
  links: Record<string, LinkState>;
  queue: Scheduled[];
  /** The Slate's catches and what it's waiting for (0043); absent until it's first used. */
  slate?: SlateState;
}

// ── The event trace (SIM-35) ───────────────────────────────────────────────────────────────

export type DropReason =
  | "not-for-me"
  | "link-down"
  | "no-route"
  | "arp-failed"
  | "ttl-expired"
  | "forwarding-disabled"
  | "queue-full"
  | "fdb-filter"
  /** A bridge port that isn't forwarding (spanning tree: blocking, listening or learning). */
  | "port-blocked"
  | "no-listener"
  | "bad-checksum";

/** The table line a decision used, so the keeper can say exactly why (CORE-25). */
export type TableRef = {
  dst: Mac;
  /** The door's own address (a host's MAC check). */
  own?: Mac;
  /** The forwarding-database line a bridge used; null when it didn't know (and flooded). */
  fdb?: { mac: Mac; port: IfaceName; static: boolean; local: boolean } | null;
  /** For IPv4: the destination address and the route used. */
  ip?: Ip;
  route?: { dst: string; via: Ip | null; dev: IfaceName } | null;
};

export type SimEvent =
  | {
      kind: "frame.tx";
      t: number;
      device: DeviceId;
      iface: IfaceName;
      frameId: number;
      bytes: Uint8Array;
      summary: string;
      /** What sent it: a command the player ran, one of the device's own services, or forwarding. */
      origin: FrameOrigin;
      /** For a forwarded or flooded copy: the frame it continues (replay follows a message, CORE-23). */
      parent?: number;
    }
  | {
      kind: "frame.rx";
      t: number;
      device: DeviceId;
      iface: IfaceName;
      frameId: number;
      bytes: Uint8Array;
      summary: string;
    }
  | {
      kind: "link.enter";
      t: number;
      link: string;
      dir: 0 | 1;
      frameId: number;
      from: EndRef;
      to: EndRef;
      /** Network time at which the frame will reach the far door. */
      arriveAt: number;
      bytes: Uint8Array;
      summary: string;
    }
  | { kind: "link.exit"; t: number; link: string; dir: 0 | 1; frameId: number }
  | { kind: "frame.drop"; t: number; device: DeviceId; iface?: IfaceName; frameId: number; reason: DropReason }
  | {
      kind: "fwd.decision";
      t: number;
      device: DeviceId;
      frameId: number;
      layer: "l2" | "l3";
      decision: "forward" | "flood" | "deliver" | "drop";
      egress: IfaceName[];
      /** What the decision was based on: the frame's destination and the table line used. */
      tableRef: TableRef;
    }
  | {
      kind: "table.change";
      t: number;
      device: DeviceId;
      table: "fdb" | "neigh" | "route" | "addr" | "link" | "sysctl" | "lab" | "stp";
      op: "set" | "add" | "del";
      key: string;
      before: unknown;
      after: unknown;
    }
  /** A command ran. exitCode is null for one that keeps running (its end is a `proc.exit`). */
  | {
      kind: "cmd.exec";
      t: number;
      device: DeviceId;
      execId: number;
      line: string;
      source: CmdSource;
      exitCode: number | null;
    }
  | {
      kind: "proc.output";
      t: number;
      device: DeviceId;
      execId: number;
      text: string;
      /**
       * `note` is game-only dim text (lab notes, subtitles), never part of real output.
       * `control` is a console action (`clear`, `exit`), not text.
       */
      stream: "stdout" | "stderr" | "note" | "control";
    }
  /** A streaming command (ping) finished, by itself or by Ctrl+C. */
  | { kind: "proc.exit"; t: number; device: DeviceId; execId: number; exitCode: number }
  | {
      kind: "app.deliver";
      t: number;
      device: DeviceId;
      iface: IfaceName;
      proto: "lab";
      frameId: number;
      from: Mac;
      to: Mac;
      text: string;
    }
  /** An ICMP error sent (debriefs and the keeper's "why"). */
  | {
      kind: "icmp.error";
      t: number;
      device: DeviceId;
      type: "net-unreachable" | "host-unreachable" | "port-unreachable" | "time-exceeded" | "redirect";
      to: Ip;
      /** The frame whose packet caused it. */
      about: number;
    }
  /** A message waits at an asleep keeper's desk (hand mode). */
  | {
      kind: "keeper.hold";
      t: number;
      device: DeviceId;
      desk: "switch" | "host" | "router";
      frameId: number;
      about: string;
    }
  /** A hand step the player took (learn, send, arp-ask, wrap, forward) or the keeper waking. */
  | { kind: "keeper.step"; t: number; device: DeviceId; action: string; args: string[]; frameId: number | null }
  /** The Slate (0043): armed, a catch kept, a catch opened down to a layer, two catches compared. */
  | { kind: "slate.arm"; t: number; device: DeviceId; what: "catch" | "trace" }
  | {
      kind: "slate.catch";
      t: number;
      n: number;
      device: DeviceId;
      iface: IfaceName;
      dir: "in" | "out";
      frameId: number;
      traced: boolean;
    }
  | { kind: "slate.open"; t: number; n: number; layer: "frame" | "packet" | "message"; reached: boolean }
  | {
      kind: "slate.compare";
      t: number;
      a: number;
      b: number;
      changed: string[];
      samePacket: boolean;
      sameStreet: boolean;
    }
  /** A messenger's ping (its card holds a house address) was answered. */
  | {
      kind: "echo.heard";
      t: number;
      device: DeviceId;
      messenger: number;
      from: Ip;
      seq: number;
      frameId: number | null;
    }
  /** The player touched a control that runs nothing: a worn-out switch or lever (0040). */
  | { kind: "control.touch"; t: number; device: DeviceId; control: string }
  /**
   * DHCP, step by step (the room shows the four messages): a message sent (DISCOVER, OFFER,
   * REQUEST, ACK, NAK, DECLINE, RELEASE), or a change: BOUND (the client took its lease), IN-USE (the
   * server's ping was answered), CONFLICT (the client's ARP check was answered), EXPIRED.
   */
  | {
      kind: "dhcp.state";
      t: number;
      device: DeviceId;
      role: "client" | "server";
      what:
        | "DISCOVER"
        | "OFFER"
        | "REQUEST"
        | "ACK"
        | "NAK"
        | "DECLINE"
        | "RELEASE"
        | "BOUND"
        | "IN-USE"
        | "CONFLICT"
        | "EXPIRED";
      xid: number;
      ip: Ip | null;
      leaseSecs?: number;
    }
  | { kind: "world.reset"; t: number };

export type SimEventKind = SimEvent["kind"];
export type FrameOrigin =
  | "command"
  | "responder"
  | "messenger"
  | "announcer"
  | "forward"
  | "kernel"
  | "ping"
  | "keeper"
  | "dhcp";
export type Unsubscribe = () => void;
