/**
 * The room definition format (tech/room-format.md). Logic only: every word the player reads is in
 * packages/content, found by the room's `content` id (0055).
 */

import type { CardId } from "@wirelight/content";
import type { ToolId } from "@wirelight/shell";
import type { DeviceId, Fault, IfaceName, SimEvent, Topology, WorldView } from "@wirelight/sim";

/** What a predicate can see: the trace since the room (re)started, and the world as it is now. */
export interface Facts {
  trace: readonly SimEvent[];
  world: WorldView;
}
export type Predicate = (f: Facts) => boolean;

/** Something in a room the player can see: restoration spreads from it (CORE-39). */
export type ObjectRef =
  | { kind: "door"; device: DeviceId; iface: IfaceName }
  | { kind: "corridor"; link: string }
  | { kind: "workbench"; device: DeviceId }
  | { kind: "card"; device: DeviceId }
  | { kind: "board"; device: DeviceId }
  | { kind: "keeper"; device: DeviceId }
  | { kind: "ledger"; device: DeviceId }
  | { kind: "slot"; device: DeviceId; iface: IfaceName };

export interface HealthCheck {
  id: string;
  object: ObjectRef;
  check: Predicate;
}

/** A detector for a misunderstanding. Its note and "What you tried" line are content, by this id. */
export interface Misconception {
  id: string;
  detect: Predicate;
}

/** Why a machine can't be entered is content (`access` in the room's text). */
export type Access = { state: "enterable" } | { state: "off-limits" } | { state: "locked-for-now" };

export interface HintTiming {
  /** First hint after this much time... */
  firstAfterMs?: number;
  /** ...each next one after this much more... */
  nextAfterMs?: number;
  /** ...but the reveal never before this (bosses: 12 minutes). */
  revealAfterMs?: number;
}

/**
 * One step of a script (a solution, an alternative, a detector test): a command line on a device,
 * as typed or as a click runs it, then `waitMs` of network time (default 5 s). `click` steps must be
 * runnable from a working control when the console isn't there (ROOM-06).
 */
export type SolutionStep =
  | { device: DeviceId; line: string; source?: "typed" | "click"; waitMs?: number }
  /** Touching a worn-out control (0040): nothing runs, the trace records it. */
  | { device: DeviceId; touch: string; waitMs?: number };

/** A step that runs a command line. */
export type CommandStep = Extract<SolutionStep, { line: string }>;

/** A control is working (shows "the machine heard:"), worn out (0040), or not there. */
export type ControlState = "works" | "broken";

/**
 * Every control a room has (0040): what the player can do without typing. Each click runs a real
 * command, shown as "the machine heard:" (see it, then say it):
 * - plate: `ip link show <door>` (always readable) · its switch: `ip link set <door> up|down`
 * - cable end: `lab cable plug|unplug <door>` · workbench: `lab send-frame …` · card: `lab card …`
 * - MAC board: `bridge fdb show` · ledger: `ip neigh show` · routing board: `ip route …`
 * - address slot: `ip addr add|del <cidr> dev <door>` · desk: `lab keeper …`
 * - the Scanner: `lab scanner catch|open|list` (6.1), Capture = `tcpdump -n -i <door>` (8.4),
 *   Trace and Compare = `lab scanner trace|compare` (9.1)
 */
export interface Controls {
  /** hidden before the gift of the voice (2.4); echo-only: shows the commands clicks run; typing. */
  console: "hidden" | "echo-only" | "typing";
  /** The Prologue's Send button: the command it runs. */
  sendButton?: CommandStep;
  /** Open the Map when the Send button is pressed (ONB-19). */
  mapOnSend?: boolean;
  /** The workbench (lab send-frame), on `observatory`. */
  workbench?: ControlState;
  /** The messenger's address card (lab card --to). */
  card?: ControlState;
  /** Catching passing messages (Captures, then the Scanner). */
  catching?: boolean;
  /** Plate reading (ip link show) is always possible where plates are; their switches by "device:iface". */
  plateSwitches?: Record<string, ControlState>;
  /** Loose cable ends by "device:iface" (lab cable plug|unplug). */
  cableEnds?: Record<string, ControlState>;
  /** A switch's MAC board by device (`bridge fdb show`, read from 3.1). */
  macBoards?: Record<DeviceId, ControlState>;
  /** A machine's neighbour ledger by device (`ip neigh show`, from 6.2). */
  ledgers?: Record<DeviceId, ControlState>;
  /** Address slots by "device:iface" (`ip addr add|del`, from 5.2). */
  addressSlots?: Record<string, ControlState>;
  /** Routing boards by device (`ip route`, from 8.2). */
  routingBoards?: Record<DeviceId, ControlState>;
  /** A keeper's desk for hand work (0042): the device whose keeper has forgotten. */
  desk?: DeviceId;
  /** The Scanner's abilities (0043): catch and open (6.1), Capture (8.4), Trace and Compare (9.1). */
  scanner?: { catch?: boolean; capture?: boolean; trace?: boolean };
  /** Time control as a puzzle tool (4.1): slow, fast, pause. */
  timeControl?: boolean;
}

export interface RoomDef {
  id: string;
  region: number;
  /** 0 is the Prologue. */
  floor: number;
  /** Order within the floor; a boss is last. */
  order: number;
  kind: "prologue" | "learn" | "break" | "practice" | "boss" | "secret";
  /**
   * Which paths play it (0009): all · building-block (skipped on "Know a little") · tool (introduces
   * a tool: kept on "Know networking") · core (played on "New" and "Know a little") · boss.
   */
  pathTag: "all" | "building-block" | "tool" | "core" | "boss";
  /** The room's text in packages/content (title, mission, notes, hints, detectors, debrief…). */
  content: string;
  /** Values for the text's `{name}` placeholders (addresses and the like). */
  vars?: Record<string, string>;
  seed: number;

  topology: Topology;
  faults: Fault[];
  playerDevice: DeviceId;
  access: Record<DeviceId, Access>;
  controls: Controls;
  tools: { unlock?: ToolId[]; restrict?: ToolId[] };
  glow: "causes" | "symptoms" | "none";
  subtitles?: boolean;
  /** The Map is open when the room starts. */
  mapOpen?: boolean;

  winCondition: Predicate;
  /** Floors 1–4: the key is real text in an answer; from Floor 5, a mark on the winning answer; 1.1: a lock that opens. */
  key: { word: string; via: "lab-text" | "mark" | "lock" };
  healthChecks: HealthCheck[];
  hintTiming?: HintTiming;

  /** Term ids taught here and used here (0015, content/terms.ts). */
  teaches: string[];
  uses: string[];
  /** Discovery cards that open in this room. */
  cards: CardId[];
  /** Command memory (0041) this room plays, if any (at most one, ROOM-07). */
  commandMemory?: string;

  misconceptions: Misconception[];
  /** Scripts that trigger each misconception, so CI proves every detector works (ROOM-03). */
  detectorTests: { misconception: string; steps: SolutionStep[] }[];
  solution: SolutionStep[];
  /** Other correct routes the validator must also accept. */
  altSolutions?: SolutionStep[][];

  /**
   * Room rules the engine applies after each change: when `when` holds, `then` happens (once).
   * Used for hand mode: the keeper remembers after enough frames were done by hand (0042).
   */
  rules?: { id: string; when: Predicate; then: { kind: "wake-keeper"; device: DeviceId } }[];
}

export function defineRoom(def: RoomDef): RoomDef {
  return def;
}

/** A floor: its rooms in order, its boss, its floor memory and journal page (ROOM-09). */
export interface FloorDef {
  floor: number;
  region: number;
  /** Content id of the floor's text (floor memory chapters, journal page, farewell). */
  content: string;
  rooms: string[];
  boss: string;
  /** Which room hides the journal page. */
  journalRoom: string;
  /** The region's secret room, on the floor where its door is (CORE-45): optional, never blocking. */
  secret?: string;
}

export function defineFloor(def: FloorDef): FloorDef {
  return def;
}
