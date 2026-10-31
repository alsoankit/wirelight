import { useFrame, useThree } from "@react-three/fiber";
import { useEffect } from "react";
import type { WebGPURenderer } from "three/webgpu";

// A dev aid for tools/shots/perf.mjs (?perf=1): collects each frame's time, draw calls and triangles
// on `window.__perf`. Post passes render several times a frame, so the counters are reset here, once
// a frame, to count them all.

export const perfOn = () => import.meta.env.DEV && new URLSearchParams(window.location.search).get("perf") === "1";

type Sample = { ms: number; draws: number; triangles: number };
type Perf = { samples: Sample[] };

export function PerfProbe() {
  const gl = useThree((s) => s.gl) as unknown as WebGPURenderer;
  useEffect(() => {
    gl.info.autoReset = false;
    (window as unknown as { __perf?: Perf }).__perf = { samples: [] };
    return () => {
      gl.info.autoReset = true;
    };
  }, [gl]);
  useFrame((_, delta) => {
    const perf = (window as unknown as { __perf?: Perf }).__perf;
    if (!perf) return;
    perf.samples.push({ ms: delta * 1000, draws: gl.info.render.drawCalls, triangles: gl.info.render.triangles });
    gl.info.reset();
  });
  return null;
}
