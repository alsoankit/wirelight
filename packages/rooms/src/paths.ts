/**
 * Paths (0009, CORE-05): which rooms are on the player's main route. Skipped rooms stay playable as
 * optional, and still count as having taught their terms and tools.
 * - New to networking: every room.
 * - Know a little: building blocks are skipped.
 * - Know networking: building blocks and core rooms are skipped (bosses and rooms that bring a new
 *   tool stay, because a boss can't expect a command the player has never met).
 */
import type { RoomDef } from "./types";

export type Path = "new" | "little" | "networking";

export function onPath(room: RoomDef, path: Path): boolean {
  if (path === "new") return true;
  if (room.pathTag === "building-block") return false;
  if (path === "networking" && room.pathTag === "core") return false;
  return true;
}

/** The next room on the path after `id` (in play order), or undefined at the end. */
export function nextOnPath(all: readonly RoomDef[], id: string, path: Path): RoomDef | undefined {
  const i = all.findIndex((r) => r.id === id);
  return all.slice(i + 1).find((r) => onPath(r, path));
}
