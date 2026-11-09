import { describe, expect, it, vi } from "vitest";
import { copyPlateValue } from "../src/world/plateCopy";

describe("plate copy action", () => {
  it("writes only the selected plate value to the clipboard", async () => {
    const writeText = vi.fn(async (_value: string) => {});
    await copyPlateValue("02:00:00:00:00:05", { writeText });
    expect(writeText).toHaveBeenCalledExactlyOnceWith("02:00:00:00:00:05");
  });
});
