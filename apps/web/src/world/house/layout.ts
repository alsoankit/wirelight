import type { RegionId } from "../region";
import { CATHEDRAL_HOUSE_PIECES, cathedralHouse } from "../regions/cathedral";
import { HALLS_HOUSE_PIECES, hallsHouse } from "../regions/halls";
import { TOWN_HOUSE_PIECES, townHouse } from "../regions/town";
import { worksHouse } from "../regions/works";
import type { RoomLayout } from "../room/layout";
import { withStubs } from "../room/stubs";

// Another machine's room (a computer: kitchen, library…): one arch in the back wall where the
// corridor comes in (0116). Same 8 × 8 m frame as the Observatory, so the camera and the doorways line up the same
// way. Each region dresses it its own way (regions/halls.ts for Region 1).

/** Every piece a computer's room can use, in every region (for preloading). */
export const HOUSE_PIECES = [...HALLS_HOUSE_PIECES, ...TOWN_HOUSE_PIECES, ...CATHEDRAL_HOUSE_PIECES];

export function houseLayout(region: RegionId = 1): RoomLayout {
  const frame = {
    // A computer's one door, the way back, is the arch in the back wall (0116: never the near edge).
    doorSlots: [{ wall: "back", at: 0 }] as RoomLayout["doorSlots"],
    keeper: [0, 0, -0.8] as RoomLayout["keeper"],
    air: { min: [-3.4, 0.4, -3.4], max: [3.4, 3.0, 3.4] } as RoomLayout["air"],
  };
  const regional =
    region === 2 ? worksHouse() : region === 3 ? townHouse() : region === 4 ? cathedralHouse() : hallsHouse();
  const room: RoomLayout = { ...frame, ...regional };
  // The corridor's first stretch behind the arch (0119).
  return withStubs(room, region, frame.doorSlots);
}
