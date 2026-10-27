import { create } from "zustand";

// The loading screen's state (play/LoadingScreen.tsx), fed by the room warm-up (RoomWarmup.tsx): a
// room still loading after a moment shows a progress bar over everything, from 0 to 100, and appears
// only once it has drawn. A room already loaded is ready before the screen would show, so walking
// between loaded rooms never flashes it.

type Loading = { shown: boolean; progress: number; roomId: string | null };

export const useLoading = create<Loading>(() => ({ shown: false, progress: 0, roomId: null }));

/** How long a room may take before the loading screen shows. */
const SHOW_AFTER_MS = 350;
/** Once shown, the screen stays at least this long (no flash), the last moment at 100%. */
const AT_LEAST_MS = 700;

let showTimer = 0;
let shownAt = 0;

export function loadingBegin(roomId: string): void {
  clearTimeout(showTimer);
  useLoading.setState({ progress: 0, roomId });
  showTimer = window.setTimeout(() => {
    shownAt = performance.now();
    useLoading.setState({ shown: true });
  }, SHOW_AFTER_MS);
}

/** Never goes back: 0–1. */
export function loadingProgress(progress: number): void {
  useLoading.setState((s) => ({ progress: Math.max(s.progress, Math.min(progress, 1)) }));
}

export function loadingDone(): void {
  clearTimeout(showTimer);
  useLoading.setState({ progress: 1 });
  if (!useLoading.getState().shown) return;
  const left = Math.max(250, AT_LEAST_MS - (performance.now() - shownAt));
  window.setTimeout(() => useLoading.setState({ shown: false }), left);
}
