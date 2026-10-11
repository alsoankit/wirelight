import firstLight from "./floor0/first-light";
import lightsOut from "./floor0/lights-out";
import silentLine from "./floor0/silent-line";
import whoAreYou from "./floor0/who-are-you";
import wrongName from "./floor0/wrong-name";
import firstMessage from "./prologue/first-message";
import type { RoomDef } from "./types";

export * from "./content/cards";
export * from "./content/floors";
export * from "./content/guide";
export * from "./content/intro";
export * from "./content/keys";
export * from "./content/shell";
export * from "./predicates";
export * from "./types";

/** Every room, in play order. */
export const rooms: RoomDef[] = [firstMessage, firstLight, wrongName, lightsOut, whoAreYou, silentLine];

export function roomById(id: string): RoomDef | undefined {
  return rooms.find((r) => r.id === id);
}

export function nextRoom(id: string): RoomDef | undefined {
  const i = rooms.findIndex((r) => r.id === id);
  return i >= 0 ? rooms[i + 1] : undefined;
}
export * from "./content/fields";
export * from "./content/voice";
export * from "./runner";
export * from "./tools";
