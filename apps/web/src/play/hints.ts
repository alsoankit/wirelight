import type { RoomDef } from "@wirelight/rooms";
import type { SimEvent } from "@wirelight/sim";
import { useEffect, useState } from "react";
import { useProgress } from "../progress/progress";

// The hint ladder's timing (HELP-09): hints unlock over time or attempts, never at once. An attempt
// is a command that changes something, or a send that doesn't win. Defaults: the first after 90 s or
// 2 attempts; each next after 2 more minutes or 2 more attempts; the reveal no earlier than 8 minutes
// (12 in bosses). On the New path: the first after 60 s, then every 90 s. A room may override.

const READ_ONLY =
  /^(ip (link|addr|address|route|neigh)( show\b.*)?$|bridge fdb( show)?$|lab (card|scanner|keeper)( show| list)?$|lab scanner (open|list)\b|tcpdump\b|man\b|help\b|history\b|clear$|hostname$|sysctl [^-])/;

/** Commands that changed something or sent something (HELP-09's attempts). */
export function attempts(events: readonly SimEvent[]): number {
  return events.filter(
    (e) => e.kind === "cmd.exec" && (e.source === "typed" || e.source === "click") && !READ_ONLY.test(e.line),
  ).length;
}

export function hintsReady(room: RoomDef, elapsedMs: number, tries: number, newPath: boolean): number {
  const first = room.hintTiming?.firstAfterMs ?? (newPath ? 60_000 : 90_000);
  const next = room.hintTiming?.nextAfterMs ?? (newPath ? 90_000 : 120_000);
  const reveal = room.hintTiming?.revealAfterMs ?? (room.kind === "boss" ? 12 * 60_000 : 8 * 60_000);
  const byTime = elapsedMs < first ? 0 : 1 + Math.floor((elapsedMs - first) / next);
  const byTries = tries < 2 ? 0 : Math.floor(tries / 2);
  const ready = Math.min(5, Math.max(byTime, byTries));
  // The reveal (hint 5) waits for its own time, whatever else has happened.
  return ready === 5 && elapsedMs < reveal ? 4 : ready;
}

/** Screen time since the room started, ticking once a second. */
export function useElapsed(startedAt: number): number {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    const id = setInterval(() => setNow(performance.now()), 1000);
    return () => clearInterval(id);
  }, []);
  return Math.max(0, now - startedAt);
}

export function useNewPath(): boolean {
  return useProgress((s) => (s.path ?? "new") === "new");
}
