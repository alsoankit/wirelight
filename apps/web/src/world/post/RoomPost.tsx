import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { ACESFilmicToneMapping, AgXToneMapping, NeutralToneMapping, type ToneMapping, Vector3 } from "three";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { gaussianBlur } from "three/addons/tsl/display/GaussianBlurNode.js";
import {
  abs,
  clamp,
  dot,
  float,
  length,
  max,
  mix,
  pass,
  screenUV,
  smoothstep,
  sRGBTransferOETF,
  toneMapping,
  uniform,
  vec2,
  vec3,
  vec4,
} from "three/tsl";
import { type Node, RenderPipeline, type WebGPURenderer } from "three/webgpu";
import { Bloom } from "../../render/Bloom";
import { QUALITY, type QualitySettings, useQuality } from "../../render/quality";
import { useRegion } from "../region";
import { ruin } from "../ruin";
import { chromaDirection, GLOWING, GRADES, type Grade, LUMA, PIVOT, PROTECT, RESERVED, tintOf } from "./grades";

// The rooms' finishing pass (tech/rendering.md "Post-processing", 0049), on three's node RenderPipeline:
//   scene → bloom (only lights: runes, lamps, windows, messages, lit corridors)
//         → tone mapping → the region's colour grade, blended by the ruin dial (grades.ts)
//         → a gentle static vignette → (High only) a soft tilt-shift blur at the top and bottom edges.
// Per tier: High = all of it; Medium = no tilt-shift; Low and Simple = no post at all (the renderer's
// own tone mapping, as before). Nothing here moves on its own (no grain, no flicker): the grade only
// follows the ruin dial, which is already a fade with reduced motion.
// Tone mapping is AgX (soft, painterly, light on the eyes; keeps sandstone sandstone where Neutral
// turned it orange). AgX pales very bright saturated light, so lights in a reserved hue (cyan alive,
// amber usable, violet lab) take the hue-faithful Neutral mapping instead, and skip the grade.
// Dev aids: ?post=0 shows the old bloom-only pass on Medium/High; ?tm=neutral|agx|aces picks the tone
// mapping and ?exp=<n> its exposure. Mount only on the node renderer.

type Mapping = "neutral" | "agx" | "aces";

/** Tone mapping (and the exposure that keeps the rooms' brightness where the lights were tuned). */
const MAPPINGS: Record<Mapping, { mapping: ToneMapping; exposure: number }> = {
  agx: { mapping: AgXToneMapping, exposure: 0.8 },
  // Khronos PBR Neutral keeps hues: always used for the reserved colours.
  neutral: { mapping: NeutralToneMapping, exposure: 1 },
  // What the rooms had before (R3F's default on the renderer).
  aces: { mapping: ACESFilmicToneMapping, exposure: 1 },
};
const DEFAULT_MAPPING: Mapping = "agx";

function param(name: string): string | null {
  return typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get(name);
}

/** ?post=0|1: the finishing pass on or off (on by default where the tier allows it). */
export function postFromUrl(): boolean {
  return param("post") !== "0";
}

function mappingFromUrl(): { mapping: ToneMapping; exposure: number } {
  const value = param("tm");
  const chosen = MAPPINGS[value === "agx" || value === "aces" || value === "neutral" ? value : DEFAULT_MAPPING];
  const exposure = Number(param("exp"));
  return exposure > 0 ? { ...chosen, exposure } : chosen;
}

/** High is the only tier with the tilt-shift; tiers are told apart by their settings object. */
function isHigh(quality: QualitySettings): boolean {
  return quality === QUALITY.high;
}

/** Bloom as the rooms had it: only bright things (messages lifted just past 0.9) glow. */
const BLOOM = { strength: 0.5, radius: 0.45, threshold: 0.9 };

/** One grade's uniforms. */
function gradeUniforms() {
  return {
    shadows: uniform(new Vector3(1, 1, 1)),
    highlights: uniform(new Vector3(1, 1, 1)),
    shadowAmount: uniform(0),
    highlightAmount: uniform(0),
    lift: uniform(0),
    contrast: uniform(1),
    saturation: uniform(1),
    vignette: uniform(0),
  };
}

type GradeUniforms = ReturnType<typeof gradeUniforms>;

function setGrade(u: GradeUniforms, g: Grade): void {
  u.shadows.value.set(...tintOf(g.shadows));
  u.highlights.value.set(...tintOf(g.highlights));
  u.shadowAmount.value = g.shadowAmount;
  u.highlightAmount.value = g.highlightAmount;
  u.lift.value = g.lift;
  u.contrast.value = g.contrast;
  u.saturation.value = g.saturation;
  u.vignette.value = g.vignette;
}

/** The finishing pass where the tier allows it; the old bloom-only pass with ?post=0. */
export function RoomPost() {
  const quality = useQuality();
  if (!quality.bloom) return null;
  return postFromUrl() ? <Finish high={isHigh(quality)} /> : <Bloom />;
}

function Finish({ high }: { high: boolean }) {
  const { gl, scene, camera } = useThree();
  const region = useRegion();
  const grade = useMemo(() => ({ ruined: gradeUniforms(), restored: gradeUniforms(), tiltShift: uniform(0) }), []);

  const pipeline = useMemo(() => {
    const p = new RenderPipeline(gl as unknown as WebGPURenderer);
    const colour = pass(scene, camera).getTextureNode("output");
    const glow = bloom(colour, BLOOM.strength, BLOOM.radius, BLOOM.threshold);

    // High: the top and bottom edges soften, like a diorama seen close (the Lantern Town most).
    let base = colour.rgb;
    if (high) {
      const blurred = gaussianBlur(colour, null, 2.5, { resolutionScale: 0.5 });
      const edge = smoothstep(0.3, 0.5, abs(screenUV.y.sub(0.5))).mul(grade.tiltShift);
      base = mix(colour.rgb, blurred.rgb, edge);
    }
    const lit = base.add(glow.rgb);

    const { mapping, exposure } = mappingFromUrl();
    const encode = (m: ToneMapping, e: number) =>
      sRGBTransferOETF(clamp(toneMapping(m, float(e), lit), 0, 1)) as Node<"vec3">;
    const faithful = encode(NeutralToneMapping, MAPPINGS.neutral.exposure);

    // The reserved colours (art-direction.md): how much this pixel is a cyan, amber or violet light.
    // Only lights count (bright before tone mapping): restored sandstone shares amber's hue.
    const luma = vec3(...LUMA);
    const away = faithful.sub(dot(faithful, luma));
    const chroma = length(away);
    const facing = (value: string) =>
      smoothstep(0.86, 0.97, dot(away, vec3(...chromaDirection(value))).div(max(chroma, 1e-5)));
    const glowing = smoothstep(GLOWING[0], GLOWING[1], max(max(lit.r, lit.g), lit.b));
    const reserved = max(max(facing(RESERVED.cyan), facing(RESERVED.amber)), facing(RESERVED.violet))
      .mul(smoothstep(0.05, 0.14, chroma))
      .mul(glowing);
    const before = mix(encode(mapping, exposure), faithful, reserved);

    // The grade, blended by the ruin dial (1 = ruined). Mirrors applyGrade in grades.ts.
    const { ruined: a, restored: b } = grade;
    const shadows = mix(b.shadows, a.shadows, ruin);
    const highlights = mix(b.highlights, a.highlights, ruin);
    let c = before
      .sub(PIVOT)
      .mul(mix(b.contrast, a.contrast, ruin))
      .add(PIVOT);
    c = c.add(shadows.mul(mix(b.lift, a.lift, ruin)).mul(float(1).sub(c)));
    const l = dot(c, luma);
    const ws = float(1)
      .sub(smoothstep(0, 0.55, l))
      .mul(mix(b.shadowAmount, a.shadowAmount, ruin));
    const wh = smoothstep(0.45, 1, l).mul(mix(b.highlightAmount, a.highlightAmount, ruin));
    c = c.mul(vec3(1).add(shadows.sub(1).mul(ws))).mul(vec3(1).add(highlights.sub(1).mul(wh)));
    c = mix(vec3(dot(c, luma)), c, mix(b.saturation, a.saturation, ruin));

    // The reserved colours keep their pre-grade colour.
    c = mix(c, before, reserved.mul(PROTECT));

    // A gentle vignette, still (never pulsing); a touch deeper in ruin.
    const fromCentre = screenUV.sub(0.5).mul(vec2(1.2, 1)).length();
    const vignette = float(1).sub(smoothstep(0.3, 0.85, fromCentre));
    c = c.mul(mix(float(1), vignette, mix(b.vignette, a.vignette, ruin)));

    p.outputNode = vec4(vec3(clamp(c, 0, 1)), float(1));
    // Tone mapping and the sRGB encoding are done above.
    p.outputColorTransform = false;
    return p;
  }, [gl, scene, camera, high, grade]);

  useEffect(() => {
    const g = GRADES[region];
    setGrade(grade.ruined, g.ruined);
    setGrade(grade.restored, g.restored);
    grade.tiltShift.value = g.tiltShift;
  }, [region, grade]);

  useEffect(() => () => pipeline.dispose(), [pipeline]);
  // A positive priority takes rendering over from R3F while this is mounted.
  useFrame(() => pipeline.render(), 1);
  return null;
}
