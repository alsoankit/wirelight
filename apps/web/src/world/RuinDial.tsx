import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { ruin, ruinFrom, ruinTo, startingRuin, WAVE_WIDTH, waveOrigin, waveRadius } from "./ruin";

// B0 only: press R to restore the room, and again to let it fall back into ruin. Either way the
// change spreads as a wave from `origin` (the object that was fixed) across the room in about
// 3 seconds (art-direction.md: "over about 2–3 seconds"). In the game the dial follows the room's
// health checks, and the origin is the object whose check changed (CORE-38, CORE-39).

const SPEED = 5.5; // metres per second
const REACH = 16; // far enough to cover the room from any fix

type Props = { origin: [number, number, number] };

export function RuinDial({ origin }: Props) {
  const spreading = useRef(false);

  useEffect(() => {
    const start = startingRuin();
    ruinFrom.value = start;
    ruinTo.value = start;
    ruin.value = start;
    waveRadius.value = 1000;
    waveOrigin.value.set(...origin);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "r" && e.key !== "R") return;
      // Start a new wave from wherever the room is now (a wave in progress settles first).
      ruinFrom.value = ruinTo.value;
      ruinTo.value = ruinTo.value > 0.5 ? 0 : 1;
      waveRadius.value = 0;
      spreading.current = true;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [origin]);

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
