import { Canvas } from "@react-three/fiber";
import { backendFromUrl, nodeRendererFactory } from "./render/backend";
import { ObservatoryScene } from "./world/observatory/ObservatoryScene";

// B0 · Look and feel: one Region 1 room with mock data (production/roadmap.md).
// The world always uses the node renderer (0049): ?backend=webgpu (default) or ?backend=webgl2.
// ?ruin=0 starts restored; press R to toggle.

export function B0Room() {
  const backend = backendFromUrl() === "webgl2" ? "webgl2" : "webgpu";
  return (
    <Canvas key={backend} gl={nodeRendererFactory(backend)} dpr={[1, 2]} shadows="percentage">
      <ObservatoryScene />
    </Canvas>
  );
}
