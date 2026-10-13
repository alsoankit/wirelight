import type { ToolId } from "@wirelight/shell";
import type { RoomDef } from "./types";

const place = (r: RoomDef) => r.floor * 100 + r.order;

/**
 * Tools available in a room: everything every earlier room introduced, plus this room's own,
 * minus the room's restrictions (floors/overview.md "Tools, in the order they arrive"). A room a
 * path skips still counts as having introduced its tools (0009). Derived, never stored.
 */
export function toolsIn(room: RoomDef, all: readonly RoomDef[]): Set<ToolId> {
  const out = new Set<ToolId>();
  for (const r of all) if (place(r) <= place(room)) for (const t of r.tools.unlock ?? []) out.add(t);
  for (const t of room.tools.restrict ?? []) out.delete(t);
  return out;
}
