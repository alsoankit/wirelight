import { createContext, useContext } from "react";

// Graphics adapt automatically (0020, tech/rendering.md): the game starts from the renderer it got
// (High on WebGPU, Medium on WebGL2) and steps down when frames stay slow. Players can override it
// (Settings later; ?tier= and the T key in B0). Every tier stays fully playable and readable.

export type Tier = "high" | "medium" | "low" | "simple";

export const TIERS: Tier[] = ["high", "medium", "low", "simple"];

export type QualitySettings = {
  dpr: number; // resolution scale relative to the screen's own pixels (1 = native), capped at 2× CSS pixels
  bloom: boolean;
  moonbeams: boolean;
  fireflies: boolean;
  dust: boolean;
};

export const QUALITY: Record<Tier, QualitySettings> = {
  high: { dpr: 1, bloom: true, moonbeams: true, fireflies: true, dust: true },
  medium: { dpr: 1, bloom: true, moonbeams: true, fireflies: true, dust: true },
  low: { dpr: 0.75, bloom: false, moonbeams: true, fireflies: true, dust: false },
  simple: { dpr: 0.75, bloom: false, moonbeams: false, fireflies: false, dust: false },
};

export function tierFromUrl(): Tier | undefined {
  const value = new URLSearchParams(window.location.search).get("tier");
  return TIERS.find((t) => t === value);
}

export function lower(tier: Tier): Tier {
  return TIERS[Math.min(TIERS.indexOf(tier) + 1, TIERS.length - 1)] as Tier;
}

export const QualityContext = createContext<QualitySettings>(QUALITY.medium);

export function useQuality(): QualitySettings {
  return useContext(QualityContext);
}
