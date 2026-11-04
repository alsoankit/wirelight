// The judge behind automatic quality (0020, tech/rendering.md; AutoQuality.tsx), apart from React and
// the renderer so it can be tested frame by frame. With hysteresis: it steps down only when frames
// stay slow, and steps back up when they stay fast again. Short hitches never count: the frames around
// walking into a room, a restoration wave or a room load are skipped, and each window is judged by its
// median frame time (one long frame can't sink it). A tier that proved too slow right after a step up
// waits longer before it is tried again.

const WINDOW_S = 2; // seconds of frames judged together
const SETTLE_S = 3; // skip this long after a room change or while the ruin is moving
const SLOW_FPS = 40; // a window under this is slow
const FAST_FPS = 54; // a window over this is fast
const DOWN_AFTER = 2; // slow windows in a row before stepping down
const UP_AFTER = 4; // fast windows in a row before stepping up (doubles after a failed try)
const HITCH_S = 0.5; // a frame longer than this is a hitch (the tab coming back, a load)…
const QUICK_S = 2; // …after this long of quicker frames; long frames that keep coming are just slow

export type Step = "down" | "up" | null;

/**
 * The judge, frame by frame: whether to step down, step up, or stay. `where` changes with a walk or a
 * load; `ruinMoving` while a restoration wave runs. Each call to `qualityJudge` starts a fresh one.
 */
export function qualityJudge(): (delta: number, where: string, ruinMoving: boolean) => Step {
  let frames: number[] = [];
  let elapsed = 0;
  let settle = SETTLE_S;
  let slow = 0;
  let fast = 0;
  let upAfter = UP_AFTER;
  let lastUp = -1000;
  let clock = 0;
  let place = "";
  let quick = Number.POSITIVE_INFINITY; // seconds of frames under HITCH_S since the last longer one

  return (delta, where, ruinMoving) => {
    clock += delta;
    // Software drawing can take longer than HITCH_S for every frame: those are slow frames, not hitches.
    const hitch = delta > HITCH_S && quick > QUICK_S;
    quick = delta > HITCH_S ? 0 : quick + delta;
    if (where !== place || ruinMoving || hitch) {
      // A walk, a load or a wave: the hitch it brings says nothing about steady frames.
      place = where;
      settle = SETTLE_S;
      frames = [];
      elapsed = 0;
      return null;
    }
    if (settle > 0) {
      settle -= delta;
      return null;
    }
    frames.push(delta);
    elapsed += delta;
    if (elapsed < WINDOW_S) return null;
    const sorted = [...frames].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 1 / 60;
    const fps = 1 / median;
    frames = [];
    elapsed = 0;
    slow = fps < SLOW_FPS ? slow + 1 : 0;
    fast = fps > FAST_FPS ? fast + 1 : 0;
    if (slow >= DOWN_AFTER) {
      slow = 0;
      fast = 0;
      // Too slow soon after stepping up: wait longer before trying again.
      if (clock - lastUp < 20) upAfter = Math.min(upAfter * 2, 60);
      return "down";
    }
    if (fast >= upAfter) {
      fast = 0;
      lastUp = clock;
      return "up";
    }
    return null;
  };
}
