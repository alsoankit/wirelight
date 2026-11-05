import { describe, expect, it } from "vitest";
import { roomAddress } from "../src/play/address";

describe("the address while a room is played (ONB-20)", () => {
  it("leaves a link's own room behind once the player moves on, keeping the other options", () => {
    expect(roomAddress("https://example.org/play/f1.two-rooms?tier=simple", "p.first-message")).toBe(
      "https://example.org/play?tier=simple&room=p.first-message",
    );
  });

  it("moves ?room= on to the room being played", () => {
    expect(roomAddress("http://localhost:5173/play?room=f1.two-rooms&onboarded=1", "f1.loose-cable")).toBe(
      "http://localhost:5173/play?room=f1.loose-cable&onboarded=1",
    );
  });
});
