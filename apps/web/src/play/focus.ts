import { type RefObject, useEffect } from "react";

// Focus for dialogs and overlays (UI-18, UI-19): when one appears, focus moves into it (to the
// element marked `data-autofocus`, else its first control); a modal one keeps Tab inside; when it
// goes, focus returns to where it was. "polite" ones (spoken lines, the debrief) never take focus
// from someone typing or reading a panel; they take it only from the room itself.

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusables(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null);
}

/** Whether focus is free to take: on nothing, or on the room's own labels. */
function focusIsFree(): boolean {
  const active = document.activeElement;
  return !active || active === document.body || !!active.closest(".world");
}

type Options = {
  /** Keep Tab inside (a modal dialog). */
  trap?: boolean;
  /** Take focus only when nothing else has it (spoken lines, the debrief). */
  polite?: boolean;
  /** When this changes (the next line, the next step), focus moves to the new first control. */
  step?: unknown;
};

export function useDialogFocus(
  ref: RefObject<HTMLElement | null>,
  { trap = false, polite = false, step }: Options = {},
) {
  // Where focus was before, given back when the dialog goes.
  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      requestAnimationFrame(() => {
        const active = document.activeElement;
        if ((!active || active === document.body) && before?.isConnected) before.focus({ preventScroll: true });
      });
    };
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `step` is the trigger: a new step takes focus again
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    if (polite && !focusIsFree() && !root.contains(document.activeElement)) return;
    const target = root.querySelector<HTMLElement>("[data-autofocus]") ?? focusables(root)[0] ?? root;
    if (target === root && !root.hasAttribute("tabindex")) root.setAttribute("tabindex", "-1");
    target.focus({ preventScroll: true });
  }, [step, polite, ref]);

  useEffect(() => {
    const root = ref.current;
    if (!root || !trap) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const all = focusables(root);
      const first = all[0];
      const last = all.at(-1);
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      } else if (!root.contains(document.activeElement)) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [trap, ref]);
}

/**
 * A ref callback for an overlay that appears on its own (the debrief): on mount it moves focus to its
 * `data-autofocus` control, politely (only from the room, never from someone typing or reading).
 */
export function takeFocusPolitely(el: HTMLElement | null): void {
  if (!el || !focusIsFree()) return;
  requestAnimationFrame(() => el.querySelector<HTMLElement>("[data-autofocus]")?.focus({ preventScroll: true }));
}
