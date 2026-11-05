import { isCommandLine } from "@wirelight/shell/names";
import type { RoomVisit } from "../dev/playtest";
import type { Consent, Device, Entry, Payload, SendResult } from "./types";

// Play logs (opt-in): while a signed-in player has "Send my play logs" switched on, each room they finish
// or leave is sent as one record: the time in it, whether it was won, hints, the mistakes it caught, the
// commands typed (and no other typed text) and how fast the device drew. Records wait in this browser
// while it's offline and go when it's back; switching off or signing out forgets the ones not yet sent.
// Wired to the page and the account in account/PlayLogs.tsx; the table is
// supabase/migrations/0001_play_logs.sql.

/** Commands kept per room (the first ones), so a long room still makes a small record. */
export const MAX_COMMANDS = 100;
/** Characters kept per command line. */
export const MAX_LINE = 160;
/** Records kept waiting to be sent (the newest): a long time offline costs the oldest rooms. */
export const MAX_QUEUE = 100;
/** The records waiting to be sent, as a JSON array (removed when there are none). */
export const QUEUE_KEY = "wirelight.logs.queue";
/** The room under way when the page was last hidden, as one Entry, in case the page closed. */
export const OPEN_KEY = "wirelight.logs.open";

// After a failed send the next try waits 30 s, then twice as long each time, up to 15 minutes.
const FIRST_WAIT = 30_000;
const LONGEST_WAIT = 15 * 60_000;

/**
 * The record sent for a room: exactly the Payload fields, copied one by one so nothing else of the visit
 * (failed lines, Ask uses, times of day) goes with it. Of the lines typed, only commands are kept: any
 * other text typed into the terminal could be the player's own words.
 */
export function payloadOf(v: RoomVisit, device: Device): Payload {
  // A visit saved before typed lines were kept has none.
  const commands = (v.typed ?? [])
    .filter(isCommandLine)
    .slice(0, MAX_COMMANDS)
    .map((line) => line.slice(0, MAX_LINE));
  return {
    v: 1,
    roomId: v.roomId,
    seconds: v.seconds,
    won: v.won,
    hints: v.hints,
    mistakes: [...v.mistakes],
    commands,
    device: { tier: device.tier, auto: device.auto, frameMs: device.frameMs },
  };
}

/**
 * A UUID-shaped id that is the same for the same player, room and visit start, so a record sent twice (a
 * retry whose first try did arrive, or a kept room sent again) is recognised as one. It's a 128-bit hash
 * (cyrb128: not cryptographic, it only has to tell visits apart) laid out as a UUID with version 8 (RFC
 * 9562's custom kind) and the usual variant bits.
 */
export function entryId(userId: string, roomId: string, start: string): string {
  const hex = cyrb128(`${userId}|${roomId}|${start}`)
    .map((h) => h.toString(16).padStart(8, "0"))
    .join("");
  const variant = ((Number.parseInt(hex.charAt(16), 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20)}`;
}

/** bryc's cyrb128: four 32-bit lanes of a simple string hash, mixed together at the end. */
function cyrb128(text: string): number[] {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0; i < text.length; i++) {
    const k = text.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  h1 ^= h2 ^ h3 ^ h4;
  h2 ^= h1;
  h3 ^= h1;
  h4 ^= h1;
  return [h1 >>> 0, h2 >>> 0, h3 >>> 0, h4 >>> 0];
}

/** A room's record as it waits to be sent: its row of `play_logs`. */
export function entryOf(v: RoomVisit, userId: string, device: Device): Entry {
  return { id: entryId(userId, v.roomId, v.start), userId, roomId: v.roomId, payload: payloadOf(v, device) };
}

/**
 * Adds an entry at the end of the queue. One already there with the same id (the same visit, recorded
 * again) goes, so the newer record wins; past `max`, the oldest go.
 */
export function enqueue(queue: readonly Entry[], entry: Entry, max = MAX_QUEUE): Entry[] {
  const next = [...queue.filter((e) => e.id !== entry.id), entry];
  return next.slice(Math.max(0, next.length - max));
}

/** What the play logs need from the page (account/PlayLogs.tsx), passed in so the queue runs in tests too. */
export type LogsDeps = {
  /** Who is signed in and whether their switch is on; read again before every send. */
  consent(): Consent;
  /** One try at sending an entry (account/supabase.ts). A rejection counts as "retry". */
  send(entry: Entry): Promise<SendResult>;
  /** Where records wait between visits (localStorage); with none, the queue lives in memory. */
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
  /** Whether the browser is online; while it isn't, records wait for the page's 'online' event. */
  online(): boolean;
  /** Runs `run` after `ms` milliseconds; returns a function that cancels it. */
  later(run: () => void, ms: number): () => void;
  /** Told how many of the player's records wait, after every change (0 when none may be sent). */
  onQueue?(waiting: number): void;
};

/**
 * The queue of records waiting to be sent, and the loop that sends them one at a time. Nothing is sent or
 * kept unless the player is signed in with the switch on, checked again before every send; and nothing
 * here throws, as a play log must never get in the way of play.
 */
export function playLogs(deps: LogsDeps): {
  /** The page opened: queue the room a closed page left open, then sync. Call it once who is signed in
   * is known: a start with no one to send for forgets what's waiting. */
  start(): void;
  /** Consent may have changed: with no one to send for, forget everything; else drop other players' records and send. */
  sync(): void;
  /** A room ended (won, or left): queue its record and send it. */
  ended(v: RoomVisit, device: Device): void;
  /** The page is being hidden or closed mid-room: keep the room's record for the next page, in case. */
  keep(v: RoomVisit, device: Device): void;
  /** Sends what's waiting, one at a time; a call while sending returns the loop under way. */
  flush(): Promise<void>;
  /** The records waiting, oldest first. */
  queued(): Entry[];
} {
  // The queue as last read or written. Without storage it is the queue; with storage it stands in when
  // storage throws, and while `stale` (a write failed, so what's stored is older and isn't read until a
  // write works again).
  let memory: Entry[] = [];
  let stale = false;
  // The send loop under way, the wait before the next try after a failed send, and that try's cancel.
  let running: Promise<void> | null = null;
  let wait = FIRST_WAIT;
  let cancelTry: (() => void) | null = null;

  /** The player records may be sent for now, or null: signed out, or the switch off. */
  const sender = (): string | null => {
    try {
      const c = deps.consent();
      return c.on && c.userId ? c.userId : null;
    } catch {
      return null; // can't tell who is playing: send nothing
    }
  };

  const isOnline = (): boolean => {
    try {
      return deps.online();
    } catch {
      return true; // can't tell: try, and a failed send waits its turn
    }
  };

  const remove = (key: string): boolean => {
    try {
      deps.storage?.removeItem(key);
      return true;
    } catch {
      return false;
    }
  };

  const load = (): Entry[] => {
    if (deps.storage && !stale) {
      try {
        memory = parseQueue(deps.storage.getItem(QUEUE_KEY));
      } catch {
        // Storage blocked: the copy in memory stands in.
      }
    }
    return memory;
  };

  /** Tells the page how many of the sender's records wait (none count without a sender). */
  const report = (queue: readonly Entry[]): void => {
    const who = sender();
    try {
      deps.onQueue?.(who ? queue.filter((e) => e.userId === who).length : 0);
    } catch {
      // The display's trouble; the queue carries on.
    }
  };

  const save = (queue: Entry[]): void => {
    memory = queue;
    if (deps.storage) {
      try {
        if (queue.length > 0) deps.storage.setItem(QUEUE_KEY, JSON.stringify(queue));
        else deps.storage.removeItem(QUEUE_KEY);
        stale = false;
      } catch {
        // Full or blocked: the queue lives in memory for the page's life. An older copy left in storage
        // could hold records sent or forgotten since, so it goes too, if it can.
        stale = true;
        remove(QUEUE_KEY);
      }
    }
    report(queue);
  };

  const cancelRetry = (): void => {
    const cancel = cancelTry;
    cancelTry = null;
    try {
      cancel?.();
    } catch {
      // The timer is gone either way.
    }
  };

  /** Schedules one more try after the current wait (replacing any already scheduled), and doubles the wait. */
  const retryLater = (): void => {
    cancelRetry();
    const ms = wait;
    wait = Math.min(wait * 2, LONGEST_WAIT);
    try {
      cancelTry = deps.later(() => void flush(), ms);
    } catch {
      // No timer: the next room's end, or the page coming back online, tries again.
    }
  };

  /** Forgets every record not yet sent, here and in storage, and the room kept for the next page. */
  const forget = (): void => {
    memory = [];
    // If storage won't let go of the queue, it isn't read again on this page.
    stale = !remove(QUEUE_KEY);
    remove(OPEN_KEY);
    cancelRetry();
    wait = FIRST_WAIT;
    report(memory);
  };

  const sendOne = async (entry: Entry): Promise<SendResult> => {
    try {
      const result = await deps.send(entry);
      return result === "sent" || result === "drop" ? result : "retry";
    } catch {
      return "retry"; // a network error or the like: worth another try later
    }
  };

  /** Sends the sender's records in order until none are left, one fails, or no one may be sent for. */
  const sendAll = async (): Promise<void> => {
    try {
      // Start a moment later, once `running` holds this loop, so a flush() from inside a send joins it.
      await Promise.resolve();
      for (;;) {
        // Consent is read again before every send. Offline isn't a failure: the 'online' event flushes.
        const who = sender();
        if (!who || !isOnline()) return;
        const next = load().find((e) => e.userId === who);
        if (!next) {
          wait = FIRST_WAIT;
          cancelRetry();
          return;
        }
        if ((await sendOne(next)) === "retry") {
          retryLater();
          return;
        }
        // Sent, or never going to be: it leaves the queue as it is now (sync() may have cleared it meanwhile).
        save(load().filter((e) => e.id !== next.id));
      }
    } catch {
      // Something unforeseen: stop quietly; the next room's end or sync() starts again.
    } finally {
      running = null;
    }
  };

  const flush = (): Promise<void> => {
    running ??= sendAll();
    return running;
  };

  const record = (v: RoomVisit, who: string, device: Device): Entry | null => {
    try {
      return entryOf(v, who, device);
    } catch {
      return null; // a visit too broken to read has nothing to send
    }
  };

  const sync = (): void => {
    const who = sender();
    if (!who) {
      forget();
      return;
    }
    save(load().filter((e) => e.userId === who));
    void flush();
  };

  const start = (): void => {
    // A room kept by a page that closed mid-room ended when that page closed: it goes now, if it's this
    // player's (and is thrown away if not).
    const open = readOpen(deps.storage);
    remove(OPEN_KEY);
    const who = sender();
    if (open && who && open.userId === who) save(enqueue(load(), open));
    sync();
  };

  const ended = (v: RoomVisit, device: Device): void => {
    remove(OPEN_KEY);
    const who = sender();
    if (!who) return;
    const entry = record(v, who, device);
    if (entry) save(enqueue(load(), entry));
    void flush();
  };

  const keep = (v: RoomVisit, device: Device): void => {
    const who = sender();
    const entry = who ? record(v, who, device) : null;
    if (!entry) {
      remove(OPEN_KEY);
      return;
    }
    try {
      deps.storage?.setItem(OPEN_KEY, JSON.stringify(entry));
    } catch {
      // Full or blocked: if the page closes now, this room goes unrecorded.
    }
  };

  return {
    start: quietly(start),
    sync: quietly(sync),
    ended: quietly(ended),
    keep: quietly(keep),
    flush,
    queued: () => {
      try {
        return [...load()];
      } catch {
        return [];
      }
    },
  };
}

/** Runs a method, swallowing anything it throws: whatever goes wrong here, play carries on. */
function quietly<A extends unknown[]>(method: (...args: A) => void): (...args: A) => void {
  return (...args) => {
    try {
      method(...args);
    } catch {
      // Already handled step by step; this is for the unforeseen.
    }
  };
}

/** The kept room, or null when there's none (or it's unreadable). */
function readOpen(storage: LogsDeps["storage"]): Entry | null {
  try {
    const open = parse(storage?.getItem(OPEN_KEY) ?? null);
    return isEntry(open) ? open : null;
  } catch {
    return null;
  }
}

/** The stored queue's entries; anything else stored there is ignored. */
function parseQueue(raw: string | null): Entry[] {
  const list = parse(raw);
  return Array.isArray(list) ? list.filter(isEntry) : [];
}

function parse(raw: string | null): unknown {
  if (raw === null) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Whether stored data looks like an entry (loosely: storage is shared, and may hold anything). */
function isEntry(x: unknown): x is Entry {
  if (typeof x !== "object" || x === null) return false;
  const e = x as Record<string, unknown>;
  return (
    typeof e.id === "string" &&
    typeof e.userId === "string" &&
    typeof e.roomId === "string" &&
    typeof e.payload === "object" &&
    e.payload !== null
  );
}
