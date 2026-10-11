/**
 * The presentation clock (ARCH-09, SIM-33). It drives the backend with adaptive time dilation:
 * while a frame is in a cable, network time crawls so one crossing takes ~900 ms on screen;
 * while nothing is moving, network time runs 1:1 with real time (× speed).
 */
import { afterEvents, current, tickHints, useGame } from "./store";

const CROSSING_MS = 900;
const AIM_SLOWDOWN = 0.2;

type Drawer = (now: number) => void;
const drawers = new Set<Drawer>();

export function onFrame(fn: Drawer): () => void {
  drawers.add(fn);
  return () => drawers.delete(fn);
}

/** Network ms per real ms while frames are in flight: one cable crossing ≈ CROSSING_MS. */
function slowRate(): number {
  const l = current().backend.state().links()[0];
  const crossing = l ? l.delayMs + ((60 * 8) / l.bandwidthBps) * 1000 : 0.05;
  return crossing / CROSSING_MS;
}

let started = false;

export function startClock(): void {
  if (started) return;
  started = true;
  let last = performance.now();
  const loop = (now: number) => {
    const realDt = Math.min(100, now - last);
    last = now;
    const { paused, speed, aiming } = useGame.getState();
    // While the pointer is on a message you could catch, everything slows to a crawl.
    if (!paused) step(realDt * speed * (aiming ? AIM_SLOWDOWN : 1));
    current().tracker.prune(now);
    afterEvents();
    tickHints(now);
    for (const d of drawers) d(now);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

function step(realMs: number): void {
  const b = current().backend;
  let budget = realMs;
  // A few iterations at most: rate changes only when something enters or leaves a cable.
  for (let guard = 0; budget > 1e-6 && guard < 64; guard++) {
    const rate = b.inFlight() > 0 ? slowRate() : 1;
    const now = b.now();
    const target = now + budget * rate;
    const next = b.nextEventTime();
    if (next !== null && next <= target) {
      budget -= (next - now) / rate;
      b.advance(next);
    } else {
      b.advance(target);
      budget = 0;
    }
  }
}
