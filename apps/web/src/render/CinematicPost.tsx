import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { film } from "three/addons/tsl/display/FilmNode.js";
import { float, pass, screenUV, smoothstep, vec3 } from "three/tsl";
import { RenderPipeline, type WebGPURenderer } from "three/webgpu";

// The landing's finishing pass (a still, composed shot, unlike the rooms): bloom on bright things, a
// vignette that pulls the eye to the middle, shadows lifted toward blue (night is never pure black),
// and a very light film grain that breaks up flat dark areas. Grain is static per pixel in time, so
// it never reads as flicker. Mount only on the node renderer.

export function CinematicPost() {
  const { gl, scene, camera } = useThree();
  const pipeline = useMemo(() => {
    const p = new RenderPipeline(gl as unknown as WebGPURenderer);
    const colour = pass(scene, camera).getTextureNode("output");
    const glowing = colour.add(bloom(colour, 0.85, 0.6, 0.72));
    const fromCentre = screenUV
      .sub(0.5)
      .mul(vec3(1.25, 1, 1).xy)
      .length();
    const vignette = smoothstep(0.9, 0.25, fromCentre).mul(0.6).add(0.4);
    const lifted = glowing.mul(vignette).add(vec3(0.004, 0.007, 0.016));
    p.outputNode = film(lifted, float(0.06));
    return p;
  }, [gl, scene, camera]);
  useEffect(() => () => pipeline.dispose(), [pipeline]);
  useFrame(() => pipeline.render(), 1);
  return null;
}
