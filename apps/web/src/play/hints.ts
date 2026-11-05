import type { RoomDef } from "@wirelight/rooms";
import type { SimEvent } from "@wirelight/sim";
import { useEffect, useState } from "react";
import { useProgress } from "../progress/progress";

// The hint ladder's timing (HELP-09): hints unlock over time or attempts, never at once. An attempt
// is a command that changes something, or a send that doesn't win. Defaults: the first after 90 s or
// 2 attempts; each next after 2 more minutes or 2 more attempts; the reveal no earlier than 8 minutes
// (12 in bosses). On the New path: the first after 60 s, then every 90 s. A room may override.

/** Commands that never change anything: they show, listen or tidy the terminal. */
const LOOKING = new Set(["tcpdump", "man", "help", "history", "clear", "exit", "hostname"]);

/** A word as ip and bridge read it (iproute2): any start of a name stands for the name. */
const startOf = (word: string, ...names: string[]) => word.length > 0 && names.some((n) => n.startsWith(word));

/**
 * Whether a command line only looks (it's never an attempt), read as the shell reads it: `sudo` and
 * `| grep` change nothing; ip and bridge take any start of a word (`ip a`, `bridge link`) and try
 * set before show (`ip link s` sets); a tool or its object alone shows its table or its usage;
 * sysctl writes with -w or key=value.
 */
export function readOnly(line: string): boolean {
  let words = (line.split("|")[0] ?? "").trim().split(/\s+/);
  if (words[0] === "sudo") words = words.slice(1);
  const [tool = "", what, verb = ""] = words;
  if (LOOKING.has(tool)) return true;
  if (tool === "sysctl")
    return !words.some((w) => w === "-w" || w === "--write" || (!w.startsWith("-") && w.includes("=")));
  if (tool === "ip" || tool === "bridge") {
    if (what === undefined || words.length === 2 || startOf(what, "help")) return true;
    if (startOf(what, "link") && startOf(verb, "set", "change")) return false;
    return startOf(verb, "show", "list", "help") || verb === "lst" || (startOf(what, "route") && verb === "get");
  }
  if (tool === "lab") {
    if (what === undefined || words.length === 2) return true;
    if (verb === "show" || verb === "list") return what === "card" || what === "scanner" || what === "keeper";
    return what === "scanner" && (verb === "open" || verb === "compare");
  }
  return false;
}

/** Commands that changed something or sent something (HELP-09's attempts). */
export function attempts(events: readonly SimEvent[]): number {
  return events.filter(
    (e) => e.kind === "cmd.exec" && (e.source === "typed" || e.source === "click") && !readOnly(e.line),
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
