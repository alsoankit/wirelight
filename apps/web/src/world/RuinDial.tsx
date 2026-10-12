import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { pinnedRuin, ruin, ruinFrom, ruinTo, WAVE_WIDTH, waveOrigin, waveRadius } from "./ruin";

// Drives the one dial from the room's condition (CORE-38): `level` is the share of health checks
// failing (1 = deep ruin, 0 = restored). When it changes, the change spreads as a wave from `origin`,
// the object whose check changed, across the room in about 3 seconds (CORE-39; art-direction.md:
// "over about 2–3 seconds"). The first level a room shows is set at once, without a wave.
// Dev aid: ?ruin=0|1 pins the dial (screenshots), whatever the room's state.

const SPEED = 5.5; // metres per second
const REACH = 16; // far enough to cover the room from any fix

type Props = { level: number | null; origin: [number, number, number] };

export function RuinDial({ level, origin }: Props) {
  const spreading = useRef(false);
  const shown = useRef<number | null>(null);

  useEffect(() => {
    const target = pinnedRuin() ?? level;
    if (target === null || target === shown.current) return;
    if (shown.current === null) {
      // The room's first state: no wave.
      ruinFrom.value = target;
      ruinTo.value = target;
      ruin.value = target;
      waveRadius.value = 1000;
    } else {
      // Start a new wave from wherever the room is now (a wave in progress settles first).
      ruinFrom.value = ruinTo.value;
      ruinTo.value = target;
      waveOrigin.value.set(...origin);
      waveRadius.value = 0;
      spreading.current = true;
    }
    shown.current = target;
  }, [level, origin]);

  useFrame((_, delta) => {
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
