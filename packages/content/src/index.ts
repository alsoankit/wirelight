// All player-facing text (tech/architecture.md): rooms, the shell, the world and the interface refer to
// it by id. Text follows the voice rules (world/voice.md); plain modern English.
import { bothEnds, darkCorridor, floor1, looseCable, twoRooms } from "./rooms/floor1";
import { firstLight, floor2, lightsOut, silentLine, whoAreYou, wrongName } from "./rooms/floor2";
import { firstMessage } from "./rooms/prologue";
import { region2FloorTexts, region2Texts } from "./rooms/region2";
import { region3FloorTexts, region3Texts } from "./rooms/region3";
import { region4FloorTexts, region4Texts } from "./rooms/region4";
import { why48Bits } from "./rooms/secrets1";
import type { FloorText, RoomText } from "./rooms/types";

export * from "./cards";
export * from "./commands";
export * from "./fields";
export * from "./floors";
export * from "./guide";
export * from "./intro";
export * from "./keys";
export { region2Arrival } from "./rooms/region2";
export { REGION_3_ARRIVAL as region3Arrival } from "./rooms/region3";
export { firstReleaseEnding, region4Arrival } from "./rooms/region4";
export type { FloorText, Hint, RoomText } from "./rooms/types";
export * from "./shell";
export * from "./voice";
export * from "./world";

/** Each room's text, by room id. */
export const roomTexts: Record<string, RoomText> = {
  "p.first-message": firstMessage,
  "f1.two-rooms": twoRooms,
  "f1.loose-cable": looseCable,
  "f1.both-ends": bothEnds,
  "f1.boss-dark-corridor": darkCorridor,
  "f2.first-light": firstLight,
  "f2.wrong-name": wrongName,
  "f2.who-are-you": whoAreYou,
  "f2.lights-out": lightsOut,
  "f2.boss-silent-line": silentLine,
  "f2.secret-48-bits": why48Bits,
  ...region2Texts,
  ...region3Texts,
  ...region4Texts,
};

/** Each floor's own text (floor memory, journal page, farewell), by floor number. */
export const floorTexts: Record<number, FloorText> = {
  1: floor1,
  2: floor2,
  ...region2FloorTexts,
  ...region3FloorTexts,
  ...region4FloorTexts,
};

/** Every term the game teaches, from the debriefs that teach it (0015): id → word and meaning. */
export const terms: Record<string, { term: string; meaning: string; room: string }> = Object.fromEntries(
  Object.entries(roomTexts).flatMap(([room, t]) =>
    t.debrief.terms.map((x) => [x.id, { term: x.term, meaning: x.meaning, room }] as const),
  ),
);

/** Fills `{name}` placeholders. A placeholder with no value is left as it is (the validator catches it). */
export function fill(text: string, vars: Readonly<Record<string, string>> = {}): string {
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => vars[name] ?? whole);
}

/** Every `{name}` placeholder in a room's text. */
export function placeholders(text: RoomText): Set<string> {
  const all = JSON.stringify(text);
  return new Set([...all.matchAll(/\{(\w+)\}/g)].map((m) => m[1] as string));
}
