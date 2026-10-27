import { useProgress } from "@react-three/drei";
import { useThree } from "@react-three/fiber";
import { useEffect, useState } from "react";
import type { Camera, Object3D, Scene } from "three";
import { useSession } from "../engine/store";
import { preloadNeighbours } from "../world/room/preloadNext";
import { loadingBegin, loadingCancel, loadingDone, loadingProgress } from "./loading";

// Entering a room without the freeze (tech/rendering.md, loading; perf pass 2026-10-13).
//
// A room seen for the first time builds its shaders (TSL → WGSL) and GPU pipelines on its first
// frame, and bakes its moonlight while it mounts: on a modest laptop that froze the screen for up to
// a second when walking through a door. Now the room view dims at once (a veil over the canvas and
// its labels, never over the interface), the new room mounts behind it, its shaders compile with the
// renderer's `compileAsync` (which yields between objects instead of blocking a frame), and the veil
// lifts once the room has drawn. A room whose shaders are already built is ready in a few frames.

/** Frames the room draws, hidden by the veil, before it lifts (the pipelines' first use). */
const SETTLE_FRAMES = 3;
/**
 * Longest the veil waits for models and shaders before lifting anyway. Long: a room loading shows the
 * loading screen with its progress (render/loading.ts), and appears whole rather than piece by piece.
 */
const MAX_WAIT_MS = 20_000;
/** After the veil lifts, when to start fetching the next rooms' models. */
const NEXT_DELAY_MS = 1500;
/** How long the veil takes to lift. */
const LIFT_MS = 280;

const VEIL_CLASS = "wl-room-veil";
const VEILED = "data-wl-veiled";

let styled = false;
function ensureStyle(): void {
  if (styled) return;
  styled = true;
  const style = document.createElement("style");
  // While veiled, the room's floating labels (drei Html, siblings of the canvas) hide with the room.
  style.textContent = `[${VEILED}="yes"] > div:not(.${VEIL_CLASS}) { visibility: hidden; }`;
  document.head.append(style);
}

function veilOf(canvas: HTMLCanvasElement): HTMLDivElement | null {
  const host = canvas.parentElement;
  if (!host) return null;
  let veil = host.querySelector<HTMLDivElement>(`:scope > .${VEIL_CLASS}`);
  if (!veil) {
    ensureStyle();
    veil = document.createElement("div");
    veil.className = VEIL_CLASS;
    veil.setAttribute("aria-hidden", "true");
    // Just above the canvas, under the labels' layer; the interface sits outside this box.
    Object.assign(veil.style, {
      position: "absolute",
      inset: "0",
      background: "#06070a",
      pointerEvents: "none",
      opacity: "0",
      transition: `opacity ${LIFT_MS}ms ease`,
      willChange: "opacity",
    });
    canvas.after(veil);
  }
  return veil;
}

/** Never left up: if nothing lifts it (a room that never mounts), it lifts by itself. */
const FAILSAFE_MS = 2 * MAX_WAIT_MS;
const failsafes = new WeakMap<HTMLElement, number>();

/** Darkens the room view at once (no fade in: the swap happens behind it). */
function showVeil(canvas: HTMLCanvasElement): void {
  const veil = veilOf(canvas);
  if (!veil) return;
  veil.style.transition = "none";
  veil.style.opacity = "1";
  canvas.parentElement?.setAttribute(VEILED, "yes");
  clearTimeout(failsafes.get(veil));
  failsafes.set(
    veil,
    window.setTimeout(() => liftVeil(canvas), FAILSAFE_MS),
  );
}

function liftVeil(canvas: HTMLCanvasElement): void {
  const veil = veilOf(canvas);
  canvas.parentElement?.setAttribute(VEILED, "no");
  if (!veil) return;
  clearTimeout(failsafes.get(veil));
  veil.style.transition = `opacity ${LIFT_MS}ms ease`;
  veil.style.opacity = "0";
}

type Shown = { roomId: string | null; here: string | null };

/**
 * The room and machine to draw. Walking to another machine in the same room is held back for two
 * frames while the veil goes up, so the swap (and its one-off work) happens out of sight. A new room
 * (a load) swaps at once, as before.
 */
export function useShownRoom(): Shown {
  const roomId = useSession((s) => s.roomId);
  const here = useSession((s) => s.here);
  const canvas = useThree((s) => s.gl.domElement);
  const [shown, setShown] = useState<Shown>({ roomId, here });
  const walking = shown.roomId === roomId && shown.here !== here && !!shown.here && !!here;

  useEffect(() => {
    if (!walking) return;
    showVeil(canvas);
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setShown({ roomId, here }));
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [walking, roomId, here, canvas]);

  if (!walking && (shown.roomId !== roomId || shown.here !== here)) {
    // A new room (or the first): swap now. Setting state during render is React's pattern for
    // state derived from props; it re-renders before committing.
    setShown({ roomId, here });
  }
  return walking ? shown : { roomId, here };
}

function isDrawable(o: Object3D): boolean {
  const d = o as Object3D & { isMesh?: boolean; isPoints?: boolean; isLine?: boolean; isSprite?: boolean };
  return !!(d.isMesh || d.isPoints || d.isLine || d.isSprite);
}

type Compiler = { compileAsync?: (scene: Object3D, camera: Camera, target?: Scene | null) => Promise<unknown> };

/** Loading the files is most of the bar; building the shaders and the first frames, the rest. */
const FILES_SHARE = 0.8;

/** Waits until no model is loading (drei's loading tracker), or `ms` at most; reports its progress. */
function modelsLoaded(ms: number): Promise<void> {
  return new Promise((resolve) => {
    if (!useProgress.getState().active) return resolve();
    const stop = useProgress.subscribe((s) => {
      if (s.total > 0) loadingProgress((FILES_SHARE * s.loaded) / s.total);
      if (s.active) return;
      stop();
      clearTimeout(timer);
      resolve();
    });
    const timer = setTimeout(() => {
      stop();
      resolve();
    }, ms);
  });
}

/**
 * Mount once per room view (keyed by room and machine), after the room's own content. Keeps the veil
 * up until the room's models are in, its shaders are compiled, and it has drawn a few frames.
 */
export function RoomWarmup({ roomId, here }: { roomId: string; here: string }) {
  const get = useThree((s) => s.get);
  useEffect(() => {
    const { gl, scene, camera } = get();
    const canvas = gl.domElement;
    showVeil(canvas);
    loadingBegin(roomId);
    const started = performance.now();
    let cancelled = false;
    let lifted = false;
    let frame = 0;
    const hidden: Object3D[] = [];
    const reveal = () => {
      for (const o of hidden) o.visible = true;
      hidden.length = 0;
    };
    const lift = () => {
      if (cancelled) return;
      // A few frames drawn behind the veil: the pipelines' first use happens out of sight.
      let left = SETTLE_FRAMES;
      const tick = () => {
        if (cancelled) return;
        if (left-- > 0) frame = requestAnimationFrame(tick);
        else {
          liftVeil(canvas);
          lifted = true;
          loadingDone();
          performance.measure("wl:room-ready", { start: started, end: performance.now() });
          // Then the rooms the player can walk to next: their models, while this one is played.
          setTimeout(() => preloadNeighbours(roomId, here), NEXT_DELAY_MS);
        }
      };
      frame = requestAnimationFrame(tick);
    };
    const warm = async () => {
      await modelsLoaded(MAX_WAIT_MS);
      loadingProgress(FILES_SHARE);
      // One frame so that what finished loading has mounted (and baked) before compiling.
      await new Promise((r) => requestAnimationFrame(r));
      const compiler = gl as unknown as Compiler;
      if (cancelled || !compiler.compileAsync) return;
      // Hide what draws while its shaders compile, so no frame builds them on the spot. compileAsync
      // gathers the objects synchronously (only visible ones), so they are shown just for that call.
      scene.traverse((o) => {
        if (isDrawable(o) && o.visible) hidden.push(o);
      });
      const compiling = compiler.compileAsync(scene, camera);
      for (const o of hidden) o.visible = false;
      const left = Math.max(0, MAX_WAIT_MS - (performance.now() - started));
      await Promise.race([compiling.catch(() => undefined), new Promise((r) => setTimeout(r, left))]);
      loadingProgress(0.95);
    };
    warm()
      .catch(() => undefined)
      .finally(() => {
        reveal();
        lift();
      });
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      reveal();
      if (!lifted) loadingCancel();
    };
  }, [get, roomId, here]);
  return null;
}
