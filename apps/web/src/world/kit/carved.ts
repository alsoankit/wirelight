import type { MeshStandardMaterial, Texture } from "three";
import {
  color,
  dot,
  float,
  mix,
  mx_noise_float,
  normalMap,
  normalWorld,
  positionLocal,
  positionWorld,
  smoothstep,
  texture,
  vec3,
} from "three/tsl";
import { MeshStandardNodeMaterial } from "three/webgpu";
import { ruinHere } from "../ruin";
import { BREEZE, gust, windDirection } from "../wind";

// One look for every reworked model (decision 0089, "carved and painted"): its colour is the region's
// (a tint, greyed in ruin), its own colour only a faint detail in it; the carving comes from the baked
// normal map, its depth from the baked ambient occlusion. Models from tools/rework/ship.mjs carry the
// three maps on one material.

export type Tint = { restored: string; ruined: string };

export type CarvedOptions = {
  tint: Tint;
  /** How much of the model's own colour shows through (0–1). */
  detail?: number;
  metalness?: number;
  roughness?: number;
  /** Moss on what faces up (a garden statue's shoulders and lap), 0–1. */
  moss?: number;
  /** Cloth that stirs in the wind: metres its hem moves in a gust (the keeper's robe). */
  sway?: number;
  /** Where the hem ends, in the model's own height (metres): below it the cloth moves. */
  hem?: number;
};

const MOSS = color("#5E6E3E");

export function carvedMaterial(source: MeshStandardMaterial, options: CarvedOptions): MeshStandardNodeMaterial {
  const { tint, detail = 0.35, metalness = 0, roughness = 0.85, moss = 0, sway = 0, hem = 0.9 } = options;
  const m = new MeshStandardNodeMaterial({ metalness, roughness });
  const base = mix(color(tint.restored), color(tint.ruined), ruinHere);
  const own = source.map ? texture(source.map as Texture).rgb : vec3(0.6);
  const luma = dot(own, vec3(0.299, 0.587, 0.114));
  let colour = base.mul(mix(float(1), luma.mul(1.7), detail));
  if (moss > 0) {
    const up = smoothstep(0.55, 0.9, normalWorld.y);
    const patchy = smoothstep(-0.1, 0.35, mx_noise_float(positionWorld.mul(2.2)));
    colour = mix(colour, MOSS.mul(luma.mul(0.6).add(0.7)), up.mul(patchy).mul(moss));
  }
  const ao = source.aoMap ? texture(source.aoMap as Texture).r : float(1);
  m.colorNode = colour.mul(ao.mul(0.75).add(0.25));
  if (source.normalMap) m.normalNode = normalMap(texture(source.normalMap as Texture));
  if (sway > 0) {
    const low = float(1).sub(smoothstep(0.0, hem, positionLocal.y));
    m.positionNode = positionLocal.add(
      vec3(windDirection.x, 0, windDirection.z).mul(gust.add(BREEZE).mul(sway).mul(low)),
    );
  }
  return m;
}
