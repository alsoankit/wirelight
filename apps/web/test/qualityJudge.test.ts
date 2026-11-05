import { describe, expect, it } from "vitest";
import { qualityJudge, type Step } from "../src/render/qualityJudge";

/** Frames of these lengths (seconds) in one place, no wave: the judge's answer to each. */
const judged = (frames: number[]): Step[] => {
  const judge = qualityJudge();
  return frames.map((delta) => judge(delta, "f8.other-street:observatory", false));
};
const frames = (seconds: number, delta: number) => Array.from({ length: Math.round(seconds / delta) }, () => delta);

describe("automatic quality's judge (0020)", () => {
  it("steps down when every frame takes over half a second, as drawing in software does", () => {
    // 8.1 on a machine without a GPU: about 1.5 frames a second.
    const steps = judged(frames(30, 0.65));
    const first = steps.indexOf("down");
    expect(first).toBeGreaterThan(-1);
    expect(first * 0.65).toBeLessThan(12);
    expect(steps.filter((s) => s === "down").length).toBeGreaterThanOrEqual(2);
  });

  it("still takes a long frame among quick ones for a hitch, and starts the count over", () => {
    const slow = 1 / 30;
    const steady = judged([...frames(6, slow), ...frames(12, slow)]).indexOf("down");
    const hitched = judged([...frames(6, slow), 0.8, ...frames(12, slow)]).indexOf("down");
    expect(steady).toBeGreaterThan(-1);
    // After the hitch it settles again (3 s) before it judges another window.
    expect(hitched).toBeGreaterThan(steady + 3 / slow);
  });

  it("steps up when frames stay fast, and never down", () => {
    const steps = judged(frames(20, 1 / 60));
    expect(steps).toContain("up");
    expect(steps).not.toContain("down");
  });
});
