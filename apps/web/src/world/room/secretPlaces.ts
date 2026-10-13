import { floorDefs, type RoomDef } from "@wirelight/rooms";

// Where each secret room's door is found (decision 0072; SecretDoor.tsx draws it). Pure, for tests.

const PLACES: Record<string, { rooms?: string[]; device: string }> = {
  "f2.secret-48-bits": { rooms: ["f2.wrong-name"], device: "observatory" },
  "f4.secret-peacekeeper": { device: "hall-b" },
  "f7.secret-binary": { device: "square" },
  "f9.secret-home-router": { device: "spire" },
};

/** In the back corner, turned to face the room (the camera looks in from the front corner). */
export const AT: [number, number, number] = [-3.42, 0, -3.42];

/** The secret room whose door belongs in `device`'s room in `room`, if the floor's boss is cleared. */
export function secretHere(
  room: RoomDef,
  device: string,
  cleared: Record<string, unknown>,
  won: boolean,
): string | undefined {
  const floor = floorDefs.find((f) => f.secret && f.floor === room.floor);
  if (!floor?.secret) return undefined;
  const place = PLACES[floor.secret];
  if (!place) return undefined;
  const bossCleared = !!cleared[floor.boss] || (room.id === floor.boss && won);
  if (!bossCleared) return undefined;
  const inRoom = room.id === floor.boss || !!place.rooms?.includes(room.id);
  if (!inRoom) return undefined;
  // The boss room's own Observatory shows Region 1's door (2.2 is behind the player by then).
  if (floor.secret === "f2.secret-48-bits" && room.id === floor.boss)
    return device === "observatory" ? floor.secret : undefined;
  return device === place.device ? floor.secret : undefined;
}
