import { cards } from "@wirelight/content";
import { describe, expect, it, vi } from "vitest";
import { RENAMED_CARDS, renameCards } from "../src/progress/renamedCards";

// Saved progress, kept in a map here instead of the browser's IndexedDB.
const saved = vi.hoisted(() => new Map<string, string>());
vi.mock("idb-keyval", () => ({
  get: async (key: string) => saved.get(key),
  set: async (key: string, value: string) => {
    saved.set(key, value);
  },
  del: async (key: string) => {
    saved.delete(key);
  },
}));

describe("cards found under an old id (saved progress)", () => {
  it("count as found under their new id, in the same order", () => {
    expect(renameCards(["cable", "slate", "packet"])).toEqual(["cable", "scanner", "packet"]);
    expect(renameCards(["messenger", "capture-jar"])).toEqual(["messenger", "captures"]);
  });

  it("are kept once if the new id was saved too", () => {
    expect(renameCards(["scanner", "slate"])).toEqual(["scanner"]);
  });

  it("leave every current card id as it is", () => {
    const ids = Object.keys(cards);
    expect(renameCards(ids)).toEqual(ids);
  });

  it("each old id is gone, and its new id is a card", () => {
    for (const [old, now] of RENAMED_CARDS) {
      expect(cards[old], old).toBeUndefined();
      expect(cards[now], now).toBeDefined();
    }
  });

  it("are renamed when saved progress is read back", async () => {
    saved.set("wirelight-progress", JSON.stringify({ state: { cardsSeen: ["messenger", "capture-jar"] }, version: 1 }));
    const { useProgress } = await import("../src/progress/progress");
    await useProgress.persist.rehydrate();
    expect(useProgress.getState().cardsSeen).toEqual(["messenger", "captures"]);
  });
});
