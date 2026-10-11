import { Vector3 } from "three";
import { uniform } from "three/tsl";

// Wind (0021): occasional gusts through the halls, stirring leaves, dust and candle flames, on top of
// a faint constant breeze. Gentle and rare enough to stay special; background, never a focus.
// Driven by WindDriver; read by vegetation (sway), dust (drift) and flame lights (a small dip).

export const gust = uniform(0); // 0 still … 1 the height of a gust
export const windDirection = uniform(new Vector3(0.8, 0, 0.6).normalize());
export const windTravel = uniform(0); // metres the air has moved, for drifting dust

export const BREEZE = 0.08; // always a little movement
