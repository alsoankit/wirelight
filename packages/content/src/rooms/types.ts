import type { CardId } from "../cards";

/**
 * A room's player-facing text (tech/room-format.md, 0055). The room itself (packages/rooms) holds only
 * logic and refers to this by its id. `{name}` placeholders are filled from the room's `vars`.
 */
export interface RoomText {
  title: string;
  /** Two sentences at most (ROOM-04). */
  mission: string;
  /** The robot's notes found in the room. */
  notes: string[];
  /** Exactly five; the third (the idea) links to a Notebook entry. */
  hints: [Hint, Hint, Hint, Hint, Hint];
  /** For each of the room's detectors, by id: the robot's note when it fires, and one line for the debrief. */
  detectors: Record<string, { note: string; tried: string }>;
  /** What happened, and the new words: each with its term id (the room's `teaches`). */
  debrief: { happened: string; terms: { id: string; term: string; meaning: string }[] };
  /** Why a machine can't be entered, by device id (sealed or not yet). */
  access?: Record<string, string>;
  /** Tips (0008): when they play, what is said, what the player then does. */
  memories?: { id: string; title: string; trigger: string; text: string; action?: string }[];
  /** Questions the player can ask in the room (0036): question and answer; `after` when it opens later. */
  questions?: { q: string; a: string; after?: string }[];
  /** Building memory (0037, Regions 1–2): what's said, and what's shown. */
  building?: { id: string; text: string; shown: string };
  /** Field Guide topics this room opens. */
  fieldGuide?: string[];
  /** Other voiced lines (a boss introduction, the gift of the voice, a keeper…), by id. */
  voice?: { id: string; speaker: string; text: string }[];
}

export interface Hint {
  text: string;
  codex?: CardId;
}

/** A floor's own text: its memory, its journal page, its farewell. */
export interface FloorText {
  name: string;
  memory: { id: string; title: string; text: string; shown?: string }[];
  journal: { page: number; title: string; where: string; text: string };
  farewell?: { id: string; speaker: string; text: string };
}
