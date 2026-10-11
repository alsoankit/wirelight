import type { Mac } from "./mac";
import type { PrngState } from "./prng";

export type DeviceId = string;
export type IfaceName = string;
export type CmdSource = "typed" | "click" | "keeper" | "script";

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
 * Background announcements (SRS §13.1): a periodic UDP broadcast, a real IPv4 packet inside a frame.
 * On Floors 0–1 its inner packet is shown sealed.
 */
export interface AnnouncerSpec {
  ip: string;
  port: number;
  text: string;
  intervalMs: number;
  dev?: IfaceName;
}

export interface DeviceSpec {
  id: DeviceId;
  hostname: string;
  kind: "host";
  interfaces: { name: IfaceName; mac: Mac; adminUp?: boolean }[];
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
  /** Default 1 Gbit/s. */
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
  | { kind: "card"; device: DeviceId; to: Mac };

// ── World state: plain JSON, so it snapshots (SIM-39) ──────────────────────────────────────

export interface IfaceState {
  name: IfaceName;
  ifindex: number;
  mac: Mac;
  mtu: number;
  adminUp: boolean;
  /** Linux gives a NIC a real qdisc the first time it comes up; until then it shows `noop`. */
  everUp: boolean;
  link: string | null;
}

export interface DeviceState {
  id: DeviceId;
  hostname: string;
  kind: "host";
  ifaces: IfaceState[];
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
  | { t: number; seq: number; kind: "timer"; device: DeviceId; service: "messenger" | "announcer" };

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

export type SimEvent =
  | {
      kind: "frame.tx";
      t: number;
      device: DeviceId;
      iface: IfaceName;
      frameId: number;
      bytes: Uint8Array;
      summary: string;
      /** What sent it: a command the player ran, or one of the device's own services. */
      origin: FrameOrigin;
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
      /** What the decision was based on, e.g. the frame's destination and the door's own address. */
      tableRef: { dst: Mac; own: Mac };
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
  | { kind: "cmd.exec"; t: number; device: DeviceId; execId: number; line: string; source: CmdSource; exitCode: number }
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
  | { kind: "world.reset"; t: number };

export type SimEventKind = SimEvent["kind"];
export type FrameOrigin = "command" | "responder" | "messenger" | "announcer";
export type Unsubscribe = () => void;
