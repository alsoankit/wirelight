import { Vector3 } from "three";
import { distance, float, mix, positionWorld, smoothstep, uniform } from "three/tsl";

// The one dial (art-direction.md, 0021): 1 = deep ruin, 0 = fully restored. It drives materials,
// light, fog, particles and wind together. It is derived from the room's failing health checks
// (CORE-38; RuinDial).
//
// Restoration spreads (CORE-39): when the dial changes, a wave front grows from the object that was
// fixed. Everything the front has passed is at the new level; everything beyond is still at the old
// one. Falling back into ruin spreads from the same place.

export const ruinFrom = uniform(1); // the level before the wave
export const ruinTo = uniform(1); // the level the wave brings
export const waveRadius = uniform(1000); // metres from the origin; huge = settled
export const waveOrigin = uniform(new Vector3());

// The room-wide average, for things that aren't a place (fog, ambient light, how many fireflies).
export const ruin = uniform(1);

export const WAVE_WIDTH = 2.5; // metres over which the front blends old into new

// Ruin at a point in the world, for shaders.
function ruinAt(point: typeof positionWorld) {
  const reached = float(1).sub(smoothstep(waveRadius.sub(WAVE_WIDTH), waveRadius, distance(point, waveOrigin)));
  return mix(ruinFrom, ruinTo, reached);
}

// Ruin where this surface is: use in materials instead of `ruin`.
export const ruinHere = ruinAt(positionWorld);

// The same on the CPU, for lights placed in the room.
const scratch = new Vector3();
export function ruinAtPoint(x: number, y: number, z: number): number {
  const d = scratch.set(x, y, z).distanceTo(waveOrigin.value);
  const r = waveRadius.value;
  const t = Math.min(Math.max((d - (r - WAVE_WIDTH)) / WAVE_WIDTH, 0), 1);
  const reached = 1 - t * t * (3 - 2 * t);
  return ruinFrom.value + (ruinTo.value - ruinFrom.value) * reached;
}

// Dev aid: ?ruin=0|1 pins the dial for screenshots; null when not pinned.
export function pinnedRuin(): number | null {
  const value = new URLSearchParams(window.location.search).get("ruin");
  if (value === null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(Math.max(n, 0), 1) : null;
}
