// Each region's colour grade, ruined and restored (world/art-briefs/region-*.md, palette tables),
// blended by the ruin dial in the post chain (RoomPost.tsx). The grade only finishes what the lights
// and materials already do: shadows lean toward the region's fog or night, highlights toward its
// light, a soft lifted black floor (never crushed, 0051), and a small saturation and contrast change.
// The two states differ in colour more than in brightness (0051).
//
// Graded in display space (after tone mapping, sRGB-encoded), so the numbers read like a colourist's.
// The reserved colours (cyan alive, amber usable, violet lab) are protected: lights whose hue is near
// one of them keep their pre-grade colour (tools/post/check-grades.mjs measures the hue shift). Only
// lights: restored sandstone and brass share amber's hue and are graded like the rest.
//
// No imports on purpose: the check script loads this file directly with Node.

export type Grade = {
  /** Shadow tint (split toning): the region's fog or night. */
  shadows: string;
  /** Highlight tint: the region's light. */
  highlights: string;
  /** How far shadows lean to their tint (0..1). */
  shadowAmount: number;
  /** How far highlights lean to their tint (0..1). */
  highlightAmount: number;
  /** The black floor, raised toward the shadow tint (display units; 0.03 ≈ 8/255). */
  lift: number;
  /** Around a mid-grey pivot; 1 = unchanged. */
  contrast: number;
  /** 1 = unchanged. */
  saturation: number;
  /** How much the corners darken (0..1); static, never animated. */
  vignette: number;
};

export type RegionGrade = {
  ruined: Grade;
  restored: Grade;
  /** High tier only: soft blur at the top and bottom edges (0..1); the Lantern Town's diorama look. */
  tiltShift: number;
};

export const GRADES: Record<1 | 2 | 3 | 4, RegionGrade> = {
  // The Overgrown Halls: cold moon on blue-grey fog in ruin; candle and sun over warm haze restored.
  1: {
    ruined: {
      shadows: "#2A3140",
      highlights: "#9AA7C2",
      shadowAmount: 0.3,
      highlightAmount: 0.12,
      lift: 0.012,
      contrast: 1.0,
      saturation: 0.92,
      vignette: 0.22,
    },
    restored: {
      shadows: "#5A4632",
      highlights: "#FFC46B",
      shadowAmount: 0.12,
      highlightAmount: 0.06,
      lift: 0.01,
      contrast: 1.02,
      saturation: 0.92,
      vignette: 0.16,
    },
    tiltShift: 0.3,
  },
  // The Sorting Works: frozen grey daylight on dark slate in ruin; amber haze over warm walnut restored.
  2: {
    ruined: {
      shadows: "#2E3238",
      highlights: "#AAB2BC",
      shadowAmount: 0.25,
      highlightAmount: 0.1,
      lift: 0.012,
      contrast: 1.0,
      saturation: 0.88,
      vignette: 0.22,
    },
    restored: {
      shadows: "#6B4226",
      highlights: "#E3B27A",
      shadowAmount: 0.12,
      highlightAmount: 0.06,
      lift: 0.01,
      contrast: 1.03,
      saturation: 0.98,
      vignette: 0.16,
    },
    tiltShift: 0.3,
  },
  // The Lantern Town: blue-black night in ruin; deep blue night under warm lanterns restored (cosy).
  3: {
    ruined: {
      shadows: "#1B1E2A",
      highlights: "#9097A6",
      shadowAmount: 0.32,
      highlightAmount: 0.08,
      lift: 0.014,
      contrast: 1.0,
      saturation: 0.9,
      vignette: 0.22,
    },
    restored: {
      shadows: "#22304A",
      highlights: "#FFCB70",
      shadowAmount: 0.2,
      highlightAmount: 0.07,
      lift: 0.012,
      contrast: 1.02,
      saturation: 0.95,
      vignette: 0.18,
    },
    tiltShift: 1,
  },
  // The Cathedral of Crossings: cold grey-blue and echoing in ruin; golden shafts and incense restored.
  4: {
    ruined: {
      shadows: "#252A35",
      highlights: "#7E8AA0",
      shadowAmount: 0.28,
      highlightAmount: 0.14,
      lift: 0.012,
      contrast: 1.03,
      saturation: 0.88,
      vignette: 0.24,
    },
    restored: {
      shadows: "#5C4A38",
      highlights: "#F2CF8A",
      shadowAmount: 0.12,
      highlightAmount: 0.07,
      lift: 0.01,
      contrast: 1.03,
      saturation: 1.02,
      vignette: 0.18,
    },
    tiltShift: 0.3,
  },
};

/** The reserved colours (art-direction.md): their hue is protected from the grade. */
export const RESERVED = { cyan: "#5EE0E8", amber: "#F2A54A", violet: "#C7A4FF" } as const;

// ---- Shared maths (the shader in RoomPost.tsx mirrors these lines exactly) ----

export type RGB = [number, number, number];

export const LUMA: RGB = [0.2126, 0.7152, 0.0722];
/** Display-space grey the contrast turns around. */
export const PIVOT = 0.42;
/** How strongly a reserved hue keeps its pre-grade colour (1 = fully). */
export const PROTECT = 0.9;
/** What counts as a light: the brightest channel before tone mapping, from not at all to fully. */
export const GLOWING: [number, number] = [0.45, 0.9];

export function hex(value: string): RGB {
  const n = Number.parseInt(value.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function luma(c: RGB): number {
  return c[0] * LUMA[0] + c[1] * LUMA[1] + c[2] * LUMA[2];
}

/** A tint with its brightness taken out, so it shifts colour and not exposure. */
export function tintOf(value: string): RGB {
  const c = hex(value);
  const l = Math.max(luma(c), 1e-4);
  return [c[0] / l, c[1] / l, c[2] / l];
}

/** A reserved colour's direction away from grey (unit length), for the protection test. */
export function chromaDirection(value: string): RGB {
  const c = hex(value);
  const l = luma(c);
  const d: RGB = [c[0] - l, c[1] - l, c[2] - l];
  const len = Math.hypot(...d) || 1;
  return [d[0] / len, d[1] / len, d[2] / len];
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
}

/** How much a display colour counts as one of the reserved colours (0..1). */
export function reservedWeight(c: RGB): number {
  const l = luma(c);
  const d: RGB = [c[0] - l, c[1] - l, c[2] - l];
  const len = Math.hypot(...d);
  if (len < 1e-5) return 0;
  let best = 0;
  for (const r of Object.values(RESERVED)) {
    const dir = chromaDirection(r);
    const cos = (d[0] * dir[0] + d[1] * dir[1] + d[2] * dir[2]) / len;
    best = Math.max(best, smoothstep(0.86, 0.97, cos));
  }
  return best * smoothstep(0.05, 0.14, len);
}

/**
 * The grade on one display-space colour (CPU mirror of the shader, without the vignette). `glowing`:
 * how much the pixel is a light (0..1; the shader reads it from the colour before tone mapping).
 */
export function applyGrade(input: RGB, g: Grade, glowing = 1): RGB {
  const s = tintOf(g.shadows);
  const h = tintOf(g.highlights);
  let c = input.map((v) => (v - PIVOT) * g.contrast + PIVOT) as RGB;
  c = c.map((v, i) => v + g.lift * (s[i] as number) * (1 - v)) as RGB;
  const l = luma(c);
  const ws = (1 - smoothstep(0, 0.55, l)) * g.shadowAmount;
  const wh = smoothstep(0.45, 1, l) * g.highlightAmount;
  c = c.map((v, i) => v * (1 + ((s[i] as number) - 1) * ws) * (1 + ((h[i] as number) - 1) * wh)) as RGB;
  const l2 = luma(c);
  c = c.map((v) => l2 + (v - l2) * g.saturation) as RGB;
  const p = reservedWeight(input) * glowing * PROTECT;
  return c.map((v, i) => Math.min(Math.max(v + ((input[i] as number) - v) * p, 0), 1)) as RGB;
}
