import { describe, expect, it } from "vitest";
import { labelShifts } from "../src/world/room/Declutter";

const box = (left: number, top: number, w = 200, h = 26) => ({ left, top, right: left + w, bottom: top + h });

describe("labels step aside", () => {
  it("leaves a label with room around it where it is", () => {
    expect(labelShifts([box(0, 0), box(0, 100)], [box(400, 0, 80)])).toEqual([
      [0, 0],
      [0, 0],
    ]);
  });

  it("moves the lower of two overlapping plates just clear of the other", () => {
    // 7.B: eth0's plate and eth5's land nearly on top of each other.
    const [a, b] = labelShifts([box(0, 0), box(60, 10)], []);
    expect(a).toEqual([0, 0]);
    expect(b).toEqual([0, 26 - 10 + 4]);
  });

  it("takes the shortest way clear, never onto a label that stays", () => {
    const chip = box(150, 100, 80, 24);
    // Down 18 px is shorter than sideways (−54 px) or up (−40 px).
    expect(labelShifts([box(0, 110)], [chip])).toEqual([[0, 124 - 110 + 4]]);
    const m = box(0, 124 + 4);
    expect(m.top >= chip.bottom || m.bottom <= chip.top || m.right <= chip.left || m.left >= chip.right).toBe(true);
  });

  it("goes sideways when that is shorter", () => {
    const tall = box(190, -200, 40, 500);
    expect(labelShifts([box(0, 0)], [tall])).toEqual([[190 - 200 - 4, 0]]);
  });

  it("stays put rather than travel far from its door", () => {
    const wall = [box(-300, -300, 800, 800)];
    expect(labelShifts([box(0, 0)], wall)).toEqual([[0, 0]]);
  });
});
