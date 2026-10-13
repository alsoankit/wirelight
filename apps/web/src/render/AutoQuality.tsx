import { useFrame } from "@react-three/fiber";
import { type Dispatch, type SetStateAction, useRef } from "react";
import { useSession } from "../engine/store";
import { ruin } from "../world/ruin";
import { TIERS, type Tier } from "./quality";

// Automatic quality (0020, tech/rendering.md) with hysteresis: it steps down only when frames stay
// slow, and steps back up when they stay fast again. Short hitches never count: the frames around
// walking into a room, a restoration wave or a room load are skipped, and each window is judged by
// its median frame time (one long frame can't sink it). A tier that proved too slow right after a
// step up waits longer before it is tried again. ?tier= and a choice in Settings pin the tier (the
// caller passes auto = false).

const WINDOW_S = 2; // seconds of frames judged together
const SETTLE_S = 3; // skip this long after a room change or while the ruin is moving
const SLOW_FPS = 40; // a window under this is slow
const FAST_FPS = 54; // a window over this is fast
const DOWN_AFTER = 2; // slow windows in a row before stepping down
const UP_AFTER = 4; // fast windows in a row before stepping up (doubles after a failed try)

export function AutoQuality({
  auto,
  setTier,
  ceiling,
}: {
  auto: boolean;
  setTier: Dispatch<SetStateAction<Tier>>;
  /** The best tier the renderer starts on; auto never goes above it. */
  ceiling: Tier;
}) {
  const frames = useRef<number[]>([]);
  const elapsed = useRef(0);
  const settle = useRef(SETTLE_S);
  const slow = useRef(0);
  const fast = useRef(0);
  const upAfter = useRef(UP_AFTER);
  const lastUp = useRef(-1000);
  const clock = useRef(0);
  const place = useRef("");
  const lastRuin = useRef(ruin.value);

  useFrame((_, delta) => {
    if (!auto) return;
    clock.current += delta;
    const s = useSession.getState();
    const where = `${s.roomId}:${s.here}`;
    const ruinMoving = Math.abs(ruin.value - lastRuin.current) > 1e-4;
    lastRuin.current = ruin.value;
    if (where !== place.current || ruinMoving || delta > 0.5) {
      // A walk, a load or a wave: the hitch it brings says nothing about steady frames.
      place.current = where;
      settle.current = SETTLE_S;
      frames.current = [];
      elapsed.current = 0;
      return;
    }
    if (settle.current > 0) {
      settle.current -= delta;
      return;
    }
    frames.current.push(delta);
    elapsed.current += delta;
    if (elapsed.current < WINDOW_S) return;
    const sorted = [...frames.current].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)] ?? 1 / 60;
    const fps = 1 / median;
    frames.current = [];
    elapsed.current = 0;
    slow.current = fps < SLOW_FPS ? slow.current + 1 : 0;
    fast.current = fps > FAST_FPS ? fast.current + 1 : 0;
    if (slow.current >= DOWN_AFTER) {
      slow.current = 0;
      fast.current = 0;
      // Too slow soon after stepping up: wait longer before trying again.
      if (clock.current - lastUp.current < 20) upAfter.current = Math.min(upAfter.current * 2, 60);
      setTier((t) => TIERS[Math.min(TIERS.indexOf(t) + 1, TIERS.length - 1)] as Tier);
    } else if (fast.current >= upAfter.current) {
      fast.current = 0;
      lastUp.current = clock.current;
      setTier((t) => TIERS[Math.max(TIERS.indexOf(t) - 1, TIERS.indexOf(ceiling))] as Tier);
    }
  });
  return null;
}
