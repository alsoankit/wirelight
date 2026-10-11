/** Runs a room headless: load it, type commands, let network time pass. Used by CI and tests. */
import { SimBackend } from "@wirelight/shell";
import { shellContent } from "./content/shell";
import { facts } from "./predicates";
import { toolsIn } from "./tools";
import type { Facts, RoomDef, SolutionStep } from "./types";

export function loadRoom(room: RoomDef, all: readonly RoomDef[]): SimBackend {
  const b = new SimBackend(shellContent);
  const tools = toolsIn(room, all);
  b.options = () => ({ tools, subtitles: room.subtitles ?? room.floor <= 2 });
  b.loadSync(room.topology, room.faults, room.seed);
  return b;
}

/** Each step runs, then the network gets `settleMs` of network time before the next one. */
export function play(b: SimBackend, steps: readonly SolutionStep[], settleMs = 5000): Facts {
  b.advance(b.now() + settleMs);
  for (const s of steps) {
    b.exec(s.device, s.line, "script");
    b.advance(b.now() + settleMs);
  }
  return facts(b.trace(), b.state());
}
