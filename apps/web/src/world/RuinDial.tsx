import { useFrame } from "@react-three/fiber";
import { useEffect, useRef } from "react";
import { ruin, startingRuin } from "./ruin";

// B0 only: press R to restore the room, and again to let it fall back into ruin.
// Restoration takes about 2.5 s (art-direction.md: "over about 2–3 seconds").
// In the game the dial follows the room's health checks instead (CORE-38, CORE-39).

const SECONDS = 2.5;

export function RuinDial() {
  const target = useRef(startingRuin());

  useEffect(() => {
    ruin.value = target.current;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "r" || e.key === "R") target.current = target.current > 0.5 ? 0 : 1;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useFrame((_, delta) => {
    const step = delta / SECONDS;
    const now = ruin.value;
    const goal = target.current;
    ruin.value = goal > now ? Math.min(goal, now + step) : Math.max(goal, now - step);
  });

  return null;
}
