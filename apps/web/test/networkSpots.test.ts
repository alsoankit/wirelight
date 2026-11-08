import { roomById } from "@wirelight/rooms";
import { describe, expect, it } from "vitest";
import { networkSpots } from "../src/world/network/spots";

describe("bird's-eye network layout", () => {
  it("places every machine from the room topology and marks the player's machine", () => {
    const room = roomById("p.first-message");
    if (!room) throw new Error("Expected the first room to exist");
    const spots = networkSpots(room);
    expect([...spots.keys()].sort()).toEqual(room.topology.devices.map((d) => d.id).sort());
    expect(spots.get(room.playerDevice)?.kind).toBe("you");
    for (const spot of spots.values()) {
      expect(spot.at.every(Number.isFinite)).toBe(true);
    }
  });
});
