import type { RegionId } from "../region";
import { CATHEDRAL_HOUSE_PIECES, cathedralHouse } from "../regions/cathedral";
import { HALLS_HOUSE_PIECES, hallsHouse } from "../regions/halls";
import { TOWN_HOUSE_PIECES, townHouse } from "../regions/town";
import { worksHouse } from "../regions/works";
import type { RoomLayout } from "../room/layout";

// Another machine's room (a computer: kitchen, library…): one doorway on the near edge where the
// corridor comes in (0111). Same 8 × 8 m frame as the Observatory, so the camera and the doorways line up the same
// way. Each region dresses it its own way (regions/halls.ts for Region 1).

/** Every piece a computer's room can use, in every region (for preloading). */
export const HOUSE_PIECES = [...HALLS_HOUSE_PIECES, ...TOWN_HOUSE_PIECES, ...CATHEDRAL_HOUSE_PIECES];

export function houseLayout(region: RegionId = 1): RoomLayout {
  const frame = {
    // A computer's one door is always the way back toward the player: the near edge (0111).
    doorSlots: [{ wall: "front", at: -1.8 }] as RoomLayout["doorSlots"],
    keeper: [0, 0, -0.8] as RoomLayout["keeper"],
    air: { min: [-3.4, 0.4, -3.4], max: [3.4, 3.0, 3.4] } as RoomLayout["air"],
  };
  if (region === 2) return { ...frame, ...worksHouse() };
  if (region === 3) return { ...frame, ...townHouse() };
  if (region === 4) return { ...frame, ...cathedralHouse() };
  return { ...frame, ...hallsHouse() };
}
