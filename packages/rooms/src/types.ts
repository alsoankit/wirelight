/** The room definition format (SRS §15). */
import type { ToolId } from "@wirelight/shell";
import type { DeviceId, Fault, IfaceName, SimEvent, Topology, WorldView } from "@wirelight/sim";
import type { CardId } from "./content/cards";

/** What a predicate can see: the trace since the room (re)started, and the world as it is now. */
export interface Facts {
  trace: readonly SimEvent[];
  world: WorldView;
}
export type Predicate = (f: Facts) => boolean;

/** Something in a room the player can see: restoration spreads from it (ROOM-04). */
export type ObjectRef =
  | { kind: "door"; device: DeviceId; iface: IfaceName }
  | { kind: "corridor"; link: string }
  | { kind: "workbench"; device: DeviceId }
  | { kind: "card"; device: DeviceId };

export interface HealthCheck {
  id: string;
  object: ObjectRef;
  check: Predicate;
}

export interface Misconception {
  id: string;
  detect: Predicate;
  /** The Knight's note when it fires: addresses the misunderstanding, never gives the answer. */
  note: string;
  /** One line for the debrief's "What you tried". */
  tried: string;
}

export type Access =
  | { state: "enterable" }
  | { state: "off-limits"; reason: string }
  | { state: "locked-for-now"; text: string };

export interface Hint {
  text: string;
  /** Hint 3 (the idea) links to a Codex entry. */
  codex?: CardId;
}

export interface HintTiming {
  /** First hint after this much time... */
  firstAfterMs?: number;
  /** ...each next one after this much more... */
  nextAfterMs?: number;
  /** ...but the reveal never before this. */
  revealAfterMs?: number;
}

export interface SolutionStep {
  device: DeviceId;
  line: string;
}

export interface RoomDef {
  id: string;
  floor: number;
  order: number;
  kind: "prologue" | "learn" | "break" | "boss" | "secret";
  title: string;
  mission: string;
  seed: number;

  topology: Topology;
  faults: Fault[];
  playerDevice: DeviceId;
  access: Record<DeviceId, Access>;
  /** Which controls the room shows. The Prologue has only a Send button; the workbench lives on Floors 0–1. */
  controls: {
    console: "hidden" | "echo-only" | "typing";
    workbench: boolean;
    sendButton?: SolutionStep;
    /** Open the Scrying Glass when the Send button is pressed, so the player watches the message travel. */
    glassOnSend?: boolean;
    /** The messenger's address card is on the desk and can be clicked. */
    card?: boolean;
    /** Passing messages can be caught into the capture jar (from room 0.2, FR-PKT-08). */
    catching?: boolean;
  };
  tools: { unlock?: ToolId[]; restrict?: ToolId[] };
  glow: "causes" | "symptoms" | "none";
  subtitles?: boolean;
  /** The Glass is open when the room starts. */
  glassOpen?: boolean;

  winCondition: Predicate;
  key: { word: string; via: "lab-text" };
  healthChecks: HealthCheck[];

  cards: CardId[];
  notes: string[];
  hints: [Hint, Hint, Hint, Hint, Hint];
  /** Overrides for FR-HINT-07 defaults (bosses: reveal no earlier than 12 min). */
  hintTiming?: HintTiming;
  misconceptions: Misconception[];
  debrief: { happened: string; terms: { term: string; meaning: string }[] };
  solution: SolutionStep[];
  /** Scripts that trigger each misconception, so CI can prove every detector works (ROOM-03c). */
  detectorTests: { misconception: string; steps: SolutionStep[] }[];
}

export function defineRoom(def: RoomDef): RoomDef {
  return def;
}
