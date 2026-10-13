import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { useReducedMotion } from "../progress/motion";
import { pinnedRuin, ruin, ruinFrom, ruinTo, WAVE_WIDTH, waveOrigin, waveRadius } from "./ruin";

// Drives the one dial from the room's condition (CORE-38): `level` is the share of health checks
// failing (1 = deep ruin, 0 = restored). When it changes, the change spreads as a wave from `origin`,
// the object whose check changed, across the room in about 3 seconds (CORE-39; art-direction.md:
// "over about 2–3 seconds"). The first level a room shows is set at once, without a wave.
// Dev aid: ?ruin=0|1 pins the dial (screenshots), whatever the room's state.
// With reduced motion (UI-23) the change is a fade over the whole room instead of a spreading wave.

const SPEED = 5.5; // metres per second
const REACH = 16; // far enough to cover the room from any fix
const FADE_S = 1.5; // the reduced-motion fade, seconds

type Props = { level: number | null; origin: [number, number, number] };

export function RuinDial({ level, origin }: Props) {
  const spreading = useRef(false);
  const shown = useRef<number | null>(null);
  const reduced = useReducedMotion();
  // The reduced-motion fade: from, to, and how far along (0..1); null when not fading.
  const fade = useRef<{ from: number; to: number; t: number } | null>(null);

  useEffect(() => {
    const target = pinnedRuin() ?? level;
    if (target === null || target === shown.current) return;
    if (shown.current === null) {
      // The room's first state: no wave.
      ruinFrom.value = target;
      ruinTo.value = target;
      ruin.value = target;
      waveRadius.value = 1000;
    } else if (reduced) {
      // A fade: everywhere at once, from wherever the room is now.
      const from = ruin.value;
      spreading.current = false;
      waveRadius.value = 1000;
      fade.current = { from, to: target, t: 0 };
    } else {
      fade.current = null;
      // Start a new wave from wherever the room is now (a wave in progress settles first).
      ruinFrom.value = ruinTo.value;
      ruinTo.value = target;
      waveOrigin.value.set(...origin);
      waveRadius.value = 0;
      spreading.current = true;
    }
    shown.current = target;
  }, [level, origin, reduced]);

  useFrame((_, delta) => {
    const f = fade.current;
    if (f) {
      f.t = Math.min(f.t + delta / FADE_S, 1);
      const v = f.from + (f.to - f.from) * f.t;
      ruinFrom.value = v;
      ruinTo.value = v;
      ruin.value = v;
      if (f.t >= 1) fade.current = null;
      return;
    }
    if (!spreading.current) return;
    waveRadius.value += SPEED * delta;
    const progress = Math.min(waveRadius.value / REACH, 1);
    ruin.value = ruinFrom.value + (ruinTo.value - ruinFrom.value) * progress;
    if (waveRadius.value > REACH + WAVE_WIDTH) {
      ruinFrom.value = ruinTo.value;
      waveRadius.value = 1000;
      ruin.value = ruinTo.value;
      spreading.current = false;
    }
  });

  return null;
}
