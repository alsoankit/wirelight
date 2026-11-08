import type { Tier } from "../render/quality";

// The play logs' shapes (account/logs.ts), shared by the queue, the sign-in service (account/supabase.ts)
// and the table they're kept in (supabase/migrations/0001_play_logs.sql).

/** How fast this device draws the palace: the tier in use, whether the game picked it, the median frame time. */
export type Device = {
  /** The graphics tier the palace was drawn at when the room ended (null before the first frame). */
  tier: Tier | null;
  /** True when the game picked the tier itself (Automatic); false when the player chose one by hand. */
  auto: boolean;
  /** The median time a frame took during the room, in milliseconds (null when no frame was drawn). */
  frameMs: number | null;
};

/** Everything sent for one room, and nothing more (the privacy note in Settings lists the same). */
export type Payload = {
  v: 1;
  roomId: string;
  /** Seconds in the room, up to its win or until the player left it. */
  seconds: number;
  /** True when the room was restored (won). */
  won: boolean;
  /** Hints (memory fragments) opened in the room. */
  hints: number;
  /** Mistakes the room caught: its detector ids, in the order they fired. */
  mistakes: string[];
  /** The commands typed in the terminal, in order; any other typed text is left out. */
  commands: string[];
  device: Device;
};

/** One room's play log waiting to be sent: a row of `play_logs`. */
export type Entry = {
  /** The row's id, the same for every try at sending it (a repeat is recognised and not added again). */
  id: string;
  /** Who it belongs to: the signed-in player it was recorded for. */
  userId: string;
  roomId: string;
  payload: Payload;
};

/** How one try at sending went: sent (or already there), worth another try later, or never going to work. */
export type SendResult = "sent" | "retry" | "drop";

/** Whether play logs may be sent now: who is signed in (if anyone), and whether their switch is on. */
export type Consent = { userId: string | null; on: boolean };
