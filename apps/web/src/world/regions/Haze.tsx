import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import {
  AddEquation,
  AdditiveBlending,
  type BufferGeometry,
  CustomBlending,
  DoubleSide,
  type Mesh,
  OneFactor,
  PlaneGeometry,
  SrcColorFactor,
  ZeroFactor,
} from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import {
  atan,
  attribute,
  color,
  float,
  mix,
  mx_noise_float,
  positionWorld,
  select,
  smoothstep,
  step,
  time,
  uniform,
  uv,
  vec2,
  vec3,
} from "three/tsl";
import { MeshBasicNodeMaterial } from "three/webgpu";
import { ruin, ruinHere } from "../ruin";

// The Cathedral's air and glass (region-4 brief):
// - A little incense haze: a few soft, faint sheets of warm air hung through the room, drifting
//   slowly, there only as the room restores. One draw call; background only (moonbeam tiers).
// - Stained glass: the kit's windows glow a plain warm white through their leading (the emission
//   atlas); panes laid over them (regions/cathedral.ts) multiply that light into jewel tones (ruby
//   low, sapphire, a gold head; a rose of ruby and sapphire petals round a gold eye), so the kit's
//   tracery and lattice stay dark and sharp over the colour. Dark glass in ruin stays dark, only
//   tinted. Kept away from cyan: the blue leans to sapphire. One draw call, every tier.

/** Multiply factors, against the warm window glow (#FFC46B): what reaches the eye is jewel-toned. */
const RUBY = vec3(0.95, 0.07, 0.14);
const SAPPHIRE = vec3(0.07, 0.22, 1.0);
const GOLD = vec3(1.0, 0.66, 0.24);

function StainedGlass({ geometry }: { geometry: BufferGeometry }) {
  const material = useMemo(() => {
    const m = new MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      blending: CustomBlending,
      blendEquation: AddEquation,
      blendSrc: ZeroFactor,
      blendDst: SrcColorFactor,
      blendSrcAlpha: ZeroFactor,
      blendDstAlpha: OneFactor,
    });
    const pane = attribute("pane", "vec3");
    const u = pane.x;
    const v = pane.y;
    // A lancet: ruby low, sapphire through the middle, gold in the head; a little mottling in each.
    const lancet = select(v.lessThan(0.26), RUBY, select(v.lessThan(0.66), SAPPHIRE, GOLD));
    // A rose: a gold eye, eight petals in ruby and sapphire by turns, a gold rim.
    const centred = vec2(u, v).sub(0.5).mul(2);
    const r = centred.length();
    const petal = step(
      0.5,
      atan(centred.y, centred.x)
        .mul(8 / (2 * Math.PI))
        .fract(),
    );
    const rose = select(r.lessThan(0.26).or(r.greaterThan(0.86)), GOLD, mix(RUBY, SAPPHIRE, petal));
    const tone = select(pane.z.greaterThan(0.5), rose, lancet);
    const mottle = mx_noise_float(positionWorld.mul(5.5)).mul(0.12).add(0.94);
    // In ruin the glass is dull and dark: the colours sink toward a dim grey of themselves.
    const dull = tone.mul(0.4).add(0.12);
    m.colorNode = mix(tone.mul(mottle), dull, ruinHere).min(1);
    return m;
  }, []);
  return <mesh geometry={geometry} material={material} renderOrder={2} />;
}

function IncenseHaze() {
  const level = useMemo(() => uniform(0), []);
  const mesh = useRef<Mesh>(null);
  const { geometry, material } = useMemo(() => {
    const sheets = [
      { at: [-1.2, 1.6, -1.6], turn: 0.785 },
      { at: [0.8, 1.9, -0.2], turn: 0.785 },
      { at: [-2.2, 1.4, 0.8], turn: 0.785 },
    ].map(({ at, turn }) => {
      const g = new PlaneGeometry(4.5, 2.6);
      g.rotateY(turn);
      g.translate(at[0] as number, at[1] as number, at[2] as number);
      return g;
    });
    const m = new MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      side: DoubleSide,
      toneMapped: false,
    });
    const edge = float(1).sub(smoothstep(0.15, 0.5, uv().sub(vec2(0.5, 0.5)).length()));
    const drift = mx_noise_float(positionWorld.mul(0.6).add(vec2(time.mul(0.05), 0).xxy))
      .mul(0.5)
      .add(0.5);
    m.colorNode = color("#C9A27A").mul(edge.mul(drift).mul(level).mul(0.07));
    return { geometry: mergeGeometries(sheets), material: m };
  }, [level]);
  useFrame(() => {
    level.value = 1 - ruin.value;
    if (mesh.current) mesh.current.visible = level.value > 0.02;
  });
  return <mesh ref={mesh} geometry={geometry} material={material} frustumCulled={false} />;
}

export function Haze({ haze, glass }: { haze: boolean; glass?: BufferGeometry }) {
  return (
    <>
      {haze && <IncenseHaze />}
      {glass && <StainedGlass geometry={glass} />}
    </>
  );
}
