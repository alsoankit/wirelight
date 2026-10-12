// All player-facing text (tech/architecture.md): rooms, the shell, the world and the interface refer to
// it by id. Text follows the voice rules (world/voice.md); plain modern English.
import { firstLight, lightsOut, silentLine, whoAreYou, wrongName } from "./rooms/floor0";
import { firstMessage } from "./rooms/prologue";
import type { RoomText } from "./rooms/types";

export * from "./cards";
export * from "./fields";
export * from "./floors";
export * from "./guide";
export * from "./intro";
export * from "./keys";
export type { Hint, RoomText } from "./rooms/types";
export * from "./shell";
export * from "./voice";
export * from "./world";

/** Each room's text, by room id. */
export const roomTexts: Record<string, RoomText> = {
  "prologue.first-message": firstMessage,
  "f0.r1-first-light": firstLight,
  "f0.r2-wrong-name": wrongName,
  "f0.r3-lights-out": lightsOut,
  "f0.r4-who-are-you": whoAreYou,
  "f0.boss-silent-line": silentLine,
};

/** Fills `{name}` placeholders. A placeholder with no value is left as it is (the validator catches it). */
export function fill(text: string, vars: Readonly<Record<string, string>> = {}): string {
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => vars[name] ?? whole);
}

/** Every `{name}` placeholder in a room's text. */
export function placeholders(text: RoomText): Set<string> {
  const all = JSON.stringify(text);
  return new Set([...all.matchAll(/\{(\w+)\}/g)].map((m) => m[1] as string));
}
