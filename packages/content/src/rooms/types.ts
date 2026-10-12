import type { CardId } from "../cards";

/**
 * A room's player-facing text (tech/room-format.md). The room itself (packages/rooms) holds only
 * logic and refers to this by its id. `{name}` placeholders are filled from the room's `vars`
 * (addresses and the like), so the text never copies a value the room defines.
 */
export interface RoomText {
  title: string;
  /** Two sentences at most (ROOM-04). */
  mission: string;
  /** The Knight's notes found in the room. */
  notes: string[];
  /** Exactly five; the third (the idea) links to a Codex entry. */
  hints: [Hint, Hint, Hint, Hint, Hint];
  /** For each of the room's detectors, by id: the Knight's note when it fires, and one line for the debrief. */
  detectors: Record<string, { note: string; tried: string }>;
  debrief: { happened: string; terms: { term: string; meaning: string }[] };
  /** Why a machine can't be entered, by device id (sealed or not yet). */
  access?: Record<string, string>;
}

export interface Hint {
  text: string;
  codex?: CardId;
}
