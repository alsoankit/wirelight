import { Canvas, useFrame } from "@react-three/fiber";
import { useRef } from "react";
import { backendFromUrl, nodeRendererFactory } from "../render/backend";
import { FPS, FrameCap } from "../render/FrameCap";
import { QUALITY, QualityContext, scaleFromUrl } from "../render/quality";
import { type Descent, GateScene } from "./GateScene";

// The landing's 3D gate (ONB-01), in its own chunk: three.js, the renderer and the scene load after
// the landing's text is already on screen (tech/rendering.md, "the landing loads first"). LandingPage
// loads it lazily; the page's own background stands in until the first frame.

/** Marks the first frame drawn, for load-time measurements (`wl:landing-frame`). */
function FirstFrameMark() {
  const done = useRef(false);
  useFrame(() => {
    if (done.current) return;
    done.current = true;
    performance.mark("wl:landing-frame");
  });
  return null;
}

const SCALE = scaleFromUrl();

export function GateCanvas({ descent }: { descent: Descent | null }) {
  return (
    <QualityContext.Provider value={QUALITY.high}>
      <Canvas
        gl={nodeRendererFactory(backendFromUrl() === "webgl2" ? "webgl2" : "webgpu")}
        // ?scale= (render/quality.ts) lowers the resolution, as in the game.
        dpr={SCALE ? window.devicePixelRatio * SCALE : undefined}
        frameloop={FPS ? "demand" : "always"}
      >
        <FrameCap />
        <FirstFrameMark />
        <GateScene descent={descent} />
      </Canvas>
    </QualityContext.Provider>
  );
}
