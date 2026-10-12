// The presentation clock (tech/architecture.md, CORE-41, CORE-42): how far network time moves per
// screen frame. The main thread owns it; the worker only ever runs to the time it's asked for.
// - While messages are on a cable, time slows so each crossing takes about SCREEN_MS_PER_CROSSING
//   of screen time, whatever its real length (fractions of a millisecond), so it can be followed.
// - With nothing on a cable, network time runs at real speed (timers, the messenger's next call).
// - Pause stops it; speed scales it (0.25× to 64×).

export const SCREEN_MS_PER_CROSSING = 900;
export const SPEEDS = [0.25, 0.5, 1, 2, 4, 16, 64] as const;

/** A message on a cable, from its `link.enter` event. */
export type Crossing = {
  frameId: number;
  link: string;
  dir: 0 | 1;
  from: string; // device id at the sending end
  to: string; // device id at the receiving end
  enter: number; // network ms
  arriveAt: number; // network ms
  summary: string;
};

/** Where network time should be after `screenMs` of screen time. */
export function nextNetworkTime(now: number, onCables: readonly Crossing[], screenMs: number, speed: number): number {
  if (onCables.length === 0) return now + screenMs * speed;
  // The shortest crossing sets the pace, so no message flashes past.
  const shortest = Math.min(...onCables.map((c) => Math.max(c.arriveAt - c.enter, 1e-6)));
  return now + (screenMs * speed * shortest) / SCREEN_MS_PER_CROSSING;
}

/** How far along its cable a message is, 0 → 1. */
export function progress(c: Crossing, now: number): number {
  return Math.min(Math.max((now - c.enter) / Math.max(c.arriveAt - c.enter, 1e-6), 0), 1);
}
