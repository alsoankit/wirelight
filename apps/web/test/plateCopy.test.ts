import { describe, expect, it, vi } from "vitest";
import { copyPlateValue, plateValues } from "../src/world/plateCopy";

describe("plate copy action", () => {
  it("writes only the selected plate value to the clipboard", async () => {
    const writeText = vi.fn(async (_value: string) => {});
    await copyPlateValue("02:00:00:00:00:05", { writeText });
    expect(writeText).toHaveBeenCalledExactlyOnceWith("02:00:00:00:00:05");
  });

  it("keeps the closed plate to its name and light, exposing values only when opened", () => {
    expect(plateValues(false, "02:00:00:00:00:05", ["10.0.0.5/24"])).toEqual([]);
    expect(plateValues(true, "02:00:00:00:00:05", ["10.0.0.5/24"])).toEqual([
      { kind: "MAC", value: "02:00:00:00:00:05" },
      { kind: "address", value: "10.0.0.5/24" },
    ]);
  });
});
