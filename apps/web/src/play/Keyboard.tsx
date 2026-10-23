import { roomById } from "@wirelight/rooms";
import { useEffect } from "react";
import { type Panel, useSession } from "../engine/store";
import { goThrough, stepIntoCorridor } from "../world/corridor/move";
import { doorsOf } from "../world/room/MachineScene";
import { isTyping, TAB, withModifier } from "./keys";

// Playing by keyboard (CORE-47, UI-05, UI-18). Number keys go through the room's doors in order
// (eth0 = 1, eth1 = 2…), only into rooms that can be entered; Shift and a number steps into that door's
// corridor (0081), where ← and → go on and Esc steps back; Esc steps back (closes the open panel;
// the Glass closes itself); Space pauses time; G, M and ` live with what they open. No key fires
// while typing.
// Panels take focus when they open and hand it back when they close; the room's objects are in a
// sensible Tab order (plates, doorways, cable ends, furniture, the keeper), then the bars.

/** Something modal is on screen (the path choice, the tour, a command memory): the room waits. */
const modalOpen = () => !!document.querySelector('[aria-modal="true"]');

/** Door n of the room the player is in (not while in a corridor: its own keys move there). */
function door(n: number) {
  const s = useSession.getState();
  const room = s.roomId ? roomById(s.roomId) : undefined;
  if (!room || s.corridor) return undefined;
  return doorsOf(room, s.here ?? room.playerDevice, () => undefined)[n - 1];
}

/** A number key: through that door, gliding along its corridor (0081). */
function goThroughDoor(n: number): boolean {
  const d = door(n);
  if (!d?.enterable) return false;
  goThrough(d.link, d.device, d.peer);
  return true;
}

/** Shift and a number key: into that door's corridor, stopping there (0081). */
function stepIntoDoorCorridor(n: number): boolean {
  const d = door(n);
  if (!d) return false;
  stepIntoCorridor(d.link, d.device);
  return true;
}

/** Panels (UI-03) and the menu: the element to move focus into. */
const PANEL_SELECTOR = ".panel, .menu";

function samePanel(a: Panel | null, b: Panel | null): boolean {
  if (!a || !b || a.kind !== b.kind) return false;
  const da = "device" in a ? a.device : undefined;
  const db = "device" in b ? b.device : undefined;
  return da === db;
}

/** Moves focus into a panel when it opens, and back to what opened it when it closes. */
function usePanelFocus() {
  useEffect(() => {
    let opener: HTMLElement | null = null;
    return useSession.subscribe((s, prev) => {
      if (s.panel === prev.panel) return;
      if (s.panel && !samePanel(s.panel, prev.panel)) {
        if (!prev.panel) {
          const active = document.activeElement;
          opener = active instanceof HTMLElement && active !== document.body ? active : null;
        }
        requestAnimationFrame(() => {
          const el = document.querySelector<HTMLElement>(PANEL_SELECTOR);
          if (!el || el.contains(document.activeElement)) return;
          // A field being typed in elsewhere keeps its focus (the console stays the console).
          const active = document.activeElement;
          if (active instanceof HTMLElement && active.closest(".console")) return;
          if (!el.hasAttribute("tabindex")) el.setAttribute("tabindex", "-1");
          el.focus({ preventScroll: true });
        });
      } else if (!s.panel && prev.panel) {
        const back = opener;
        opener = null;
        requestAnimationFrame(() => {
          const active = document.activeElement;
          const lost = !active || active === document.body;
          if (back?.isConnected && lost) back.focus({ preventScroll: true });
        });
      }
    });
  }, []);
}

/** The keys that move the player and step back. */
function useKeys() {
  useEffect(() => {
    // Esc runs first (capture), so it closes only the topmost thing.
    const onEscape = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (target?.closest(".console")) return; // the terminal keeps its own keys
      if (document.querySelector(".glass")) return; // the Glass is on top; it closes itself
      const s = useSession.getState();
      if (!s.panel) return;
      e.stopPropagation();
      s.closePanel();
    };
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e) || withModifier(e) || e.repeat) return;
      const digit = /^Digit([1-9])$/.exec(e.code)?.[1];
      if (digit && !modalOpen() && !document.querySelector(".glass")) {
        if (e.shiftKey ? stepIntoDoorCorridor(Number(digit)) : goThroughDoor(Number(digit))) e.preventDefault();
      }
      // Space pauses and resumes time, unless it's pressing a button or going on with spoken lines.
      const onControl = e.target instanceof HTMLElement && !!e.target.closest("button, a, [role='button']");
      if (e.key === " " && !onControl && !modalOpen() && !document.querySelector(".lines")) {
        const s = useSession.getState();
        if (!s.roomId) return;
        e.preventDefault();
        s.setPaused(!s.paused);
      }
    };
    window.addEventListener("keydown", onEscape, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onEscape, true);
      window.removeEventListener("keydown", onKey);
    };
  }, []);
}

/**
 * The room's labels are HTML placed over the 3D scene, added in the order the scene mounts them. They
 * carry a rank (`data-tab`): this keeps them in rank order in the page, so Tab visits them in that order.
 */
function useWorldTabOrder() {
  useEffect(() => {
    const world = document.querySelector<HTMLElement>(".world");
    if (!world) return;
    // A label with no rank of its own (a newer chip) goes among the furniture.
    const LABEL = "[data-tab], .world-chip, .plate";
    const rank = (el: Element) => {
      const r = el.querySelector(LABEL)?.getAttribute("data-tab");
      return r ? Number(r) : TAB.furniture + 50;
    };
    let queued = 0;
    const sort = () => {
      queued = 0;
      const ranked = [...world.children].filter((el) => el.querySelector(LABEL));
      const sorted = [...ranked].sort((a, b) => rank(a) - rank(b));
      if (sorted.every((el, i) => el === ranked[i])) return;
      const focused = document.activeElement;
      for (const el of sorted) world.appendChild(el);
      // Moving an element drops its focus; give it back.
      if (focused instanceof HTMLElement && focused !== document.activeElement && focused.isConnected)
        focused.focus({ preventScroll: true });
    };
    const observer = new MutationObserver(() => {
      if (!queued) queued = requestAnimationFrame(sort);
    });
    observer.observe(world, { childList: true, subtree: true });
    sort();
    return () => {
      observer.disconnect();
      if (queued) cancelAnimationFrame(queued);
    };
  }, []);
}

export function Keyboard() {
  useKeys();
  usePanelFocus();
  useWorldTabOrder();
  return null;
}
