import { useFrame, useThree } from "@react-three/fiber";
import { useRef } from "react";

// Labels in the world never cover each other (7.B's census square: with eight doors, the plates of the
// two doors beside the back corner land on the same spot at this camera). A few times a second the
// room's labels are measured on screen, and any that overlaps another slides just far enough to clear
// it (the shortest move wins). Chips (the ways through doorways, the furniture's names) are placed
// first, then the door plates; the street sign and house numbers stay put. Nothing in the world moves:
// only the label's HTML box, so a label with room around it keeps its place.

const EVERY = 0.1;
const GAP = 4;
/** Further than this and a label would read as another door's: it stays where it is. */
const MAX_SHIFT = 120;
const FIXED = ".town-sign, .town-number";
/** Placed in this order: the small chips first, so they move least. */
const MOVING = [".world-chip", ".plate"];

type Box = { left: number; right: number; top: number; bottom: number };
type Shift = [dx: number, dy: number];

/** A plain copy (a DOMRect's sides are getters: spreading one copies nothing). */
const boxOf = (el: Element): Box => {
  const { left, right, top, bottom } = el.getBoundingClientRect();
  return { left, right, top, bottom };
};

/** Where a label would be without its shift (the shift as drawn now, even halfway through sliding). */
const unmoved = (el: HTMLElement): Box => {
  const b = boxOf(el);
  const [dx = 0, dy = 0] = getComputedStyle(el)
    .translate.split(" ")
    .map((v) => Number.parseFloat(v) || 0);
  return { left: b.left - dx, right: b.right - dx, top: b.top - dy, bottom: b.bottom - dy };
};

const moved = (b: Box, [dx, dy]: Shift): Box => ({
  left: b.left + dx,
  right: b.right + dx,
  top: b.top + dy,
  bottom: b.bottom + dy,
});

const hits = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/**
 * The shift (px) for each label, given where it would be unmoved and the boxes already placed (the
 * labels that stay, and earlier groups). Adds each label, moved, to `placed`.
 */
export function labelShifts(labels: Box[], placed: Box[]): Shift[] {
  const shifts = labels.map((): Shift => [0, 0]);
  const order = labels.map((box, i) => ({ box, i })).sort((a, b) => a.box.top - b.box.top);
  for (const { box: p, i } of order) {
    // Tested a hair inside the gap, so a label set exactly GAP clear of another counts as clear.
    const clear = (s: Shift) => {
      const m = moved(p, s);
      const padded = {
        left: m.left - GAP + 0.5,
        right: m.right + GAP - 0.5,
        top: m.top - GAP + 0.5,
        bottom: m.bottom + GAP - 0.5,
      };
      return !placed.some((o) => hits(padded, o));
    };
    // Every way to sit just clear of a placed box's edge, across and down.
    const near = placed.filter((o) =>
      hits(o, {
        left: p.left - MAX_SHIFT,
        right: p.right + MAX_SHIFT,
        top: p.top - MAX_SHIFT,
        bottom: p.bottom + MAX_SHIFT,
      }),
    );
    const xs = [0, ...near.flatMap((o) => [o.right - p.left + GAP, o.left - p.right - GAP])];
    const ys = [0, ...near.flatMap((o) => [o.bottom - p.top + GAP, o.top - p.bottom - GAP])];
    let best: Shift = [0, 0];
    let bestLength = Number.POSITIVE_INFINITY;
    for (const dx of xs)
      for (const dy of ys) {
        const length = Math.hypot(dx, dy);
        if (length < bestLength && length <= MAX_SHIFT && clear([dx, dy])) {
          best = [dx, dy];
          bestLength = length;
        }
      }
    shifts[i] = best;
    placed.push(moved(p, best));
  }
  return shifts;
}

function declutter(root: Element) {
  const placed: Box[] = [];
  for (const el of root.querySelectorAll(FIXED)) {
    const b = boxOf(el);
    if (b.right > b.left) placed.push(b);
  }
  for (const group of MOVING) {
    const labels = [...root.querySelectorAll<HTMLElement>(group)].filter((el) => el.getBoundingClientRect().width > 0);
    const shifts = labelShifts(labels.map(unmoved), placed);
    labels.forEach((el, i) => {
      const [dx, dy] = shifts[i] ?? [0, 0];
      const want = dx || dy ? `${Math.round(dx)}px ${Math.round(dy)}px` : "";
      if (el.style.translate !== want) el.style.translate = want;
    });
  }
}

export function Declutter() {
  // Where drei's Html puts the labels.
  const root = useThree((s) => (s.events.connected ?? s.gl.domElement.parentNode) as Element | null);
  const since = useRef(EVERY);
  useFrame((_, delta) => {
    since.current += delta;
    if (!root || since.current < EVERY) return;
    since.current = 0;
    declutter(root);
  });
  return null;
}
