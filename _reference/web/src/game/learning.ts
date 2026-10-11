/**
 * Discovery cards and the hint ladder (SRS §10.4, §11.1). Both read the trace and the player's
 * actions; neither changes the network.
 */
import { type CardId, cards, type RoomDef, rooms } from "@wirelight/rooms";
import type { SimEvent } from "@wirelight/sim";

/** Cards that appear when something happens, rather than on entering their room. */
export const CARD_TRIGGER: Partial<Record<CardId, Trigger>> = {
  "capture-jar": "catch",
  "opening-a-frame": "open",
  console: "console",
  keyring: "key",
  "scrying-glass": "glass",
  message: "send",
  frame: "workbench",
  "mac-address": "workbench",
  workbench: "workbench",
  "ip-link": "ip-link",
};
export type Trigger = "enter" | "catch" | "open" | "console" | "key" | "glass" | "send" | "workbench" | "ip-link";

/** A card may be introduced in its own room or any later one, never earlier (P-9). */
export function cardAllowed(id: CardId, room: RoomDef): boolean {
  const upTo = rooms.slice(0, rooms.findIndex((r) => r.id === room.id) + 1);
  return upTo.some((r) => r.cards.includes(id)) && id in cards;
}

export function cardsFor(trigger: Trigger, room: RoomDef): CardId[] {
  const all = new Set<CardId>(rooms.flatMap((r) => r.cards));
  return [...all].filter(
    (c) =>
      (CARD_TRIGGER[c] ?? "enter") === trigger && (trigger !== "enter" ? cardAllowed(c, room) : room.cards.includes(c)),
  );
}

// ── Hints ────────────────────────────────────────────────────────────────────────────────

export interface HintClock {
  startedAt: number;
  /** Hints unlocked so far (0–5). */
  unlocked: number;
  unlockedAt: number;
  attempts: number;
  attemptsAtUnlock: number;
  lastActivity: number;
  /** How far through the trace attempts have been counted. */
  seen: number;
}

export function newHintClock(now: number, alreadyUnlocked: number): HintClock {
  return {
    startedAt: now,
    unlocked: alreadyUnlocked,
    unlockedAt: now,
    attempts: 0,
    attemptsAtUnlock: 0,
    lastActivity: now,
    seen: 0,
  };
}

/** A configuration change or a send counts as an attempt (FR-HINT-07). */
const ATTEMPT = /^(sudo\s+)?(lab send-frame|lab card set|ip link set)\b/;

export function countAttempts(c: HintClock, trace: readonly SimEvent[], now: number, won: boolean): void {
  for (let i = c.seen; i < trace.length; i++) {
    const e = trace[i];
    if (e?.kind !== "cmd.exec" || (e.source !== "typed" && e.source !== "click")) continue;
    c.lastActivity = now;
    if (!won && ATTEMPT.test(e.line)) c.attempts++;
  }
  c.seen = trace.length;
}

/** Unlock the next hint when its time or attempts have come (defaults per FR-HINT-07, room-overridable). */
export function advanceHints(c: HintClock, room: RoomDef, now: number): boolean {
  if (c.unlocked >= 5) return false;
  const t = room.hintTiming ?? {};
  const firstAfter = t.firstAfterMs ?? 90_000;
  const nextAfter = t.nextAfterMs ?? 120_000;
  const revealAfter = t.revealAfterMs ?? (room.kind === "boss" ? 12 * 60_000 : 8 * 60_000);
  const ready =
    c.unlocked === 0
      ? now - c.startedAt >= firstAfter || c.attempts >= 2
      : now - c.unlockedAt >= nextAfter || c.attempts - c.attemptsAtUnlock >= 2;
  if (!ready) return false;
  if (c.unlocked === 4 && now - c.startedAt < revealAfter) return false;
  c.unlocked++;
  c.unlockedAt = now;
  c.attemptsAtUnlock = c.attempts;
  return true;
}
