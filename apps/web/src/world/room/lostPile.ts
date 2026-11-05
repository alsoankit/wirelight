// Where messages died at a door (CORE-17): which of the store's marks the door's pile of scraps holds.
// Pure, so it can be tested; Doorway.tsx draws the scraps.

/** A scrap on the floor: the lost message, and when it fell (screen ms). */
export type Scrap = { frameId: number; at: number };

type Mark = { door: string; at: number; frameId: number };

/**
 * The pile once the store's marks have changed, or null when nothing new fell at `door`. New marks
 * join the pile; past `max` scraps, or `stayMs` after it fell, a scrap leaves it. `taken` holds the
 * marks this door has already taken, kept or not: the store's list is new on every tick, and a mark
 * that didn't fit the pile mustn't come back as new each time (the pile would swap between two sets).
 */
export function addToPile(
  pile: readonly Scrap[],
  taken: ReadonlySet<number>,
  marks: readonly Mark[],
  door: string,
  now: number,
  max: number,
  stayMs: number,
): { pile: Scrap[]; taken: Set<number> } | null {
  const here = marks.filter((m) => m.door === door);
  const fresh = here.filter((m) => !taken.has(m.frameId));
  if (fresh.length === 0) return null;
  return {
    pile: [...pile, ...fresh.map((m) => ({ frameId: m.frameId, at: m.at }))]
      .filter((m) => now - m.at < stayMs)
      .slice(-max),
    // Only what the store still holds: a mark it has forgotten never comes back.
    taken: new Set(here.map((m) => m.frameId)),
  };
}
