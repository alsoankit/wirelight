import { roomTexts } from "@wirelight/content";
import { roomById } from "@wirelight/rooms";

// The rooms and their texts, for the landing's main button ("Play <room>", "Continue: <room>").
// Loaded just after the landing's first paint (App.tsx), so the landing's own chunk carries neither
// the rooms (and the simulator they bring) nor every room's text; the game needs both next anyway.

/** The room a `/play/<room>` link names, if it is a real room. */
export function linkedRoom(path: string): string | undefined {
  const match = path.match(/^\/play\/(.+)$/);
  const id = match?.[1] ? decodeURIComponent(match[1]) : undefined;
  return id && roomById(id) ? id : undefined;
}

export function roomTitle(id: string | null | undefined): string | undefined {
  return id ? roomTexts[roomById(id)?.content ?? ""]?.title : undefined;
}
