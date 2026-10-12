/** The room definition format (tech/room-format.md). Logic only: all text is in packages/content. */

import type { CardId } from "@wirelight/content";
import type { ToolId } from "@wirelight/shell";
import type { DeviceId, Fault, IfaceName, SimEvent, Topology, WorldView } from "@wirelight/sim";

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
  /** The room's text in packages/content (title, mission, notes, hints, detector notes, debrief). */
  content: string;
  /** Values for the text's `{name}` placeholders (addresses and the like). */
  vars?: Record<string, string>;
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
  /** Overrides for FR-HINT-07 defaults (bosses: reveal no earlier than 12 min). */
  hintTiming?: HintTiming;
  misconceptions: Misconception[];
  solution: SolutionStep[];
  /** Scripts that trigger each misconception, so CI can prove every detector works (ROOM-03c). */
  detectorTests: { misconception: string; steps: SolutionStep[] }[];
}

export function defineRoom(def: RoomDef): RoomDef {
  return def;
}
