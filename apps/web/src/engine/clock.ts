// The presentation clock (tech/architecture.md, CORE-41, CORE-42): how far network time moves per
// screen frame. The main thread owns it; the worker only ever runs to the time it's asked for.
// - While messages are on a cable, time slows so each crossing takes about SCREEN_MS_PER_CROSSING
//   of screen time, whatever its real length (fractions of a millisecond), so it can be followed.
// - With nothing on a cable, network time runs at real speed (timers and room-started repeat sends).
// - Pause stops it; speed scales it (0.25× to 64×).
// - A crowd (a storm) can't be followed message by message, so with more than CROWD on cables time
//   runs at least CROWD_RATE of real speed: timers still move and the storm still reads as a storm.

export const SCREEN_MS_PER_CROSSING = 900;
export const SPEEDS = [0.25, 0.5, 1, 2, 4, 16, 64] as const;
export const CROWD = 12;
export const CROWD_RATE = 0.25;
/**
 * A loop (9.4): one packet crossing again and again. After LOOP_HOPS crossings of the same packet,
 * each further crossing is followed a little faster, up to LOOP_MAX times, so 64 bounces take seconds,
 * not minutes; the first few are still followed at the normal pace.
 */
export const LOOP_HOPS = 8;
export const LOOP_MAX = 12;

/** How much faster to follow a packet that has already made `hops` crossings (1 for a normal one). */
export function loopBoost(hops: number): number {
  return hops <= LOOP_HOPS ? 1 : Math.min(LOOP_MAX, 1 + (hops - LOOP_HOPS) / 2);
}

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
  /** Its real bytes: for its shape and size (CORE-15) and what hovering it says (CORE-16). */
  bytes: Uint8Array;
  /** How many crossings its packet has made so far, this one included (a loop, 9.4); 1 if not a packet. */
  hops?: number;
};

/** Where network time should be after `screenMs` of screen time. */
export function nextNetworkTime(now: number, onCables: readonly Crossing[], screenMs: number, speed: number): number {
  if (onCables.length === 0) return now + screenMs * speed;
  // The shortest crossing sets the pace, so no message flashes past.
  const shortest = Math.min(...onCables.map((c) => Math.max(c.arriveAt - c.enter, 1e-6)));
  // Every message on the cables is a packet going round (a loop): follow it faster.
  const boost = loopBoost(Math.min(...onCables.map((c) => c.hops ?? 1)));
  const paced = (screenMs * speed * shortest * boost) / SCREEN_MS_PER_CROSSING;
  return now + (onCables.length > CROWD ? Math.max(paced, screenMs * speed * CROWD_RATE) : paced);
}

/** How far along its cable a message is, 0 → 1. */
export function progress(c: Crossing, now: number): number {
  return Math.min(Math.max((now - c.enter) / Math.max(c.arriveAt - c.enter, 1e-6), 0), 1);
}
