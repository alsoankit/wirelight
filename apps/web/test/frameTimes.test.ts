import { describe, expect, it } from "vitest";
import { FrameTimes } from "../src/render/frameTimes";

/** Frame times fed `deltas` (seconds), one frame each. */
const fed = (deltas: number[]) => {
  const f = new FrameTimes();
  for (const d of deltas) f.add(d);
  return f;
};
const frames = (n: number, delta: number) => Array.from({ length: n }, () => delta);

describe("frame times (the play logs)", () => {
  it("has no median before the first frame", () => {
    expect(new FrameTimes().median()).toBeNull();
  });

  it("takes the median in whole milliseconds, so one long frame among quick ones doesn't move it", () => {
    expect(fed([...frames(10, 0.016), 0.1]).median()).toBe(16);
    expect(fed([0.0101, 0.0204, 0.0298]).median()).toBe(20);
  });

  it("ignores what isn't a frame: no time, a negative or NaN one, a tab coming back after a pause", () => {
    expect(fed([0, -0.016, Number.NaN, 1.5]).median()).toBeNull();
    expect(fed([0.033, 0, -0.016, Number.NaN, 1.5, 1.5, 1.5]).median()).toBe(33);
  });

  it("counts every very slow frame as 250 ms", () => {
    expect(fed([0.9]).median()).toBe(250);
    expect(fed([0.016, 0.3, 1]).median()).toBe(250);
  });

  it("starts over when cleared", () => {
    const f = fed(frames(5, 0.05));
    f.clear();
    expect(f.median()).toBeNull();
    f.add(0.02);
    expect(f.median()).toBe(20);
  });
});
