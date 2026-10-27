import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadingBegin, loadingCancel, loadingDone, loadingProgress, useLoading } from "../src/render/loading";

// The tests run in Node: hand the module a window whose timers are the (faked) global ones.
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("window", {
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
  });
  useLoading.setState({ shown: false, progress: 0, roomId: null });
});

afterEach(() => {
  loadingCancel();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("loading screen", () => {
  it("shows only once a room has taken 350 ms", () => {
    loadingBegin("1.1");
    vi.advanceTimersByTime(349);
    expect(useLoading.getState().shown).toBe(false);
    vi.advanceTimersByTime(1);
    expect(useLoading.getState().shown).toBe(true);
  });

  it("never shows for a room that is ready in time", () => {
    loadingBegin("1.1");
    vi.advanceTimersByTime(200);
    loadingDone();
    vi.advanceTimersByTime(5000);
    expect(useLoading.getState().shown).toBe(false);
    expect(useLoading.getState().progress).toBe(1);
  });

  it("hides at once when the load is abandoned", () => {
    loadingBegin("1.1");
    vi.advanceTimersByTime(400);
    expect(useLoading.getState().shown).toBe(true);
    loadingCancel();
    expect(useLoading.getState().shown).toBe(false);
  });

  it("hides some time after a shown load is done", () => {
    loadingBegin("1.1");
    vi.advanceTimersByTime(400);
    loadingDone();
    expect(useLoading.getState().shown).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(useLoading.getState().shown).toBe(false);
  });

  it("never moves the bar backwards, and caps it at 1", () => {
    loadingBegin("1.1");
    loadingProgress(0.6);
    loadingProgress(0.3);
    expect(useLoading.getState().progress).toBe(0.6);
    loadingProgress(2);
    expect(useLoading.getState().progress).toBe(1);
  });
});
