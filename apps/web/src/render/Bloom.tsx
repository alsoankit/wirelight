import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { pass } from "three/tsl";
import { RenderPipeline, type WebGPURenderer } from "three/webgpu";

// Glow through three's node RenderPipeline (0049). Only bright things bloom (threshold), so
// messages and the keeper's eye glow while the room stays crisp. Mount only on the node renderer.

type Props = { strength?: number; radius?: number; threshold?: number };

export function Bloom({ strength = 0.5, radius = 0.45, threshold = 0.9 }: Props) {
  const { gl, scene, camera } = useThree();
  const pipeline = useMemo(() => {
    const p = new RenderPipeline(gl as unknown as WebGPURenderer);
    const sceneColor = pass(scene, camera).getTextureNode("output");
    p.outputNode = sceneColor.add(bloom(sceneColor, strength, radius, threshold));
    return p;
  }, [gl, scene, camera, strength, radius, threshold]);
  useEffect(() => () => pipeline.dispose(), [pipeline]);
  // A positive priority takes rendering over from R3F while this is mounted.
  useFrame(() => pipeline.render(), 1);
  return null;
}
