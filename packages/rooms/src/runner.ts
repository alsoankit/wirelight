/** Runs a room headless: load it, type commands, let network time pass. Used by CI and tests. */
import { shellContent } from "@wirelight/content";
import { SimBackend } from "@wirelight/shell";
import { facts } from "./predicates";
import { toolsIn } from "./tools";
import type { Facts, RoomDef, SolutionStep } from "./types";

export function loadRoom(room: RoomDef, all: readonly RoomDef[]): SimBackend {
  const b = new SimBackend(shellContent);
  const tools = toolsIn(room, all);
  b.options = () => ({ tools, subtitles: room.subtitles ?? room.floor <= 7 });
  b.loadSync(room.topology, room.faults, room.seed);
  return b;
}

/**
 * The room's rules (e.g. hand mode's "the keeper remembers"): each one whose condition holds now
 * takes effect. Idempotent: waking a keeper that's awake does nothing. The engine calls this after
 * every change, and so does `play`, so CI sees what the player would.
 */
export function applyRules(room: RoomDef, b: SimBackend): void {
  if (!room.rules?.length) return;
  const f = facts(b.trace(), b.state());
  for (const r of room.rules) if (r.when(f) && r.then.kind === "wake-keeper") b.world.wakeKeeper(r.then.device);
}

/** Each step runs, then the network gets its `waitMs` (default `settleMs`) of network time. */
export function play(room: RoomDef, b: SimBackend, steps: readonly SolutionStep[], settleMs = 5000): Facts {
  advance(room, b, settleMs);
  for (const s of steps) {
    if ("touch" in s) b.touch(s.device, s.touch);
    else b.exec(s.device, s.line, s.source ?? "script");
    applyRules(room, b);
    advance(room, b, s.waitMs ?? settleMs);
  }
  return facts(b.trace(), b.state());
}

/**
 * Lets `ms` of network time pass in steps of at most 100 ms, applying the room's rules as it goes.
 * Small steps also keep a busy network (a storm) within each advance's event budget (SIM-31), so
 * time really reaches the end, as it does in the engine, which steps once per screen frame.
 */
function advance(room: RoomDef, b: SimBackend, ms: number): void {
  const end = b.now() + ms;
  for (let guard = 0; b.now() < end && guard < 1_000_000; guard++) {
    b.advance(Math.min(end, b.now() + 100));
    applyRules(room, b);
  }
}
