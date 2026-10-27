import { afterEach, describe, expect, it, vi } from "vitest";
import { fpsFromUrl, scaleFromUrl } from "../src/render/quality";

// The tests run in Node: stand in a window with just the page address's query.
const at = (search: string) => vi.stubGlobal("window", { location: { search } });

afterEach(() => vi.unstubAllGlobals());

describe("quality from the address", () => {
  it("reads ?scale= and keeps it within 0.1–1", () => {
    at("?scale=0.5");
    expect(scaleFromUrl()).toBe(0.5);
    at("?scale=0.01");
    expect(scaleFromUrl()).toBe(0.1);
    at("?scale=3");
    expect(scaleFromUrl()).toBe(1);
  });

  it("reads ?fps= and keeps it within 2–60", () => {
    at("?fps=6");
    expect(fpsFromUrl()).toBe(6);
    at("?fps=1");
    expect(fpsFromUrl()).toBe(2);
    at("?fps=240");
    expect(fpsFromUrl()).toBe(60);
  });

  it("gives nothing without the parameter, or with a value that is not a positive number", () => {
    at("");
    expect(scaleFromUrl()).toBeUndefined();
    expect(fpsFromUrl()).toBeUndefined();
    at("?scale=abc&fps=0");
    expect(scaleFromUrl()).toBeUndefined();
    expect(fpsFromUrl()).toBeUndefined();
  });
});
