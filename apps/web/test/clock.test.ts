import { describe, expect, it } from "vitest";
import {
  CROWD,
  CROWD_RATE,
  type Crossing,
  nextNetworkTime,
  progress,
  SCREEN_MS_PER_CROSSING,
} from "../src/engine/clock";

const crossing = (enter: number, arriveAt: number): Crossing => ({
  frameId: 1,
  link: "wire",
  dir: 0,
  from: "observatory",
  to: "lantern",
  bytes: new Uint8Array(),
  enter,
  arriveAt,
  summary: "",
});

describe("the presentation clock (CORE-42)", () => {
  it("runs at real speed with nothing on a cable, scaled by speed", () => {
    expect(nextNetworkTime(1000, [], 16, 1)).toBe(1016);
    expect(nextNetworkTime(1000, [], 16, 4)).toBe(1064);
  });

  it("makes a crossing take about 900 ms of screen time, however short it really is", () => {
    const c = crossing(5, 5.055);
    let now = 5;
    let screen = 0;
    while (progress(c, now) < 1) {
      now = nextNetworkTime(now, [c], 16, 1);
      screen += 16;
    }
    expect(screen).toBeGreaterThanOrEqual(SCREEN_MS_PER_CROSSING);
    expect(screen).toBeLessThan(SCREEN_MS_PER_CROSSING + 32);
  });

  it("paces by the shortest crossing on screen", () => {
    const slow = crossing(0, 1);
    const fast = crossing(0, 0.1);
    expect(nextNetworkTime(0, [slow, fast], 900, 1)).toBeCloseTo(0.1);
  });

  it("keeps time moving in a crowd (a storm), at least CROWD_RATE of real speed", () => {
    const many = Array.from({ length: CROWD + 1 }, () => crossing(0, 0.05));
    expect(nextNetworkTime(0, many, 1000, 1)).toBeCloseTo(1000 * CROWD_RATE);
    const few = Array.from({ length: CROWD }, () => crossing(0, 0.05));
    expect(nextNetworkTime(0, few, 1000, 1)).toBeLessThan(1);
  });
});
