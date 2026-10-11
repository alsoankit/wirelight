import type { WebGLRendererParameters } from "three";
import { WebGPURenderer } from "three/webgpu";

// Three ways to draw the same scene:
// - webgpu:  WebGPURenderer on real WebGPU (the plan, tech/rendering.md)
// - webgl2:  WebGPURenderer forced onto its own WebGL2 backend (the automatic fallback)
// - classic: the plain WebGLRenderer (the documented fallback plan if WebGPU blocks something)
export type BackendChoice = "webgpu" | "webgl2" | "classic";

export function backendFromUrl(): BackendChoice {
  const value = new URLSearchParams(window.location.search).get("backend");
  return value === "webgl2" || value === "classic" ? value : "webgpu";
}

export function usesNodeRenderer(choice: BackendChoice): boolean {
  return choice !== "classic";
}

// R3F's `gl` prop accepts an async factory; WebGPURenderer must be initialised before first use.
export function nodeRendererFactory(choice: BackendChoice) {
  return async (props: WebGLRendererParameters) => {
    const renderer = new WebGPURenderer({
      canvas: props.canvas as HTMLCanvasElement,
      antialias: true,
      forceWebGL: choice === "webgl2",
    });
    await renderer.init();
    return renderer;
  };
}

// What actually ran: WebGPURenderer falls back to WebGL2 by itself when WebGPU isn't available.
export function describeRenderer(gl: unknown): string {
  const backend = (gl as { backend?: { isWebGPUBackend?: boolean; isWebGLBackend?: boolean } }).backend;
  if (backend?.isWebGPUBackend) return "WebGPURenderer · WebGPU backend";
  if (backend?.isWebGLBackend) return "WebGPURenderer · WebGL2 backend";
  return "WebGLRenderer (classic)";
}
