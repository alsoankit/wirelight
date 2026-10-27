import { useTexture } from "@react-three/drei";
import { Suspense, useMemo } from "react";
import { PlaneGeometry, SRGBColorSpace, type Texture } from "three";
import { dot, float, min, mix, mx_noise_float, smoothstep, texture, uv, vec2, vec3 } from "three/tsl";
import { MeshStandardNodeMaterial } from "three/webgpu";
import { ruinHere } from "../ruin";

// Art the palace's builders painted on their walls (0088, 0091): a region's emblem on a shield, the
// Knight's portrait, a fresco. Grey and dim in ruin; where the room is restored its colour comes back
// and the painted gold glows. The gold is found in the picture itself (warm, saturated, bright), so
// any picture works without a hand-drawn mask. A shape (a shield, an arched panel) keeps its own
// outline with a few chips of paint missing; a fresco breaks off at its edges and loses patches of
// plaster, so the wall behind shows through.

const FACE = -3.965; // both walls' inner faces sit here (z for the back wall, x for the left)
const OFF = 0.012; // just in front of the stone

/** Which wall, how far along it (m, centre), how high (m, centre), how wide (m). */
export type WallArtMark = {
  url: string;
  wall: "back" | "left";
  along: number;
  y: number;
  width: number;
  /** Width over height of the picture. */
  aspect: number;
  /** "shape": the picture's own outline (alpha); "fresco": broken plaster edges and missing patches. */
  edges?: "shape" | "fresco";
  seed?: number;
};

/**
 * The painted look as a material: faded in ruin, its gold lit where restored, worn. Shared with the
 * Knight's shield (its painted face).
 */
export function paintedMaterial(map: Texture, { edges = "shape", aspect = 1, seed = 0 } = {}) {
  map.colorSpace = SRGBColorSpace;
  map.anisotropy = 4;
  const m = new MeshStandardNodeMaterial({ roughness: 0.95, metalness: 0 });
  const sample = texture(map);
  const rgb = sample.rgb;

  // Ruin: the pigment fades to a dim grey with only a trace of its colour.
  const grey = vec3(dot(rgb, vec3(0.299, 0.587, 0.114)));
  const faded = mix(rgb, grey.mul(0.6), 0.85);
  m.colorNode = mix(rgb, faded, ruinHere);

  // The painted gold: warm (little blue against red), with real green in it (not terracotta), bright.
  const r = rgb.r.max(0.001);
  const gold = float(1)
    .sub(smoothstep(0.16, 0.3, rgb.b.div(r)))
    .mul(smoothstep(0.35, 0.5, rgb.g.div(r)))
    .mul(smoothstep(0.3, 0.5, rgb.r));
  const lit = float(1).sub(ruinHere);
  // A little of its own colour too, so the paint isn't darker than the baked wall round it.
  m.emissiveNode = rgb.mul(gold.mul(1.4).add(0.12)).mul(lit);

  const at = uv();
  const noise = (scale: number, offset: number) =>
    mx_noise_float(at.mul(vec2(scale * aspect, scale)).add(seed + offset));
  if (edges === "fresco") {
    const edge = min(min(at.x, float(1).sub(at.x)), min(at.y, float(1).sub(at.y)));
    const kept = smoothstep(0.0, 0.05, edge.add(noise(9, 0).mul(0.035)));
    m.opacityNode = kept.mul(float(1).sub(smoothstep(0.52, 0.56, noise(2.2, 7.3))));
  } else {
    // Its own outline, with a few small chips where the paint has flaked off.
    m.opacityNode = sample.a.mul(float(1).sub(smoothstep(0.62, 0.66, noise(5, 3.1))));
  }
  m.alphaTest = 0.5;
  return m;
}

/**
 * Waits for its own picture (its own Suspense): loading it never suspends the room around it, which
 * remounted the room and left the scene's background unset (three.js then failed every frame).
 */
export function WallArt(props: WallArtMark) {
  return (
    <Suspense fallback={null}>
      <Painted {...props} />
    </Suspense>
  );
}

function Painted({ url, wall, along, y, width, aspect, edges = "shape", seed = 0 }: WallArtMark) {
  const map = useTexture(url);
  const { geometry, material } = useMemo(
    () => ({
      geometry: new PlaneGeometry(width, width / aspect),
      material: paintedMaterial(map, { edges, aspect, seed }),
    }),
    [map, width, aspect, edges, seed],
  );
  const position: [number, number, number] = wall === "back" ? [along, y, FACE + OFF] : [FACE + OFF, y, along];
  return (
    <mesh
      geometry={geometry}
      material={material}
      position={position}
      rotation={[0, wall === "back" ? 0 : Math.PI / 2, 0]}
      receiveShadow
    />
  );
}
