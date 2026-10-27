import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { rooms } from "@wirelight/rooms";
import { describe, expect, it } from "vitest";
import { emblemUrl } from "../src/world/room/emblems";

const publicDir = fileURLToPath(new URL("../public", import.meta.url));
const regions = [...new Set(rooms.map((r) => r.region))];

describe("room emblems", () => {
  it("gives neighbouring rooms in a region different emblems for the same machine slot", () => {
    for (const region of regions) {
      const inRegion = rooms.filter((r) => r.region === region);
      for (const [i, b] of inRegion.entries()) {
        const a = inRegion[i - 1];
        if (!a) continue;
        // The first machine of each room has device index 0 in both.
        const ua = emblemUrl(region, a.id, a.topology.devices[0]?.id ?? "");
        const ub = emblemUrl(region, b.id, b.topology.devices[0]?.id ?? "");
        expect(ua, `${a.id} vs ${b.id}`).not.toBe(ub);
      }
    }
  });

  it("gives every machine in one room its own emblem", () => {
    for (const room of rooms) {
      const urls = room.topology.devices.map((d) => emblemUrl(room.region, room.id, d.id));
      expect(new Set(urls).size, room.id).toBe(urls.length);
    }
  });

  it("points only at painted files that exist", () => {
    for (const room of rooms) {
      for (const d of room.topology.devices) {
        const url = emblemUrl(room.region, room.id, d.id);
        expect(url).toMatch(new RegExp(`^/art/emblems/r${room.region}-(0\\d|1[01])\\.webp$`));
        expect(existsSync(publicDir + url), url).toBe(true);
      }
    }
  });
});
