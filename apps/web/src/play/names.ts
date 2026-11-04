import { fill, voice } from "@wirelight/content";
import type { RoomDef as Room } from "@wirelight/rooms";
import { peel } from "@wirelight/sim";

// Saying who a message is for, as far as the player has learned (vision: nothing used before it's
// taught). Door names (MACs) arrive on Floor 2; before that a door is called by its machine's name.

const BROADCAST = "ff:ff:ff:ff:ff:ff";

/** The floor that teaches door names (floors/floor-2.md). */
export const DOOR_NAMES_FLOOR = 2;

/** Before Floor 2: a door name → its machine's name. From Floor 2 on: undefined (say the MAC). */
export function machineNamer(room: Room | undefined): ((mac: string) => string | undefined) | undefined {
  if (!room || room.floor >= DOOR_NAMES_FLOOR) return undefined;
  const byMac = new Map<string, string>();
  for (const d of room.topology.devices) for (const i of d.interfaces) byMac.set(i.mac.toLowerCase(), d.id);
  return (mac) => (mac === BROADCAST ? voice.names.everyone : byMac.get(mac.toLowerCase()));
}

/** A door name as the player can read it now: its machine's name (or everyone) before Floor 2, else the MAC. */
export function sayDoor(mac: string, room: Room | undefined): string {
  return machineNamer(room)?.(mac) ?? mac;
}

/**
 * What a message is, in plain words, before the Scanner (Floor 6): only who it's to and who it's from,
 * read from its frame. No tcpdump text, no ethertypes: those come with the Scanner.
 */
export function plainSummary(bytes: Uint8Array | undefined, room: Room | undefined): string {
  if (!bytes) return "";
  const [frame] = peel(bytes);
  if (frame?.layer !== "frame") return "";
  return fill(voice.names.toFrom, { to: sayDoor(frame.to, room), from: sayDoor(frame.from, room) });
}

/** An arrival, in plain words: who it was to and from, and a plain lab message's text (quoted). */
export function arrivalText(bytes: Uint8Array, room: Room | undefined): string {
  const [, inner] = peel(bytes);
  const text = inner?.layer === "message" && inner.kind === "lab" ? ` · “${inner.text}”` : "";
  return `${plainSummary(bytes, room)}${text}`;
}

/**
 * A street's colour on plates and boards (art-briefs/region-3: the street part stands out; floor-7.md:
 * "the amber street parts don't match"). Warm, from the amber family, distinct per street, never cyan
 * (alive) or violet (lab). Picked by the street's last number, so neighbouring streets always differ.
 */
export const STREET_COLOURS = ["#f2a93b", "#ee7f5a", "#e6d06a", "#e993a9", "#c98b4e"] as const;

export function streetColour(street: string): string {
  const last = Number(street.split(".").at(-1));
  const i = Number.isFinite(last) ? last : [...street].reduce((n, ch) => n + ch.charCodeAt(0), 0);
  return STREET_COLOURS[(i + STREET_COLOURS.length - 1) % STREET_COLOURS.length] as string;
}
