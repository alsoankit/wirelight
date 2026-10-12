import type { Mac } from "./mac";
import type { PrngState } from "./prng";

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
}

/** The automatic messenger: sends a lab frame every `intervalMs` to the address on its card (SIM-08). */
export interface MessengerSpec {
  to: Mac;
  msg?: string;
  intervalMs?: number;
  dev?: IfaceName;
}

/**
 * Background announcements: a periodic UDP broadcast, a real IPv4 packet inside a frame. On the
 * first floors its inner packet is shown sealed.
 */
export interface AnnouncerSpec {
  ip: string;
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
  announcer?: AnnouncerSpec;
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
  | { kind: "unplug"; link: string }
  | { kind: "lab"; device: DeviceId; lab: LabSpec }
  /** The messenger's card holds the wrong address. */
  | { kind: "card"; device: DeviceId; to: Mac }
  /** A static forwarding-database entry, as `bridge fdb add <mac> dev <port> master static [sticky]`. */
  | { kind: "fdb-static"; device: DeviceId; mac: Mac; port: IfaceName; sticky?: boolean }
  | { kind: "addr-remove"; device: DeviceId; cidr: string; dev: IfaceName }
  | { kind: "addr-set"; device: DeviceId; cidr: string; dev: IfaceName }
  | { kind: "route-remove"; device: DeviceId; dst: string }
  | { kind: "route-set"; device: DeviceId; route: RouteSpec }
  | { kind: "sysctl"; device: DeviceId; key: string; value: string }
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
  ageingMs: number;
  fdb: FdbEntry[];
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
  icmpTokens: Record<Ip, { tokens: number; at: number }>;
  procs: (PingProc | TcpdumpProc)[];
  /** Hand mode (0042): which keeper has forgotten its job, and what waits at its desk. */
  keeper: { asleep: "switch" | "host" | "router" | null; desk: DeskItem[] };
  lab: LabSpec | null;
  messenger: Required<MessengerSpec> | null;
  announcer: (Required<AnnouncerSpec> & { nextId: number }) | null;
}

export interface LinkState {
  id: string;
  a: EndRef;
  b: EndRef;
  plugged: boolean;
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
  | { t: number; seq: number; kind: "timer"; device: DeviceId; service: "messenger" | "announcer" }
  | { t: number; seq: number; kind: "fdb-age"; device: DeviceId; bridge: IfaceName; mac: Mac; updated: number }
  | { t: number; seq: number; kind: "neigh"; device: DeviceId; dev: IfaceName; ip: Ip; stamp: number }
  | { t: number; seq: number; kind: "ping"; device: DeviceId; execId: number; what: "send" | "finish" }
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
    };

export interface WorldState {
  t: number;
  seq: number;
  nextFrameId: number;
  prng: PrngState;
  devices: Record<DeviceId, DeviceState>;
  links: Record<string, LinkState>;
  queue: Scheduled[];
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
      table: "fdb" | "neigh" | "route" | "addr" | "link" | "sysctl" | "lab";
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
      type: "net-unreachable" | "host-unreachable" | "port-unreachable" | "time-exceeded";
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
  | "keeper";
export type Unsubscribe = () => void;
