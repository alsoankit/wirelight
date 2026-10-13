import { useEffect, useState } from "react";
import { useProgress } from "./progress";

// Reduced motion (UI-23, rendering.md "Accessibility in the 3D layer"): from Settings (Reduced or
// Full), or the system's choice when Settings says "Follow my system". With it, camera moves and
// travel become fades: no parallax, no settling in, the descent and the restoration wave as fades.
// The page carries the answer as `data-reduced` on <html>, so the stylesheet follows it too.

const query = typeof window !== "undefined" ? window.matchMedia("(prefers-reduced-motion: reduce)") : null;

/** Whether motion is reduced right now (for code outside React, or read once). */
export function reducedMotion(): boolean {
  const chosen = useProgress.getState().settings.motion;
  return chosen === "reduced" || (chosen === "system" && !!query?.matches);
}

function mark(): void {
  if (typeof document !== "undefined") document.documentElement.dataset.reduced = reducedMotion() ? "yes" : "no";
}

// Kept on <html> from the start, and whenever the setting or the system's choice changes.
mark();
useProgress.subscribe((s, prev) => {
  if (s.settings.motion !== prev.settings.motion) mark();
});
query?.addEventListener("change", mark);

/** Whether motion is reduced; re-renders when the setting or the system's choice changes. */
export function useReducedMotion(): boolean {
  const chosen = useProgress((s) => s.settings.motion);
  const [system, setSystem] = useState(() => !!query?.matches);
  useEffect(() => {
    if (!query) return;
    const onChange = () => setSystem(query.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return chosen === "reduced" || (chosen === "system" && system);
}
