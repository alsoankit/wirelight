import { useEffect } from "react";

// Code the game needs soon but not on the way in (tech/rendering.md, loading): fetched once the
// first room is up and the browser is idle, so the way in and the first room never wait for it.

/** The console (xterm.js and its styles): its own chunk, loaded when a room first needs it. */
export const loadConsole = () => import("../play/Console");

/** How long after the game opens to start fetching what comes later. */
const LATER_MS = 4000;

function whenIdle(run: () => void): () => void {
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  let idle: number | undefined;
  const timer = setTimeout(() => {
    if (w.requestIdleCallback) idle = w.requestIdleCallback(run, { timeout: 4000 });
    else run();
  }, LATER_MS);
  return () => {
    clearTimeout(timer);
    if (idle !== undefined) w.cancelIdleCallback?.(idle);
  };
}

/** Prefetches the game's later code a few seconds after the game opens. */
export function usePrefetchLater(): void {
  useEffect(
    () =>
      whenIdle(() => {
        void loadConsole();
      }),
    [],
  );
}
