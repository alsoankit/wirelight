import { cards } from "@wirelight/content";
import { describe, expect, it } from "vitest";
import { renameCards } from "../src/progress/renamedCards";

describe("cards found under an old id (saved progress)", () => {
  it("count as found under their new id, in the same order", () => {
    expect(renameCards(["cable", "slate", "packet"])).toEqual(["cable", "scanner", "packet"]);
  });

  it("are kept once if the new id was saved too", () => {
    expect(renameCards(["scanner", "slate"])).toEqual(["scanner"]);
  });

  it("leave every current card id as it is", () => {
    const ids = Object.keys(cards);
    expect(renameCards(ids)).toEqual(ids);
  });
});
