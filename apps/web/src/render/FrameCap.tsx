import { useThree } from "@react-three/fiber";
import { useEffect } from "react";
import { fpsFromUrl } from "./quality";

/** With `?fps=` (render/quality.ts) the canvas draws on demand: this asks for a frame that often. */
export const FPS = fpsFromUrl();

export function FrameCap() {
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => {
    if (!FPS) return;
    const id = setInterval(() => invalidate(), 1000 / FPS);
    return () => clearInterval(id);
  }, [invalidate]);
  return null;
}
