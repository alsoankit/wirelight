import { region1Floors, region1Rooms } from "./region1";
import { region2Floors, region2Rooms } from "./region2";
import { region3Floors, region3Rooms } from "./region3";
import { region4Floors, region4Rooms } from "./region4";
import type { FloorDef, RoomDef } from "./types";

export * from "./predicates";
export * from "./runner";
export * from "./tools";
export * from "./types";

/** Every room, in play order (region, floor, then order). */
export const rooms: RoomDef[] = [...region1Rooms, ...region2Rooms, ...region3Rooms, ...region4Rooms];

/** Floors with their rooms, boss and journal page (ROOM-09). The Prologue is floor 0 and has none. */
export const floorDefs: FloorDef[] = [...region1Floors, ...region2Floors, ...region3Floors, ...region4Floors];

export function roomById(id: string): RoomDef | undefined {
  return rooms.find((r) => r.id === id);
}

export function nextRoom(id: string): RoomDef | undefined {
  const i = rooms.findIndex((r) => r.id === id);
  return i >= 0 ? rooms[i + 1] : undefined;
}
