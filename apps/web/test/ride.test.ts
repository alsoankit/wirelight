import { floorDefs } from "@wirelight/rooms";
import { describe, expect, it } from "vitest";
import { recordRide } from "../src/play/ride";

const ride = (floor: number) => {
  const boss = floorDefs.find((f) => f.floor === floor)?.boss as string;
  const r = recordRide(boss);
  if (!r) throw new Error(boss);
  return r.stops;
};

describe("a ride-along (0036): one message through the floor, from a real trace", () => {
  it("rides every floor's boss solution to the player's machine", () => {
    for (const f of floorDefs) {
      const stops = ride(f.floor);
      expect(stops.length, f.boss).toBeGreaterThan(0);
      expect(stops.at(-1)?.end, f.boss).toBe("arrived");
    }
  });

  it("names the doors on the frame (Floor 1: lantern's door to yours)", () => {
    const [stop] = ride(1);
    expect(stop?.frame.from.device).toBe("lantern");
    expect(stop?.frame.to).toMatchObject({ device: "observatory", iface: "eth0" });
  });

  it("passes through a switch unchanged (Floor 3)", () => {
    expect(ride(3).map((s) => s.change)).toEqual([null, "passed"]);
  });

  it("at each crossing: a new frame, the same addresses, the countdown one less (Floor 9)", () => {
    const stops = ride(9);
    const crossings = stops.filter((s) => s.change === "crossing");
    expect(crossings.length).toBeGreaterThanOrEqual(6);
    for (const c of crossings) {
      expect(c.changed.packetFrom || c.changed.packetTo).toBe(false);
      expect(c.changed.ttl).toBe(true);
      expect(c.packet?.ttl).toBe((c.ttlWas ?? 0) - 1);
    }
    // The ping arrives at halo, and the answer sets off home.
    expect(stops.find((s) => s.end === "delivered")?.to).toBe("halo");
    expect(stops.filter((s) => s.change === "turn")).toHaveLength(1);
  });
});
