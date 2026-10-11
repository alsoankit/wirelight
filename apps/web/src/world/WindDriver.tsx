import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { BREEZE, gust, windTravel } from "./wind";

// Gusts on a seeded schedule (no Math.random: the same room always breathes the same way):
// the first after 8 s, then one every 18–40 s. Each rises over 1.5 s, holds, and dies away over 2.5 s.

const RISE = 1.5;
const HOLD = 1.5;
const FALL = 2.5;

// mulberry32: a tiny seeded PRNG.
function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function envelope(age: number): number {
  if (age < 0) return 0;
  if (age < RISE) return smooth(age / RISE);
  if (age < RISE + HOLD) return 1;
  if (age < RISE + HOLD + FALL) return 1 - smooth((age - RISE - HOLD) / FALL);
  return 0;
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

export function WindDriver({ seed = 1 }: { seed?: number }) {
  const random = useMemo(() => seeded(seed), [seed]);
  const next = useRef(8);
  const strength = useRef(0.8);

  useFrame(({ clock }, delta) => {
    const t = clock.elapsedTime;
    const age = t - next.current;
    if (age > RISE + HOLD + FALL) {
      next.current = t + 18 + random() * 22;
      strength.current = 0.6 + random() * 0.4;
    }
    gust.value = envelope(t - next.current) * strength.current;
    windTravel.value += (BREEZE + gust.value * 1.4) * delta;
  });

  return null;
}
