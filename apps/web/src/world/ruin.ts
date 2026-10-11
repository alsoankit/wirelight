import { uniform } from "three/tsl";

// The one dial (art-direction.md, 0021): 1 = deep ruin, 0 = fully restored. It drives materials,
// light, fog and (later) particles, wind and ambience together. In the game it is derived from the
// room's failing health checks (CORE-38); in B0 a key press moves it.
export const ruin = uniform(1);

export function startingRuin(): number {
  const value = new URLSearchParams(window.location.search).get("ruin");
  const n = value === null ? 1 : Number(value);
  return Number.isFinite(n) ? Math.min(Math.max(n, 0), 1) : 1;
}
