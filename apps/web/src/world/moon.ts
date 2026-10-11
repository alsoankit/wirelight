import { Vector3 } from "three";

// Where the moon is (Region 1 rooms): high behind the back-left walls, shining in through the broken
// tops, the barred window and the collapsed corner. Its light is baked into the static room once at
// load (bake.ts, bakeMoonlight); nothing renders shadows at runtime (0052 follow-up, owner 2026-10-12).

export const MOON_POSITION: [number, number, number] = [-9, 13, -8];
export const MOON_TARGET: [number, number, number] = [1.5, 0, 1.5];

// Unit vector from the room toward the moon.
export const TO_MOON = new Vector3(...MOON_POSITION).sub(new Vector3(...MOON_TARGET)).normalize();

// Moonlight colour and strength on the ruin dial: cold and strong in ruin, softer when restored.
export const MOON_RUINED = "#8FA8E0";
export const MOON_RESTORED = "#B8BCCB";
export const MOON_STRENGTH_RUINED = 1.25;
export const MOON_STRENGTH_RESTORED = 0.45;
